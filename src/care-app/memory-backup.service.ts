import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../config';
import { MemoryBackup, MemoryService } from '../memory/memory.service';
import { SoulService, SOUL_DOCS, SoulDoc } from '../soul/soul.service';
import { StaffService } from '../staff/staff.service';
import { CareAppService } from './care-app.service';

const PUT = 'memory_backup_put';
const GET = 'memory_backup_get';
/** Wait for the app connection before the first check after a start. */
const FIRST_RUN_MS = 20_000;

/** The backup as stored in the app: the memory vaults plus Empathika's personality for this resident. */
export interface FullBackup extends MemoryBackup {
  soul?: Partial<Record<SoulDoc, string>>;
  journal?: { text: string; at: string }[];
}

export interface BackupStatus {
  lastBackupAt?: string;
  lastError?: string;
  lastRestore?: string;
}

/**
 * Keeps a copy of the resident's memories in the Empathika care app, so nothing is lost if the
 * box breaks or is replaced:
 *  - every MEMORY_BACKUP_MINUTES (when something changed), the whole memory goes to the app;
 *  - when a box starts with an empty memory, it fetches the backup and restores it on its own;
 *  - the control panel has "Back up now" and "Restore from the app".
 * The backup travels over the app connection (HTTPS in production); on the box the memories stay
 * encrypted as before.
 */
@Injectable()
export class MemoryBackupService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Backup');
  private timer?: NodeJS.Timeout;
  private backedUpRevision = -1;
  private running = false;
  readonly status: BackupStatus = {};

  constructor(
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
    private readonly memory: MemoryService,
    private readonly app: CareAppService,
    @Optional() private readonly soul?: SoulService,
    @Optional() private readonly staff?: StaffService,
  ) {}

  onModuleInit(): void {
    if (!this.app.configured || !this.memory.enabled) return;
    setTimeout(() => void this.firstRun(), FIRST_RUN_MS).unref?.();
    if (this.cfg.app.backupMinutes > 0) {
      this.timer = setInterval(() => void this.backup(), this.cfg.app.backupMinutes * 60_000);
      this.timer.unref?.();
    }
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  get available(): boolean {
    return this.app.connected && this.app.supports(PUT);
  }

  private async firstRun(): Promise<void> {
    const empty = this.memory.snapshot().every((v) => !v.items.length && !v.episodes.length);
    if (empty && this.app.supports(GET)) {
      const r = await this.restore('automatic: this box started with an empty memory');
      if (r.ok) return;
    }
    await this.backup();
  }

  /** Sends the memory to the app if it changed since the last backup (or always, when forced). */
  async backup(force = false): Promise<{ ok: boolean; message: string }> {
    if (!this.available) return { ok: false, message: this.app.connected ? 'The care app does not offer memory backups yet.' : 'The care app is not connected.' };
    if (this.running) return { ok: false, message: 'A backup is already running.' };
    const revision = this.memory.revision;
    if (!force && revision === this.backedUpRevision) return { ok: true, message: 'Nothing changed since the last backup.' };
    this.running = true;
    try {
      await this.memory.flush();
      const backup: FullBackup = { ...this.memory.exportBackup(), ...this.personality() };
      await this.app.system(PUT, { backup });
      this.backedUpRevision = revision;
      this.status.lastBackupAt = backup.takenAt;
      this.status.lastError = undefined;
      const n = backup.vaults.reduce((s, v) => s + v.items.length, 0);
      this.log.log(`Memory backed up to the care app (${n} facts)`);
      return { ok: true, message: `Backed up ${n} facts to the care app.` };
    } catch (err) {
      this.status.lastError = (err as Error).message;
      this.log.warn(`Memory backup failed: ${this.status.lastError}`);
      return { ok: false, message: `The backup failed: ${this.status.lastError}` };
    } finally {
      this.running = false;
    }
  }

  /** Fetches the backup from the app and adds whatever is missing here (nothing is overwritten). */
  async restore(why = 'asked on the control panel'): Promise<{ ok: boolean; message: string }> {
    if (!this.app.connected || !this.app.supports(GET)) return { ok: false, message: 'The care app is not connected, or does not offer backups yet.' };
    try {
      const got = await this.app.system<{ backup?: FullBackup } | FullBackup | null>(GET);
      const backup = typeof got === 'object' && got ? ('backup' in got ? got.backup : (got as FullBackup)) : undefined;
      if (!backup || backup.format !== 'empathika-memory') return { ok: false, message: 'The care app has no backup for this resident yet.' };
      const r = await this.memory.restoreBackup(backup);
      const extra = this.restorePersonality(backup);
      const message = `Restored ${r.items} facts and ${r.notes} conversation notes from the backup of ${backup.takenAt.slice(0, 10)}${extra ? `, ${extra}` : ''}.`;
      this.status.lastRestore = `${new Date().toISOString()}: ${message}`;
      this.staff?.audit('memory_restore', undefined, `${why}. ${message}`);
      this.log.log(`${message} (${why})`);
      this.backedUpRevision = this.memory.revision; // what's here now matches the app
      return { ok: true, message };
    } catch (err) {
      this.log.warn(`Restore failed: ${(err as Error).message}`);
      return { ok: false, message: `The restore failed: ${(err as Error).message}` };
    }
  }

  private personality(): Pick<FullBackup, 'soul' | 'journal'> {
    if (!this.soul) return {};
    const soul: Partial<Record<SoulDoc, string>> = {};
    for (const d of SOUL_DOCS) if (!this.soul.isStarter(d)) soul[d] = this.soul.read(d);
    return { soul, journal: this.soul.entries().map((e) => ({ text: e.text, at: e.at })) };
  }

  /** Her personality for this resident comes back only where this box still has the starter text. */
  private restorePersonality(b: FullBackup): string {
    if (!this.soul) return '';
    let docs = 0;
    for (const d of SOUL_DOCS) {
      const text = b.soul?.[d];
      if (typeof text === 'string' && text.trim() && this.soul.isStarter(d)) {
        this.soul.save(text, d);
        docs++;
      }
    }
    let entries = 0;
    for (const e of b.journal ?? []) if (typeof e?.text === 'string' && this.soul.addEntry(e.text, 'panel')) entries++;
    return [docs ? `${docs} personality document${docs === 1 ? '' : 's'}` : '', entries ? `${entries} journal entr${entries === 1 ? 'y' : 'ies'}` : ''].filter(Boolean).join(' and ');
  }
}
