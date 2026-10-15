import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { APP_CONFIG, AppConfig } from '../config';
import { timeZone } from '../actions/clock';

/**
 * resident: the normal state. Empathika talks with the resident (and their visitors) and can only
 *           draw on the Resident vault: their life story, family, likes and routines.
 * staff:    a member of staff has identified themselves (PIN, later an NFC badge). For a few minutes
 *           she can also read the Care vault and look things up in the resident's care record.
 */
export type Mode = 'resident' | 'staff';
/** resident = who they are and what they enjoy; care = health and wellbeing notes, for staff only. */
export type VaultName = 'resident' | 'care';
export const VAULTS: VaultName[] = ['resident', 'care'];

export interface StaffSession {
  staffId: string;
  name: string;
  role?: string;
  since: number;
  until: number;
}

/**
 * Who Empathika is talking to, and so which part of her memory is open. Staff sessions are kept in
 * memory only: a restart always goes back to resident mode. They end on their own after
 * STAFF_SESSION_MINUTES, when the member of staff says so, or from the screen.
 */
@Injectable()
export class ModesService extends EventEmitter implements OnModuleDestroy {
  private readonly log = new Logger('Access');
  private session?: StaffSession;
  private expiry?: NodeJS.Timeout;
  /** Told about every switch (the memory activity log). */
  onChange?: (description: string) => void;

  constructor(@Inject(APP_CONFIG) private readonly cfg: AppConfig) {
    super();
  }

  onModuleDestroy(): void {
    clearTimeout(this.expiry);
  }

  get mode(): Mode {
    return this.staff ? 'staff' : 'resident';
  }

  /** The staff session in progress, if any. */
  get staff(): StaffSession | undefined {
    if (this.session && this.session.until <= Date.now()) this.finish('expired');
    return this.session;
  }

  /** How the current mode was decided, for the panel and the AI. */
  describe(): string {
    const s = this.staff;
    return s ? `Staff mode: ${s.name}${s.role ? ` (${s.role})` : ''} until ${this.fmt(s.until)}` : 'Resident mode';
  }

  readable(mode = this.mode): VaultName[] {
    return mode === 'staff' ? [...VAULTS] : ['resident'];
  }

  /**
   * New facts can always be filed in either vault: something the resident says about their health
   * ("my knee hurts today") goes to Care for the staff, even though she can't read Care back to them.
   */
  writable(): VaultName[] {
    return [...VAULTS];
  }

  /** A member of staff identified themselves: staff mode for the configured number of minutes. */
  startStaff(who: { id: string; name: string; role?: string }, minutes = this.cfg.staff.sessionMinutes): StaffSession {
    const now = Date.now();
    this.session = { staffId: who.id, name: who.name, role: who.role, since: now, until: now + minutes * 60_000 };
    this.arm();
    this.log.log(this.describe());
    this.onChange?.(`Staff session started: ${who.name}`);
    this.emit('change', this.mode);
    return this.session;
  }

  /** Adds time to the current staff session (up to one more full session). */
  extendStaff(minutes = this.cfg.staff.sessionMinutes): StaffSession | undefined {
    const s = this.staff;
    if (!s) return undefined;
    s.until = Math.min(Date.now() + 2 * minutes * 60_000, s.until + minutes * 60_000);
    this.arm();
    this.emit('change', this.mode);
    return s;
  }

  /** Back to resident mode (said, tapped, or timed out). */
  endStaff(reason: 'ended' | 'expired' = 'ended'): boolean {
    if (!this.session) return false;
    this.finish(reason);
    return true;
  }

  private finish(reason: 'ended' | 'expired'): void {
    const s = this.session;
    if (!s) return;
    this.session = undefined;
    clearTimeout(this.expiry);
    this.log.log(`Staff session ${reason}: ${s.name}`);
    this.onChange?.(`Staff session ${reason}: ${s.name}`);
    this.emit('change', this.mode);
    this.emit('ended', s, reason);
  }

  private arm(): void {
    clearTimeout(this.expiry);
    if (!this.session) return;
    this.expiry = setTimeout(() => this.finish('expired'), Math.max(0, this.session.until - Date.now()) + 50);
    this.expiry.unref?.();
  }

  private fmt(ms: number): string {
    return new Intl.DateTimeFormat('en-GB', { timeZone: timeZone(), hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms);
  }
}

export const label = (m: Mode) => ({ resident: 'Resident mode', staff: 'Staff mode' })[m];
export const vaultLabel = (v: VaultName) => ({ resident: 'Resident', care: 'Care (staff only)' })[v];
