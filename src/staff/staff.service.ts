import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { APP_CONFIG, AppConfig } from '../config';
import { memorySecret, SealedStore } from '../memory/sealed-store';
import { ModesService, StaffSession } from '../memory/modes.service';

export interface StaffMember {
  id: string;
  name: string;
  /** e.g. "Nurse", "Senior carer". */
  role?: string;
  /** Salted hash of the 4-digit PIN (the PIN itself is never stored; the whole list is encrypted too). */
  salt: string;
  hash: string;
  /** SHA-256 of an NFC badge's id, once badges are in use. */
  badge?: string;
  createdAt: string;
}

export interface AuditEntry {
  at: string;
  /** Who, when known (a staff session, or the badge/PIN that was tried). */
  staff?: string;
  event: 'session_start' | 'session_end' | 'session_expired' | 'wrong_pin' | 'paused' | 'care_record' | 'care_memory' | 'staff_added' | 'staff_removed' | 'memory_restore';
  detail?: string;
}

interface Saved {
  staff: StaffMember[];
  /** Wrong tries in a row and the pause after too many (kept across restarts). */
  fails: number;
  pausedUntil: number;
  pauses: number;
}

const TRIES = 5;
const FIRST_PAUSE_MS = 30_000;
const MAX_PAUSE_MS = 15 * 60_000;
const AUDIT_MAX = 3000;

export const isPin = (v: unknown): v is string => typeof v === 'string' && /^\d{4}$/.test(v);

/**
 * The care team: who may open a staff session, and a record of what they did.
 *
 * Each member of staff has their own 4-digit PIN (set on the control panel), so the audit log
 * shows who looked at what. A PIN typed on Empathika's screen starts a staff session
 * (ModesService) for STAFF_SESSION_MINUTES; after 5 wrong PINs the keypad pauses, longer each
 * time (30 s, 1 min, 2 min... up to 15 min), and that survives restarts. NFC badges use the same
 * path (unlockWithBadge) once a reader is fitted.
 *
 * The staff list and the audit log are encrypted like the memory vaults.
 */
@Injectable()
export class StaffService implements OnModuleInit {
  private readonly log = new Logger('Staff');
  private store?: SealedStore<Saved>;
  private auditStore?: SealedStore<AuditEntry[]>;
  private saved: Saved = { staff: [], fails: 0, pausedUntil: 0, pauses: 0 };
  private audits: AuditEntry[] = [];

  constructor(
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
    private readonly modes: ModesService,
  ) {}

  onModuleInit(): void {
    const secret = memorySecret(this.cfg);
    this.store = new SealedStore(this.cfg.memory.dir, 'staff', secret);
    this.auditStore = new SealedStore(this.cfg.memory.dir, 'staff-audit', secret);
    try {
      this.saved = { ...this.saved, ...(this.store.load() ?? {}) };
      this.audits = this.auditStore.load() ?? [];
    } catch (err) {
      this.log.error(`Could not read the staff list: ${(err as Error).message}`);
    }
    this.modes.on('ended', (s: StaffSession, reason: 'ended' | 'expired') => this.audit(reason === 'expired' ? 'session_expired' : 'session_end', s.name));
  }

  /** The staff list, without the PIN hashes. */
  list(): { id: string; name: string; role?: string; badge: boolean; createdAt: string }[] {
    return this.saved.staff.map((s) => ({ id: s.id, name: s.name, role: s.role, badge: Boolean(s.badge), createdAt: s.createdAt })).sort((a, b) => a.name.localeCompare(b.name));
  }

  get count(): number {
    return this.saved.staff.length;
  }

  /** Control panel: add a member of staff with their own PIN. */
  add(name: string, pin: string, role?: string, badge?: string): { ok: boolean; message: string } {
    const n = name.replace(/\s+/g, ' ').trim().slice(0, 60);
    if (!n) return { ok: false, message: 'Enter a name.' };
    if (!isPin(pin)) return { ok: false, message: 'The PIN must be exactly 4 digits.' };
    if (/^(\d)\1{3}$/.test(pin) || '0123456789'.includes(pin) || '9876543210'.includes(pin)) {
      return { ok: false, message: 'That PIN is too easy to guess (like 1111 or 1234). Choose another.' };
    }
    // Each PIN must be unique, so a PIN always names one person in the audit log.
    if (this.saved.staff.some((s) => matches(pin, s))) return { ok: false, message: 'Someone already uses that PIN. Choose another.' };
    const salt = randomBytes(16).toString('hex');
    this.saved.staff.push({ id: randomUUID(), name: n, role: role?.trim().slice(0, 40) || undefined, salt, hash: hashOf(pin, salt), badge: badge?.trim() ? badgeHash(badge) : undefined, createdAt: new Date().toISOString() });
    this.save();
    this.audit('staff_added', n);
    return { ok: true, message: `Added ${n}. Their PIN opens a staff session on Empathika's screen.` };
  }

