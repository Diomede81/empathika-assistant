import { EventEmitter } from 'node:events';
import { Inject, Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import { APP_CONFIG, AppConfig } from '../config';
import { MemoryService, shortDate } from '../memory/memory.service';
import { ModesService, StaffSession } from '../memory/modes.service';
import { memorySecret, SealedStore } from '../memory/sealed-store';
import { StaffService } from '../staff/staff.service';
import { CareAppService } from '../care-app/care-app.service';
import { ActivitiesService, KINDS as ACTIVITY_KINDS } from '../activities/activities.service';
import { CONTACTS, PeopleService } from '../people/people.service';

/** What a doctor can dictate. The last three are for the care staff to act on, and stay open until one of them acknowledges. */
export const NOTE_TYPES = {
  finding: { label: 'Finding', action: false, hint: 'what the doctor found or observed today' },
  note: { label: 'Note', action: false, hint: 'anything else for the record' },
  medication: { label: 'Medication change', action: true, hint: 'a change the doctor has decided (it must still be prescribed and charted the usual way)' },
  instruction: { label: 'Instruction for staff', action: true, hint: 'something the care staff must do or watch for' },
  follow_up: { label: 'Follow-up', action: true, hint: 'a review, test or referral to arrange, with a date if given' },
} as const;
export type NoteType = keyof typeof NOTE_TYPES;

export interface DoctorNote {
  id: string;
  at: string;
  /** The doctor (their staff record's name) and role. */
  by: string;
  role?: string;
  type: NoteType;
  text: string;
  /** For a follow-up: by when (YYYY-MM-DD). */
  due?: string;
  /** A member of staff has seen it and taken it on. */
  ack?: { by: string; at: string; note?: string };
  /** The memory fact that mirrors it (so a correction updates that too). */
  memoryId?: string;
  /** The care app has it. */
  sent?: boolean;
}

interface State {
  notes: DoctorNote[];
  /** The day staff were last reminded on the screen that a note is waiting. */
  cuedOn?: string;
}

const NOTES_KEPT = 1000;
const NOTE_CHARS = 600;
const APP_TOOL = 'clinical_note_add';
const DAY_MS = 86400_000;

/**
 * Doctor mode. A doctor (or nurse practitioner, or other clinician: ticked as such on the control
 * panel's Staff tab) signs in with their own PIN like any member of staff; their session is a doctor
 * session, a little longer than a staff one. In it they can:
 *
 *  - ask anything about the resident: Empathika answers from the care record (the care app), the
 *    care notes in her memory, and a briefing she puts together herself (what the resident has said
 *    about pain, mood, sleep and eating since the last visit, how the activities are going, who has
 *    visited, and whether the last visit's instructions were dealt with);
 *  - dictate their update: findings, medication changes, instructions for the staff, follow-ups.
 *    Each is read back for confirmation (drug names and doses are easy to mishear), kept encrypted
 *    on the box, filed in the Care vault, and sent to the care app (clinical_note_add).
 *
 * Making sure it is addressed: medication changes, instructions and follow-ups stay OPEN until a
 * member of staff acknowledges them. The screen shows a discreet "note for staff" (no content: the
 * resident and visitors can see the screen); the next staff session starts with the open items; the
 * control panel lists them. Every note and acknowledgement is in the staff audit log.
 *
 * Empathika records what the doctor decides; she never gives medical advice of her own and never
 * changes the medication record: a medication change is a note until it is prescribed the usual way.
 */
@Injectable()
export class ClinicalService extends EventEmitter implements OnModuleInit {
  private readonly log = new Logger('Doctor');
  private state: State = { notes: [] };
  private store?: SealedStore<State>;
  revision = 0;

  constructor(
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
    private readonly memory: MemoryService,
    private readonly modes: ModesService,
    @Optional() private readonly staff?: StaffService,
    @Optional() private readonly app?: CareAppService,
    @Optional() private readonly activities?: ActivitiesService,
    @Optional() private readonly people?: PeopleService,
  ) {
    super();
  }

  onModuleInit(): void {
    if (!this.memory.enabled) return;
    this.store = new SealedStore(this.cfg.memory.dir, 'clinical', memorySecret(this.cfg));
    try {
      const s = this.store.load();
      if (s) this.state = { ...s, notes: Array.isArray(s.notes) ? s.notes : [] };
    } catch (err) {
      this.log.error(`Could not read the doctor's notes (${(err as Error).message}); starting without them`);
    }
    this.memory.sections.push((open) => (open.includes('care') ? this.promptSection() : ''));
    // A session ended: if instructions are waiting, the screen says a note is there for staff.
    this.modes.on('ended', (s: StaffSession) => {
      if (s.clinician && this.open().length) this.emit('waiting', this.open().length);
    });
  }

  get enabled(): boolean {
    return Boolean(this.store);
  }

  /** The doctor session in progress, if any. */
  private get doctor(): StaffSession | undefined {
    const s = this.modes.staff;
    return s?.clinician ? s : undefined;
  }

  get notes(): DoctorNote[] {
    return this.state.notes;
  }

  /** Not yet acknowledged by staff: medication changes, instructions and follow-ups, oldest first. */
  open(): DoctorNote[] {
    return this.state.notes.filter((n) => NOTE_TYPES[n.type].action && !n.ack).sort((a, b) => a.at.localeCompare(b.at));
  }

  /** The last time a doctor left notes before `before` (their visit's first note). */
  lastVisit(before = new Date().toISOString().slice(0, 10)): { at: string; by: string; notes: DoctorNote[] } | undefined {
    const earlier = this.state.notes.filter((n) => n.at.slice(0, 10) < before).sort((a, b) => b.at.localeCompare(a.at));
    if (!earlier.length) return undefined;
    const day = earlier[0].at.slice(0, 10);
    const notes = earlier.filter((n) => n.at.slice(0, 10) === day).reverse();
    return { at: notes[0].at, by: notes[0].by, notes };
  }

  // ---------- The doctor's update ----------

  /** Saves one dictated item. Only in a doctor session. */
  async add(type: string, text: string, due?: string): Promise<string> {
    const d = this.doctor;
    if (!d) return 'Not saved: clinical notes can only be dictated in a doctor session (the doctor signs in with their PIN on the screen).';
    const t = noteTypeOf(type);
    const clean = text.replace(/\s+/g, ' ').trim().slice(0, NOTE_CHARS);
    if (clean.length < 3) return 'What is the note? Ask the doctor to say it again.';
    const note: DoctorNote = { id: randomUUID(), at: new Date().toISOString(), by: d.name, role: d.role, type: t, text: clean, due: /^\d{4}-\d{2}-\d{2}$/.test(due ?? '') ? due : undefined };
    this.state.notes = [...this.state.notes, note].slice(-NOTES_KEPT);
    // In the Care vault too, so staff can find it by asking ("what did the doctor say about her knee?").
    const r = await this.memory.remember({ text: memoryText(note), vault: 'care', kind: 'health', subject: `${d.name} (doctor)`, source: 'you' });
    note.memoryId = r.item?.id;
    this.persist();
    void this.send(note);
    this.staff?.audit('doctor_note', d.name, `${NOTE_TYPES[t].label}: ${clean.slice(0, 200)}`);
    this.log.log(`${d.name}: ${NOTE_TYPES[t].label.toLowerCase()} recorded`);
    return (
      `Saved as ${NOTE_TYPES[t].label.toLowerCase()}${note.due ? ` (by ${note.due})` : ''}: "${clean}". Now read it back to the doctor word for word and ask "Is that right?". ` +
      'If they correct anything, call doctor_note correct with the full corrected text.' +
      (t === 'medication'
        ? ' Then say once: this is noted for the staff and the record, but it does not change the prescription or the medication chart; that still has to be done the usual way.'
        : '') +
      (NOTE_TYPES[t].action ? ' It stays open until a member of staff acknowledges it.' : '')
    );
  }

  /** Replaces the text of the note the doctor just dictated (misheard words). */
  async correct(text: string): Promise<string> {
    const d = this.doctor;
    if (!d) return 'Not done: only in a doctor session.';
    const note = this.lastOf(d);
    if (!note) return 'There is no note from this session to correct yet.';
    const clean = text.replace(/\s+/g, ' ').trim().slice(0, NOTE_CHARS);
    if (clean.length < 3) return 'What should it say? Ask the doctor for the full corrected sentence.';
    note.text = clean;
    note.sent = false;
    if (note.memoryId) await this.memory.updateItem(note.memoryId, memoryText(note));
    this.persist();
    void this.send(note);
    this.staff?.audit('doctor_note', d.name, `Corrected: ${clean.slice(0, 200)}`);
    return `Corrected to: "${clean}". Read it back once more and ask if it is right now.`;
  }

  /** Withdraws the note the doctor just dictated. */
  remove(): string {
    const d = this.doctor;
    if (!d) return 'Not done: only in a doctor session.';
    const note = this.lastOf(d);
    if (!note) return 'There is no note from this session to remove.';
    this.state.notes = this.state.notes.filter((n) => n.id !== note.id);
    if (note.memoryId) this.memory.deleteItem(note.memoryId);
    this.persist();
    this.staff?.audit('doctor_note', d.name, `Withdrawn: ${note.text.slice(0, 200)}`);
    return `Removed: "${note.text}". (If the care app already has it, tell the doctor it must be withdrawn there too.)`;
  }

  private lastOf(d: StaffSession): DoctorNote | undefined {
    return [...this.state.notes].reverse().find((n) => n.by === d.name && Date.parse(n.at) >= d.since);
  }

  /** What this doctor has dictated in this session, to read back as a summary. */
  sessionNotes(): string {
    const d = this.doctor;
    if (!d) return 'No doctor session is open.';
    const mine = this.state.notes.filter((n) => n.by === d.name && Date.parse(n.at) >= d.since);
    if (!mine.length) return 'Nothing dictated yet in this visit.';
    return `Dictated in this visit (${mine.length}):\n${mine.map((n, i) => `${i + 1}. ${NOTE_TYPES[n.type].label}${n.due ? ` (by ${n.due})` : ''}: ${n.text}`).join('\n')}`;
  }

  private async send(note: DoctorNote): Promise<void> {
    if (!this.app?.connected || !this.app.supports(APP_TOOL)) return;
    try {
      await this.app.system(APP_TOOL, { note: { id: note.id, at: note.at, by: note.by, role: note.role, type: note.type, label: NOTE_TYPES[note.type].label, text: note.text, due: note.due, acknowledged: note.ack } });
      note.sent = true;
      this.persist();
    } catch (err) {
      this.log.warn(`Could not send the doctor's note to the care app (it is kept on the box): ${(err as Error).message}`);
    }
  }

  // ---------- Making sure it is addressed ----------

  /** A member of staff takes on an open item (by its number in the list, some of its words, or "all"). */
  acknowledge(which: string, by?: string, note?: string): string {
    const who = by ?? this.modes.staff?.name;
    if (!who) return 'Not done: a member of staff must be signed in to acknowledge an instruction.';
    const open = this.open();
    if (!open.length) return 'There is nothing waiting: every instruction has been acknowledged.';
    const w = which.trim().toLowerCase();
    let picked: DoctorNote[];
    if (!w || /^(all|everything|both|them all|all of them)$/.test(w)) picked = open;
    else if (/^\d+$/.test(w)) picked = open[Number(w) - 1] ? [open[Number(w) - 1]] : [];
    else {
      const byId = open.filter((n) => n.id === which);
      const words = w.split(/\s+/).filter((x) => x.length > 2);
      picked = byId.length ? byId : open.filter((n) => words.length > 0 && words.every((x) => n.text.toLowerCase().includes(x)));
    }
    if (!picked.length) return `Which one? Open: ${open.map((n, i) => `${i + 1}. ${n.text}`).join(' | ')}`;
    const at = new Date().toISOString();
    for (const n of picked) {
      n.ack = { by: who, at, note: note?.trim().slice(0, 200) || undefined };
      n.sent = false;
      void this.send(n);
      this.staff?.audit('instruction_ack', who, `${NOTE_TYPES[n.type].label}: ${n.text.slice(0, 160)}`);
    }
    this.persist();
    const left = this.open().length;
    if (!left) this.emit('cleared');
    return `Acknowledged by ${who}: ${picked.map((n) => n.text).join(' | ')}.${left ? ` Still open: ${left}.` : ' Nothing else is waiting.'}`;
  }

  /** For the screen: whether to show the discreet "note for staff" today (once a day while something is open). */
  cueDue(today: string): boolean {
    if (!this.enabled || !this.open().length || this.modes.staff || this.state.cuedOn === today) return false;
    this.state.cuedOn = today;
    this.persist();
    return true;
  }

  // ---------- Answering the doctor ----------

  /**
   * What Empathika herself can tell the doctor (the care record's medication, observations and care
   * plan come from the care app's own actions): since the last visit, or the last 30 days.
   */
  briefing(): string {
    const last = this.lastVisit();
    const since = last ? Date.parse(last.at) : Date.now() - 30 * DAY_MS;
    const sinceText = last ? `the last doctor's visit (${shortDate(last.at)}, ${last.by})` : 'the last 30 days (no earlier doctor visit is recorded on this box)';
    const care = this.memory.snapshot().find((v) => v.name === 'care');
    const reported = (care?.items ?? [])
      .filter((i) => Date.parse(i.createdAt) >= since && !/\(doctor\)$/.test(i.subject ?? ''))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 14)
      .map((i) => `- ${shortDate(i.createdAt)}: ${i.text}${i.source === 'conversation' ? ' (said by the resident, not verified)' : ''}`);
    const talks = (care?.episodes ?? [])
      .filter((e) => Date.parse(e.at) >= since)
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 5)
      .map((e) => `- ${shortDate(e.at)}: ${e.summary}`);
    const lastNotes = last
      ? last.notes.map((n) => `- ${NOTE_TYPES[n.type].label}: ${n.text}${NOTE_TYPES[n.type].action ? (n.ack ? ` [acknowledged by ${n.ack.by}, ${shortDate(n.ack.at)}${n.ack.note ? `: ${n.ack.note}` : ''}]` : ' [NOT YET ACKNOWLEDGED by staff]') : ''}`)
      : [];
    return [
      `Briefing for the doctor, covering ${sinceText}. This is what Empathika holds herself; for current medication, observations (vital signs, weight, blood glucose) and the care plan, use the care record actions and give figures with their dates and who recorded them.`,
      lastNotes.length ? `Last visit's notes and whether they were dealt with:\n${lastNotes.join('\n')}` : '',
      reported.length ? `Care notes since then (what the resident said or staff reported: pain, mood, sleep, eating, falls, confusion):\n${reported.join('\n')}` : 'No care notes were filed in that time.',
      talks.length ? `Conversation notes (care):\n${talks.join('\n')}` : '',
      this.activityLine(),
      this.contactLine(),
      'Say plainly what is not known. Do not diagnose or suggest treatment: report, and let the doctor decide.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  /** Activities in the last 14 days against the 14 before: a change over weeks is worth a doctor's attention. */
  private activityLine(): string {
    const all = this.activities?.sessions ?? [];
    const now = Date.now();
    const span = (from: number, to: number) => all.filter((s) => Date.parse(s.at) >= now - from * DAY_MS && Date.parse(s.at) < now - to * DAY_MS);
    const describe = (list: typeof all) => {
      const scored = list.filter((s) => s.asked > 0);
      const asked = scored.reduce((n, s) => n + s.asked, 0);
      const right = scored.reduce((n, s) => n + s.correct, 0);
      return `${list.length} session${list.length === 1 ? '' : 's'}${asked ? `, ${Math.round((right / asked) * 100)}% right in the puzzles` : ''}`;
    };
    const recent = span(14, 0);
    const before = span(28, 14);
    if (!recent.length && !before.length) return 'Activities (puzzles, trivia, memory games): none played yet.';
    const kinds = [...new Set(recent.map((s) => ACTIVITY_KINDS[s.kind]?.label ?? s.kind))].slice(0, 5).join(', ');
    const stopped = recent.filter((s) => s.ended === 'stopped').length;
    return `Activities, last 14 days: ${describe(recent)}${kinds ? ` (${kinds})` : ''}${stopped ? `, ${stopped} stopped early` : ''}. The 14 days before: ${describe(before)}. (Scores are not a clinical test; a steady change is what matters.)`;
  }

  private contactLine(): string {
    const people = this.people?.people.filter((p) => !p.deceased) ?? [];
    if (!people.length) return '';
    const seen = people
      .map((p) => ({ p, recent: p.contacts.filter((c) => Date.now() - Date.parse(c.at) < 30 * DAY_MS) }))
      .filter((x) => x.recent.length)
      .map((x) => `${x.p.name} (${x.p.relation ?? x.p.circle}): ${x.recent.length} time${x.recent.length === 1 ? '' : 's'}, last ${CONTACTS[x.recent[0].kind].toLowerCase()} ${shortDate(x.recent[0].at)}`);
    return seen.length ? `Family contact in the last 30 days: ${seen.join('; ')}.` : 'Family contact: none recorded in the last 30 days.';
  }

  // ---------- Empathika ----------

  /** In a doctor session: how to be with the doctor. In a staff session: what the doctor left for them. */
  promptSection(): string {
    if (!this.enabled) return '';
    const s = this.modes.staff;
    if (!s) return '';
    const open = this.open();
    const openLines = open.map((n, i) => `${i + 1}. ${NOTE_TYPES[n.type].label} from ${n.by}, ${shortDate(n.at)}${n.due ? `, by ${n.due}` : ''}: ${n.text}`);
    if (s.clinician) {
      return [
        `DOCTOR SESSION: you are talking with ${s.name}${s.role ? ` (${s.role})` : ''}, a clinician. Speak as to a colleague: brief, exact, clinical terms are fine, ` +
          'no small talk. Early on, offer a briefing (doctor_note briefing) and give it in a few sentences, most important first. ' +
          'Answer every question from the care record actions, the care notes (recall) and the briefing; give figures with their ' +
          'date and who recorded them; say plainly when something is not recorded. Never diagnose, never suggest treatment or ' +
          'doses, never guess. When the doctor dictates their update, call doctor_note add once per item with the right type ' +
          '(finding, medication, instruction, follow_up, note), keeping their words, drug names and doses exactly; read each ' +
          'one back and get a yes before moving on. Before the session ends, read back the list (doctor_note list) and ask ' +
          'if anything is missing. Health details may be said out loud in this session: the doctor decides who is in the room.',
        open.length ? `Still not acknowledged by staff from earlier visits:\n${openLines.join('\n')}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    }
    if (!open.length) return '';
    return (
      `THE DOCTOR LEFT ${open.length === 1 ? 'AN ITEM' : `${open.length} ITEMS`} FOR THE CARE STAFF, not yet acknowledged. Tell ${s.name} at the start of this ` +
      'session, before anything else, reading each one exactly:\n' +
      `${openLines.join('\n')}\n` +
      'When they say they have seen it or done it, call doctor_instructions acknowledge (which: the number, or "all"; note: anything they add, ' +
      'e.g. "chart updated"). A medication change is only a note here: it must be prescribed and charted the usual way.'
    );
  }

  get tools(): ChatCompletionTool[] {
    if (!this.enabled) return [];
    const s = this.modes.staff;
    if (!s) return [];
    const out: ChatCompletionTool[] = [
      {
        type: 'function',
        function: {
          name: 'doctor_instructions',
          description:
            "What doctors have left for the care staff about this resident. list: the open items (not yet acknowledged) and the last visit's notes. " +
            'acknowledge: a member of staff confirms they have seen and taken on an item (which: its number in the list, some of its words, or "all"; ' +
            'note: what they did, optional). Only acknowledge when the member of staff has clearly said so.',
          parameters: {
            type: 'object',
            properties: {
              action: { type: 'string', enum: ['list', 'acknowledge'] },
              which: { type: 'string', description: 'For acknowledge: the number, some words of the item, or "all"' },
              note: { type: 'string', description: 'For acknowledge: what the member of staff did or said about it' },
            },
            required: ['action'],
          },
        },
      },
    ];
    if (s.clinician) {
      out.unshift({
        type: 'function',
        function: {
          name: 'doctor_note',
          description:
            "The doctor's update about the resident (doctor session only). add: one dictated item, in the doctor's own words with drug names, doses " +
            `and figures exactly as said (type: ${(Object.keys(NOTE_TYPES) as NoteType[]).map((k) => `${k} = ${NOTE_TYPES[k].hint}`).join('; ')}). ` +
            'One call per item; then read it back and get a yes. correct: replace the text of the item just dictated (give the full corrected text). ' +
            'remove: withdraw the item just dictated. list: what has been dictated in this visit, to read back at the end. ' +
            'briefing: what Empathika can report since the last visit (care notes, mood and pain reports, activities, family contact, ' +
            'whether the last instructions were dealt with); for medication and observations use the care record actions as well.',
          parameters: {
            type: 'object',
            properties: {
              action: { type: 'string', enum: ['add', 'correct', 'remove', 'list', 'briefing'] },
              type: { type: 'string', enum: Object.keys(NOTE_TYPES), description: 'For add' },
              text: { type: 'string', description: 'For add and correct: the item, in the doctor\'s words' },
              due: { type: 'string', description: 'For add (follow_up): by when, YYYY-MM-DD, if the doctor gave a date' },
            },
            required: ['action'],
          },
        },
      });
    }
    return out;
  }

  has(name: string): boolean {
    return this.enabled && (name === 'doctor_note' || name === 'doctor_instructions');
  }

  async call(name: string, a: Record<string, unknown>): Promise<string> {
    const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
    if (!this.modes.staff) return 'Not done: this is only available in a staff or doctor session (PIN on the screen). Do not share any health details.';
    const action = s(a.action) ?? 'list';
    if (name === 'doctor_instructions') {
      if (action === 'acknowledge') return this.acknowledge(s(a.which) ?? 'all', undefined, s(a.note));
      const open = this.open();
      const last = this.lastVisit(new Date(Date.now() + DAY_MS).toISOString().slice(0, 10));
      return [
        open.length ? `Open (not yet acknowledged):\n${open.map((n, i) => `${i + 1}. ${NOTE_TYPES[n.type].label} from ${n.by}, ${shortDate(n.at)}${n.due ? `, by ${n.due}` : ''}: ${n.text}`).join('\n')}` : 'Nothing is waiting: every instruction has been acknowledged.',
        last ? `Last doctor's visit (${shortDate(last.at)}, ${last.by}):\n${last.notes.map((n) => `- ${NOTE_TYPES[n.type].label}: ${n.text}${n.ack ? ` [acknowledged by ${n.ack.by}]` : ''}`).join('\n')}` : 'No doctor visit is recorded on this box yet.',
      ].join('\n');
    }
    switch (action) {
      case 'add':
        return this.add(s(a.type) ?? 'note', s(a.text) ?? '', s(a.due));
      case 'correct':
        return this.correct(s(a.text) ?? '');
      case 'remove':
        return this.remove();
      case 'briefing':
        if (!this.doctor) return 'Not done: the briefing is for a doctor session.';
        this.staff?.audit('care_memory', undefined, 'Briefing for the doctor');
        return this.briefing();
      case 'list':
      default:
        return this.sessionNotes();
    }
  }

  // ---------- Backup ----------

  exportBackup(): DoctorNote[] {
    return this.state.notes.map(({ memoryId: _m, ...n }) => n);
  }

  restoreBackup(list: unknown): number {
    if (!Array.isArray(list) || !this.enabled) return 0;
    const have = new Set(this.state.notes.map((n) => n.id));
    const fresh = list.filter((n): n is DoctorNote => Boolean(n && typeof n === 'object' && typeof (n as DoctorNote).id === 'string' && typeof (n as DoctorNote).text === 'string' && (n as DoctorNote).type in NOTE_TYPES && !have.has((n as DoctorNote).id)));
    if (!fresh.length) return 0;
    this.state.notes = [...this.state.notes, ...fresh].sort((a, b) => a.at.localeCompare(b.at)).slice(-NOTES_KEPT);
    this.persist();
    return fresh.length;
  }

  private persist(): void {
    this.revision++;
    this.store?.save(this.state).catch((err) => this.log.error(`Could not save the doctor's notes: ${(err as Error).message}`));
  }
}

function memoryText(n: DoctorNote): string {
  return `${n.by} (doctor), ${NOTE_TYPES[n.type].label.toLowerCase()}${n.due ? ` by ${n.due}` : ''}: ${n.text}`.slice(0, 300);
}

export function noteTypeOf(s: string): NoteType {
  const k = s.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (k in NOTE_TYPES) return k as NoteType;
  if (/medic|drug|dose|prescri|tablet/.test(k)) return 'medication';
  if (/instruct|order|staff|task|monitor/.test(k)) return 'instruction';
  if (/follow|review|refer|test|appointment/.test(k)) return 'follow_up';
  if (/find|exam|observ|assess/.test(k)) return 'finding';
  return 'note';
}