  remove(id: string): boolean {
    const s = this.saved.staff.find((x) => x.id === id);
    if (!s) return false;
    this.saved.staff = this.saved.staff.filter((x) => x.id !== id);
    this.save();
    this.audit('staff_removed', s.name);
    if (this.modes.staff?.staffId === id) this.modes.endStaff();
    return true;
  }

  /** For the screen's keypad: if it is paused, until when. */
  status(): { pausedUntil?: number; triesLeft: number } {
    return { pausedUntil: this.saved.pausedUntil > Date.now() ? this.saved.pausedUntil : undefined, triesLeft: TRIES - this.saved.fails };
  }

  /** A PIN typed on the screen. */
  unlockWithPin(pin: string): { ok: boolean; message: string; name?: string } {
    if (!this.saved.staff.length) return { ok: false, message: 'No staff PINs are set up yet (control panel → Staff).' };
    const wait = this.saved.pausedUntil - Date.now();
    if (wait > 0) return { ok: false, message: `Too many tries. Wait ${Math.ceil(wait / 1000)} s.` };
    const who = isPin(pin) ? this.saved.staff.find((s) => matches(pin, s)) : undefined;
    if (!who) return this.failed();
    return this.start(who);
  }

  /** An NFC badge was tapped on the reader (for when a reader is fitted). */
  unlockWithBadge(uid: string): { ok: boolean; message: string; name?: string } {
    const h = badgeHash(uid);
    const who = this.saved.staff.find((s) => s.badge && timingSafeEqual(Buffer.from(s.badge, 'hex'), Buffer.from(h, 'hex')));
    if (!who) {
      this.audit('wrong_pin', undefined, 'unknown badge');
      return { ok: false, message: 'Badge not recognised.' };
    }
    return this.start(who);
  }

  /** Something done in a staff session (a care record lookup, care notes read). */
  audit(event: AuditEntry['event'], staff?: string, detail?: string): void {
    this.audits.push({ at: new Date().toISOString(), event, staff: staff ?? this.modes.staff?.name, detail: detail?.slice(0, 300) });
    if (this.audits.length > AUDIT_MAX) this.audits.splice(0, this.audits.length - AUDIT_MAX);
    this.auditStore?.save(this.audits).catch((err) => this.log.error(`Could not save the staff audit log: ${(err as Error).message}`));
  }

  /** Newest first. */
  auditLog(limit = 200): AuditEntry[] {
    return this.audits.slice(-limit).reverse();
  }

  private start(who: StaffMember): { ok: boolean; message: string; name: string } {
    if (this.saved.fails || this.saved.pauses) {
      this.saved = { ...this.saved, fails: 0, pausedUntil: 0, pauses: 0 };
      this.save();
    }
    this.modes.startStaff({ id: who.id, name: who.name, role: who.role });
    this.audit('session_start', who.name);
    return { ok: true, message: `Hello ${who.name}.`, name: who.name };
  }

  private failed(): { ok: boolean; message: string } {
    this.saved.fails++;
    let message = 'Wrong PIN.';
    this.audit('wrong_pin');
    if (this.saved.fails >= TRIES) {
      const pause = Math.min(MAX_PAUSE_MS, FIRST_PAUSE_MS * 2 ** this.saved.pauses);
      this.saved = { ...this.saved, fails: 0, pausedUntil: Date.now() + pause, pauses: this.saved.pauses + 1 };
      message = `Too many tries. Wait ${Math.round(pause / 1000)} s.`;
      this.log.warn(`Staff keypad: ${TRIES} wrong PINs, paused for ${Math.round(pause / 1000)} s`);
      this.audit('paused', undefined, `${TRIES} wrong PINs, keypad paused for ${Math.round(pause / 1000)} s`);
    }
    this.save();
    return { ok: false, message };
  }

  private save(): void {
    this.store?.save(this.saved).catch((err) => this.log.error(`Could not save the staff list: ${(err as Error).message}`));
  }
}

/**
 * A fast salted hash: a 4-digit PIN has only 10,000 values, so a slow hash adds no real protection
 * and would hold up the voice for every staff member checked. The protection is the encrypted
 * file and the keypad's lockout.
 */
function hashOf(pin: string, salt: string): string {
  return createHmac('sha256', salt).update(pin).digest('hex');
}

function matches(pin: string, s: StaffMember): boolean {
  return timingSafeEqual(Buffer.from(hashOf(pin, s.salt), 'hex'), Buffer.from(s.hash, 'hex'));
}

function badgeHash(uid: string): string {
  return createHash('sha256').update(uid.trim().toUpperCase().replace(/[^0-9A-F]/g, '')).digest('hex');
}
