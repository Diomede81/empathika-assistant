import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import { APP_CONFIG, AppConfig } from '../config';
import { MemoryItem, MemoryService, shortDate } from '../memory/memory.service';
import { ModesService } from '../memory/modes.service';
import { memorySecret, SealedStore } from '../memory/sealed-store';
import { localToday, timeZone } from '../actions/clock';
import { CareAppService } from '../care-app/care-app.service';
import { FamilyUpdatesService } from '../care-app/family-updates.service';

/** How someone is connected to the resident. */
export const CIRCLES = {
  family: 'Family',
  friend: 'Friend',
  carer: 'Carer or staff',
  other: 'Other',
} as const;
export type Circle = keyof typeof CIRCLES;

/** Ways of being in touch, as the care home sees them. */
export const CONTACTS = { visited: 'Visited', called: 'Called', video: 'Video call', message: 'Message', letter: 'Card or letter' } as const;
export type ContactKind = keyof typeof CONTACTS;

/** The topics of what is known about a person, in the order shown. */
export const ABOUT_TOPICS = {
  family: { label: 'Their family', hint: 'partner, children, pets: "married to Dave, two girls, Amy (9) and Lily (6)"' },
  home: { label: 'Where they live', hint: '"lives in Leeds, 40 minutes away", "moved to Australia in 1998"' },
  work: { label: 'Work', hint: '"teacher at St Mary\'s", "retired fireman"' },
  together: { label: 'Shared memories', hint: '"holidays together in Whitby every August", "she taught him to bake"' },
  other: { label: 'Other', hint: 'anything else worth knowing: their team, what they like to talk about' },
} as const;
export type AboutTopic = keyof typeof ABOUT_TOPICS;

/** Who entered it: checked sources (care app, panel, staff) can't be changed by what the resident says. */
export type PersonSource = 'app' | 'panel' | 'staff' | 'conversation';

export interface Contact {
  at: string;
  kind: ContactKind;
  note?: string;
  /** Noticed by Empathika (a family message through the app) rather than logged. */
  auto?: boolean;
}

/** Someone in the resident's life. */
export interface Person {
  id: string;
  name: string;
  circle: Circle;
  /** "daughter", "grandson", "best friend from the mill". */
  relation?: string;
  /** What the resident calls them ("Tommy", "Mum"). */
  nickname?: string;
  /** "YYYY-MM-DD" or "MM-DD". */
  birthday?: string;
  /** Has died (staff or the care app say so: never set from what the resident says). */
  deceased?: boolean;
  /** "2019" or "2019-03-02". */
  diedOn?: string;
  /** From staff: how to talk about this person ("If she asks for George, talk about their dancing days"). */
  guidance?: string;
  about?: Partial<Record<AboutTopic, string>>;
  /** Special dates besides the birthday: a wedding anniversary, a graduation... ("MM-DD" yearly, or "YYYY-MM-DD"). */
  dates?: { label: string; date: string }[];
  /** How they fit in the family: "son" of Tom (another record), so Empathika knows Jack is Tom's boy. */
  link?: { id: string; as: string };
  /** News about them, newest first (from family, staff, or the resident). */
  updates: { at: string; text: string }[];
  contacts: Contact[];
  source: PersonSource;
  /** Their id in the care app's contact list, when it came from there. */
  appId?: string;
  createdAt: string;
  updatedAt: string;
}

/** Reminders about birthdays and special dates: out loud and on the screen, in the morning. */
export interface DateReminders {
  /** Said out loud (as well as the card on the screen). */
  speak: boolean;
  /** "09:30": not before this time. */
  time: string;
  /** Also a reminder this many days before, so there is time for a card or a call (0 = only on the day). */
  daysBefore: number;
}

/** A birthday or special date coming up. */
export interface Occasion {
  person: Person;
  /** "birthday", or the special date's own name ("wedding anniversary"). */
  label: string;
  inDays: number;
  /** The age they turn, or the number of years (when the year is known). */
  years?: number;
  /** About someone who has died: for staff and gentle conversation only, never announced. */
  sensitive: boolean;
}

interface State {
  people: Person[];
  reminders?: Partial<DateReminders>;
  /** Reminders already given ("YYYY-MM-DD:person:label:days"), so each is said once. */
  reminded?: string[];
}

const REMINDER_DEFAULTS: DateReminders = { speak: true, time: '09:30', daysBefore: 3 };

/** One contact in the care app's list (family_contacts). */
export interface AppContact {
  id: string;
  name: string;
  relationship?: string;
  nickname?: string;
  birthday?: string;
  deceased?: boolean;
  died_on?: string;
  guidance?: string;
  notes?: string;
  /** Family links: the name of another contact, and what this person is to them ("son", "wife"). */
  related_to?: string;
  related_as?: string;
  /** Special dates besides the birthday: [{ "label": "wedding anniversary", "date": "1962-06-14" }]. */
  dates?: { label: string; date: string }[];
}

const CONTACTS_KEPT = 60;
const UPDATES_KEPT = 20;
const ABOUT_CHARS = 400;
const DAY_MS = 86400_000;
const PROMPT_CHARS = 3500;
const SYNC_MS = 6 * 3600_000;
const APP_CONTACTS = 'family_contacts';

/**
 * The people in the resident's life: family, friends, the carers they are fond of. A record per
 * person (relationship, the name the resident uses, birthday, where they live, shared memories, news,
 * visits and calls), joined up with everything Empathika's memory holds about them, so she can
 * talk about Sarah or "our Tommy" the way a friend who knows the family would.
 *
 * Filled from four places: the care app's contact list (family_contacts, checked by staff), the
 * control panel, staff in a staff session, and conversations (the filing clerk files what the
 * resident says about someone under that person; a new relative mentioned with their relationship
 * gets a record of their own). Family messages count as contact. Encrypted on the box like the rest
 * of the memory, and part of the backup to the care app.
 *
 * Dementia care: what the resident says never changes checked details (relationship, birthday,
 * whether someone has died); staff guidance on how to talk about someone goes to the AI with the record.
 */
@Injectable()
export class PeopleService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('People');
  private state: State = { people: [] };
  private store?: SealedStore<State>;
  private timer?: NodeJS.Timeout;
  /** Goes up with every change (the backup checks it). */
  revision = 0;

  constructor(
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
    private readonly memory: MemoryService,
    private readonly modes: ModesService,
    @Optional() private readonly app?: CareAppService,
    @Optional() private readonly family?: FamilyUpdatesService,
  ) {}

  onModuleInit(): void {
    if (!this.memory.enabled) return;
    this.store = new SealedStore(this.cfg.memory.dir, 'people', memorySecret(this.cfg));
    try {
      const s = this.store.load();
      if (s) this.state = { ...s, people: (s.people ?? []).map(normalised) };
    } catch (err) {
      this.log.error(`Could not read the people records (${(err as Error).message}); starting without them`);
    }
    if (this.state.people.length) this.log.log(`${this.state.people.length} people in the resident's life`);
    this.memory.sections.push((open) => (open.includes('resident') ? this.promptSection() : ''));
    this.memory.filerNotes.push(() => this.filerNote());
    this.memory.onSaved.push((item, isNew) => this.noticeFact(item, isNew));
    this.family?.on('new', (item: MemoryItem) => this.noticeMessage(item));
    if (this.app?.configured) {
      setTimeout(() => void this.syncFromApp(), 25_000).unref?.();
      this.timer = setInterval(() => void this.syncFromApp(), SYNC_MS);
      this.timer.unref?.();
    }
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  get enabled(): boolean {
    return Boolean(this.store);
  }

  // ---------- Reading ----------

  get people(): Person[] {
    return this.state.people;
  }

  byId(id: string): Person | undefined {
    return this.state.people.find((p) => p.id === id);
  }

  /** By name, nickname or relationship ("Sarah", "Tommy", "my son", "grandson"). */
  find(words: string): Person[] {
    const q = words.trim().toLowerCase().replace(/^(my|our|her|his|the)\s+/, '').replace(/[.?!]+$/, '');
    if (!q) return [];
    const all = this.state.people;
    const names = (p: Person) => [p.name, p.nickname ?? ''].map((n) => n.toLowerCase()).filter(Boolean);
    const exact = all.filter((p) => names(p).includes(q) || (p.relation ?? '').toLowerCase() === q);
    if (exact.length) return exact;
    const firstNames = all.filter((p) => names(p).some((n) => n.split(/\s+/)[0] === q.split(/\s+/)[0]));
    if (firstNames.length) return firstNames;
    return all.filter((p) => (p.relation ?? '').toLowerCase().split(/[\s,/]+/).includes(q) || names(p).some((n) => n.split(/\s+/).some((w) => w.length > 2 && q.includes(w))));
  }

  lastContact(p: Person): Contact | undefined {
    return [...p.contacts].sort((a, b) => b.at.localeCompare(a.at))[0];
  }

  daysSince(p: Person, kind?: ContactKind): number | undefined {
    const last = [...p.contacts].filter((c) => !kind || c.kind === kind).sort((a, b) => b.at.localeCompare(a.at))[0];
    return last ? Math.floor((Date.now() - Date.parse(last.at)) / DAY_MS) : undefined;
  }

  /** Birthdays in the next `days` days, today first (not for people who have died). */
  birthdaysSoon(days = 14): { person: Person; inDays: number; age?: number }[] {
    const today = localToday();
    const out: { person: Person; inDays: number; age?: number }[] = [];
    for (const p of this.state.people) {
      const m = p.birthday?.match(/^(?:(\d{4})-)?(\d{2})-(\d{2})$/);
      if (!m || p.deceased) continue;
      const year = Number(today.slice(0, 4));
      for (const y of [year, year + 1]) {
        const d = `${y}-${m[2]}-${m[3]}`;
        const inDays = Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS);
        if (inDays >= 0 && inDays <= days) {
          out.push({ person: p, inDays, age: m[1] ? y - Number(m[1]) : undefined });
          break;
        }
      }
    }
    return out.sort((a, b) => a.inDays - b.inDays);
  }

  /** Birthdays and special dates in the next `days` days, today first. Those about someone who has died are marked sensitive. */
  occasionsSoon(days = 14): Occasion[] {
    const today = localToday();
    const year = Number(today.slice(0, 4));
    const out: Occasion[] = [];
    const add = (p: Person, label: string, date: string | undefined) => {
      const m = date?.match(/^(?:(\d{4})-)?(\d{2})-(\d{2})$/);
      if (!m) return;
      for (const y of [year, year + 1]) {
        const inDays = Math.round((Date.parse(`${y}-${m[2]}-${m[3]}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS);
        if (inDays >= 0 && inDays <= days) {
          out.push({ person: p, label, inDays, years: m[1] && y > Number(m[1]) ? y - Number(m[1]) : undefined, sensitive: Boolean(p.deceased) });
          break;
        }
      }
    };
    for (const p of this.state.people) {
      add(p, 'birthday', p.birthday);
      for (const d of p.dates ?? []) add(p, d.label, d.date);
    }
    return out.sort((a, b) => a.inDays - b.inDays);
  }

  /** A special date for someone: "wedding anniversary" on 06-14 (or 1962-06-14). */
  addDate(p: Person, label: string, date: string): string {
    const l = clean(label, 40).replace(/^(their|his|her|the)\s+/i, '');
    const d = normalBirthday(date);
    if (!l) return 'What is the date for (e.g. wedding anniversary)?';
    if (/^birthday$/i.test(l)) return 'Not saved here: use the birthday field for a birthday.';
    if (!d) return `The date for ${l} should be a day and a month, e.g. 14 June.`;
    p.dates = [...(p.dates ?? []).filter((x) => x.label.toLowerCase() !== l.toLowerCase()), { label: l, date: d }].slice(0, 12);
    p.updatedAt = new Date().toISOString();
    this.persist();
    return `Noted: ${p.name}'s ${l} is on ${birthdayText(d)}.`;
  }

  removeDate(p: Person, label: string): void {
    p.dates = (p.dates ?? []).filter((x) => x.label !== label);
    if (!p.dates.length) delete p.dates;
    this.persist();
  }

  get reminders(): DateReminders {
    return { ...REMINDER_DEFAULTS, ...(this.state.reminders ?? {}) };
  }

  saveReminders(input: { speak: boolean; time?: string; daysBefore?: number | string }): string {
    const time = (input.time ?? this.reminders.time).trim();
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return 'The time should look like 09:30.';
    const before = input.daysBefore === undefined || input.daysBefore === '' ? this.reminders.daysBefore : Math.round(Number(input.daysBefore));
    if (!Number.isFinite(before) || before < 0 || before > 14) return 'Days before should be 0 to 14.';
    this.state.reminders = { speak: input.speak, time, daysBefore: before };
    this.persist();
    return `Birthdays and special dates: a card on the screen${input.speak ? ' and said out loud' : ''} at ${time} on the day${before ? `, and ${before} day${before === 1 ? '' : 's'} before` : ''}.`;
  }

  /**
   * The reminders to give now: today's birthdays and special dates, and those `daysBefore` days away,
   * once each, from the set time (until 8 in the evening). Never about someone who has died: those
   * dates are for staff (the control panel) and for Empathika to handle gently if the resident brings them up.
   */
  dueReminders(now = new Date()): { title: string; big: string; subtitle: string; say: string; today: boolean }[] {
    if (!this.enabled) return [];
    const r = this.reminders;
    const hm = new Intl.DateTimeFormat('en-GB', { timeZone: timeZone(), hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
    if (hm < r.time || hm >= '20:00') return [];
    const today = localToday();
    const given = new Set(this.state.reminded ?? []);
    const out: { title: string; big: string; subtitle: string; say: string; today: boolean }[] = [];
    for (const o of this.occasionsSoon(Math.max(0, r.daysBefore))) {
      if (o.sensitive || (o.inDays !== 0 && o.inDays !== r.daysBefore)) continue;
      const key = `${today}:${o.person.id}:${o.label}:${o.inDays}`;
      if (given.has(key)) continue;
      given.add(key);
      const first = o.person.nickname ?? o.person.name.split(/\s+/)[0];
      const who = o.person.relation && o.person.circle === 'family' ? `your ${o.person.relation} ${first}` : first;
      const what = `${first}'s ${o.label}`;
      const weekday = new Intl.DateTimeFormat('en-GB', { timeZone: timeZone(), weekday: 'long' }).format(new Date(now.getTime() + o.inDays * DAY_MS));
      const years = o.years ? (o.label === 'birthday' ? `${first} will be ${o.years}` : `${o.years} years`) : '';
      out.push(
        o.inDays === 0
          ? {
              today: true,
              title: o.label === 'birthday' ? 'A birthday today' : 'A special day today',
              big: `It's ${what} today`,
              subtitle: [o.person.relation ? `${o.person.name} (${o.person.relation})` : o.person.name, o.years ? (o.label === 'birthday' ? `${o.years} today` : `${o.years} years`) : ''].filter(Boolean).join(' · '),
              say: `A lovely day today: it's ${who}'s ${o.label}${o.years ? (o.label === 'birthday' ? `. ${first} is ${o.years} today` : `, ${o.years} years`) : ''}.`,
            }
          : {
              today: false,
              title: 'Coming up',
              big: `${what} is ${o.inDays === 1 ? 'tomorrow' : `on ${weekday}`}`,
              subtitle: [o.inDays === 1 ? 'Tomorrow' : `In ${o.inDays} days`, years, 'A card or a call? Staff can help'].filter(Boolean).join(' · '),
              say: `A little reminder: ${who}'s ${o.label} is ${o.inDays === 1 ? 'tomorrow' : `in ${o.inDays} days, on ${weekday}`}. If you'd like to send a card or make a call, the staff can help.`,
            },
      );
    }
    if (out.length) {
      this.state.reminded = [...given].filter((k) => k.slice(0, 10) >= today).slice(-200);
      this.persist();
    }
    return out;
  }

  /** Who is someone, everything known: the record plus the memory's facts and messages about them. */
  describe(p: Person, forStaff = this.modes.mode === 'staff'): string {
    const facts = this.memory.itemsAbout(this.namesOf(p), 15);
    const stories = facts.filter((f) => f.kind !== 'family_news');
    const messages = facts.filter((f) => f.kind === 'family_news').slice(0, 3);
    const days = this.daysSince(p);
    const last = this.lastContact(p);
    return [
      `${p.name}${p.nickname ? ` (the resident calls them "${p.nickname}")` : ''}: ${p.relation ?? CIRCLES[p.circle].toLowerCase()}.` +
        (p.deceased ? ` Has died${p.diedOn ? ` (${p.diedOn})` : ''}.` : ''),
      p.guidance ? `Staff guidance on talking about them (follow it, don't read it out): ${p.guidance}` : '',
      this.linksOf(p).length ? `Family: ${this.linksOf(p).join('; ')}.` : '',
      p.birthday ? `Birthday: ${birthdayText(p.birthday)}.` : '',
      p.dates?.length ? `Special dates: ${p.dates.map((d) => `${d.label} on ${birthdayText(d.date)}`).join('; ')}.` : '',
      ...aboutLines(p).map((l) => `${l}.`),
      p.updates.length ? `News (newest first):\n${p.updates.slice(0, 5).map((u) => `- ${shortDate(u.at)}: ${u.text}`).join('\n')}` : '',
      last && !p.deceased
        ? `Last in touch: ${CONTACTS[last.kind].toLowerCase()} ${days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`}${last.note ? ` (${last.note})` : ''}.` +
          (forStaff ? ` Visits in the last 30 days: ${p.contacts.filter((c) => c.kind === 'visited' && Date.now() - Date.parse(c.at) < 30 * DAY_MS).length}.` : '')
        : '',
      stories.length ? `From memory (the resident's stories and what is known):\n${stories.map((f) => `- ${f.text}`).join('\n')}` : '',
      messages.length ? `Recent messages from them:\n${messages.map((m) => `- ${shortDate(m.createdAt)}: ${m.text.slice(0, 200)}`).join('\n')}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  /**
   * The record a name (and relationship) refers to, if any: the same full name, or the same first name
   * where one of them is only a first name and the relationships don't disagree ("Sarah (daughter)" is
   * "Sarah Thompson, daughter"). `unlinked`: only records not yet tied to the care app's list.
   */
  sameAs(name: string, relation?: string, unlinked = false): Person | undefined {
    const n = name.trim().toLowerCase();
    const first = n.split(/\s+/)[0];
    const rel = relation?.trim().toLowerCase();
    const pool = this.state.people.filter((p) => !unlinked || !p.appId);
    const exact = pool.find((p) => p.name.toLowerCase() === n);
    if (exact) return exact;
    return pool.find((p) => {
      const pn = p.name.toLowerCase();
      const partial = !pn.includes(' ') || !n.includes(' ');
      const agree = !rel || !p.relation || p.relation.toLowerCase() === rel;
      return partial && pn.split(/\s+/)[0] === first && agree;
    });
  }

  /** How someone fits in: "son of Tom Thompson", and who is linked to them ("Jack Thompson is their son"). */
  linksOf(p: Person): string[] {
    const out: string[] = [];
    const to = p.link ? this.byId(p.link.id) : undefined;
    if (to && p.link) out.push(`${p.link.as} of ${to.name}`);
    for (const x of this.state.people) if (x.link?.id === p.id) out.push(`${x.name} is their ${x.link.as}`);
    return out;
  }

  /** What isn't known about someone yet, as gentle questions to ask the resident (or the family). */
  gaps(p: Person): { key: string; label: string; ask: string }[] {
    const first = p.nickname ?? p.name.split(/\s+/)[0];
    const stories = this.memory.itemsAbout(this.namesOf(p), 30).filter((i) => i.kind === 'life_story').length;
    const out: { key: string; label: string; ask: string }[] = [];
    if (!p.about?.together && stories < 2) out.push({ key: 'together', label: 'shared memories', ask: `What do you remember doing together with ${first}?` });
    if (stories < 3) out.push({ key: 'story', label: 'stories', ask: p.deceased ? `What was ${first} like?` : `What was ${first} like when they were little, or when you first knew them?` });
    if (!p.deceased && !p.about?.home) out.push({ key: 'home', label: 'where they live', ask: `Where does ${first} live these days?` });
    if (!p.deceased && !p.about?.family && p.circle === 'family') out.push({ key: 'family', label: 'their own family', ask: `Does ${first} have a family of their own?` });
    if (!p.about?.work) out.push({ key: 'work', label: 'their work', ask: p.deceased ? `What did ${first} do for a living?` : `What does ${first} do, or what did they do for work?` });
    if (!p.birthday && !p.deceased) out.push({ key: 'birthday', label: 'birthday', ask: `Do you know when ${first}'s birthday is?` });
    return out;
  }

  /**
   * For the "family stories" chat: who to talk about (the one named, or whoever Empathika knows least
   * about, not someone who has died unless staff wrote guidance), what is known, and what to ask.
   */
  storyPrompt(who?: string): { name: string; text: string } | undefined {
    const named = who ? this.find(who)[0] : undefined;
    const pool = this.state.people.filter((p) => p.circle !== 'carer' && (!p.deceased || p.guidance));
    const p = named ?? [...pool].sort((a, b) => Number(Boolean(a.deceased)) - Number(Boolean(b.deceased)) || this.gaps(b).length - this.gaps(a).length || a.updatedAt.localeCompare(b.updatedAt))[0];
    if (!p) return undefined;
    const gaps = this.gaps(p).slice(0, 3);
    const subject = `${p.name} (${p.relation ?? CIRCLES[p.circle].toLowerCase()})`;
    return {
      name: p.name,
      text:
        `Family stories: an unhurried chat about ${subject}. What you know:\n${this.describe(p)}\n` +
        (gaps.length ? `Gently find out (one at a time, only if the chat goes that way): ${gaps.map((g) => g.ask).join(' / ')}\n` : '') +
        'Start warmly from something you know, or simply ask what comes to mind when they think of them. Listen, reflect back, enjoy it ' +
        'with them. Each time they tell you something worth keeping, save it at once: people story (a memory or anecdote, as one ' +
        `self-contained sentence with names, e.g. "${p.name.split(/\s+/)[0]} learned to ride a bike on the promenade at Whitby"), ` +
        'or people save (lasting facts, all in one call: where they live, their work, their family, their birthday, the name they ' +
        'call them). Never test their memory or correct them: if they are unsure or it differs from what you know, just move on warmly' +
        (p.deceased ? ', and follow the staff guidance above' : '') +
        '. If it makes them sad, comfort them and change the subject. When the chat winds down, call activity end.',
    };
  }

  /** A memory the resident (or a visitor, or staff) tells about someone: saved in the memory at once, under their name. */
  async addStory(p: Person, text: string, by: PersonSource): Promise<string> {
    const t = clean(text, 300);
    if (t.length < 8) return `What is the story about ${p.name}?`;
    const r = await this.memory.remember({
      text: t,
      vault: 'resident',
      kind: 'life_story',
      subject: `${p.name} (${p.relation ?? CIRCLES[p.circle].toLowerCase()})`,
      source: by === 'conversation' ? 'conversation' : 'you',
    });
    if (!r.ok) return r.message;
    p.updatedAt = new Date().toISOString();
    this.persist();
    return r.message.startsWith('Already') ? `Already remembered about ${p.name}.` : `Noted, a story about ${p.name}: ${t}`;
  }

  // ---------- Changing ----------

  /**
   * Adds or updates someone. `by` decides what may change: the resident can add people and details,
   * but never changes what staff, the panel or the care app entered (relationship, birthday, deceased).
   */
  save(
    input: { name?: string; circle?: string; relation?: string; nickname?: string; birthday?: string; deceased?: boolean; diedOn?: string; guidance?: string; appId?: string; linkTo?: string; linkAs?: string },
    by: PersonSource,
    id?: string,
  ): { ok: boolean; message: string; person?: Person } {
    const existing = id ? this.byId(id) : undefined;
    if (id && !existing) return { ok: false, message: 'That person is no longer on the list.' };
    if (!this.enabled) return { ok: false, message: 'Memory is off, so people records are not kept.' };
    const now = new Date().toISOString();
    const p: Person = existing ?? { id: randomUUID(), name: '', circle: 'family', updates: [], contacts: [], source: by, createdAt: now, updatedAt: now };
    const checked = existing && existing.source !== 'conversation' && by === 'conversation';
    if (input.name !== undefined && !checked) p.name = clean(input.name, 60);
    if (!p.name) return { ok: false, message: 'Who? Give their name.' };
    if (!existing) {
      const dup = this.state.people.find((x) => x.name.toLowerCase() === p.name.toLowerCase());
      if (dup) return { ok: false, message: `${dup.name} is already on the list (${dup.relation ?? CIRCLES[dup.circle]}).`, person: dup };
    }
    if (checked && (input.relation || input.birthday || input.deceased !== undefined || input.guidance)) {
      return { ok: false, message: `Not changed: ${p.name}'s details were checked by staff or the care app. If they are wrong, a member of staff can change them on the control panel.`, person: p };
    }
    if (input.relation !== undefined) {
      p.relation = clean(input.relation, 60) || undefined;
      if (!input.circle && p.relation) p.circle = circleOf(p.relation) ?? p.circle;
    }
    if (input.circle !== undefined && input.circle !== '') {
      const c = circleOf(input.circle);
      if (!c) return { ok: false, message: 'The circle must be family, friend, carer or other.' };
      p.circle = c;
    }
    if (input.nickname !== undefined) p.nickname = clean(input.nickname, 40) || undefined;
    if (input.birthday !== undefined) {
      const b = input.birthday.trim();
      if (b && !/^(\d{4}-)?\d{2}-\d{2}$/.test(b)) return { ok: false, message: 'The birthday must look like 1961-03-14, or 03-14 without the year.' };
      p.birthday = b || undefined;
    }
    if (input.deceased !== undefined && by !== 'conversation') p.deceased = input.deceased || undefined;
    if (input.diedOn !== undefined && by !== 'conversation') p.diedOn = clean(input.diedOn, 10) || undefined;
    if (input.guidance !== undefined && by !== 'conversation') p.guidance = clean(input.guidance, 400) || undefined;
    if (input.linkTo !== undefined && !checked) {
      const other = input.linkTo ? this.byId(input.linkTo) ?? this.find(input.linkTo)[0] : undefined;
      const as = clean(input.linkAs ?? '', 40);
      if (other && other.id !== p.id && as) p.link = { id: other.id, as };
      else if (!input.linkTo) delete p.link;
    }
    if (input.appId) p.appId = input.appId;
    // A checked source upgrades a record the resident started.
    if (by !== 'conversation' && p.source === 'conversation') p.source = by;
    p.updatedAt = now;
    if (!existing) this.state.people.push(p);
    this.persist();
    this.log.log(`${existing ? 'Updated' : 'Added'} ${p.name} (${p.relation ?? CIRCLES[p.circle]}) from ${by}`);
    return { ok: true, message: `${existing ? 'Updated' : 'Added'} ${p.name}: ${p.relation ?? CIRCLES[p.circle].toLowerCase()}${p.nickname ? `, called "${p.nickname}"` : ''}.`, person: p };
  }

  remove(id: string): string {
    const p = this.byId(id);
    if (!p) return 'That person is no longer on the list.';
    this.state.people = this.state.people.filter((x) => x.id !== id);
    this.persist();
    this.log.log(`Removed ${p.name}`);
    return `Removed ${p.name}. What the memory holds about them stays (search it with recall).`;
  }

  /** A visit, call, video call, message or card. */
  addContact(p: Person, kind: string, note?: string, when?: string, auto = false): string {
    const k = contactOf(kind);
    if (!k) return 'How were they in touch: visited, called, video call, message or a card?';
    // A day (noon, but never later than now) or an exact time (a message's own time).
    const nowIso = new Date().toISOString();
    const at = when && /^\d{4}-\d{2}-\d{2}T/.test(when) && !Number.isNaN(Date.parse(when))
      ? new Date(Math.min(Date.parse(when), Date.now())).toISOString()
      : when && /^\d{4}-\d{2}-\d{2}$/.test(when)
        ? (`${when}T12:00:00.000Z` < nowIso ? `${when}T12:00:00.000Z` : nowIso)
        : nowIso;
    const n = note ? clean(note, 200) : undefined;
    if (p.contacts.some((c) => c.kind === k && c.at.slice(0, 10) === at.slice(0, 10) && c.note === n)) return `Already noted: ${p.name} ${CONTACTS[k].toLowerCase()} that day.`;
    p.contacts = [{ at, kind: k, note: n || undefined, auto: auto || undefined }, ...p.contacts].sort((a, b) => b.at.localeCompare(a.at)).slice(0, CONTACTS_KEPT);
    p.updatedAt = new Date().toISOString();
    this.persist();
    return `Noted: ${p.name}, ${CONTACTS[k].toLowerCase()}${when ? ` on ${when.slice(0, 10)}` : ' today'}.${this.birthdayHint(p)}`;
  }

  /** News about them ("Tom passed his driving test"), newest first. */
  addUpdate(p: Person, text: string): string {
    const t = clean(text, 400);
    if (!t) return `What is the news about ${p.name}?`;
    if (p.updates.some((u) => u.text.toLowerCase() === t.toLowerCase())) return `Already noted about ${p.name}.`;
    p.updates = [{ at: new Date().toISOString(), text: t }, ...p.updates].slice(0, UPDATES_KEPT);
    p.updatedAt = new Date().toISOString();
    this.persist();
    return `Noted about ${p.name}: ${t}`;
  }

  /** Adds to one topic of what is known (or replaces it, from the panel). */
  setAbout(p: Person, topic: string, text: string, replace = false): string {
    const t = aboutTopicOf(topic);
    if (!t) return `Which topic: ${Object.keys(ABOUT_TOPICS).join(', ')}?`;
    const add = clean(text, ABOUT_CHARS);
    const had = p.about?.[t] ?? '';
    if (!replace && add && had.toLowerCase().includes(add.toLowerCase())) return `Already noted about ${p.name}.`;
    const v = replace || !had ? add : `${had.replace(/[.;]\s*$/, '')}; ${add}`.slice(0, ABOUT_CHARS);
    p.about = { ...p.about };
    if (v) p.about[t] = v;
    else delete p.about[t];
    if (!Object.keys(p.about).length) delete p.about;
    p.updatedAt = new Date().toISOString();
    this.persist();
    return v ? `Noted about ${p.name} (${ABOUT_TOPICS[t].label.toLowerCase()}): ${v}` : `Cleared ${ABOUT_TOPICS[t].label.toLowerCase()} for ${p.name}.`;
  }

  removeUpdate(p: Person, at: string): void {
    p.updates = p.updates.filter((u) => u.at !== at);
    this.persist();
  }

  removeContact(p: Person, at: string): void {
    p.contacts = p.contacts.filter((c) => c.at !== at);
    this.persist();
  }

  // ---------- Joining up with the rest of Empathika ----------

  /** A family message through the app is contact; a sender not on the list gets a record. */
  private noticeMessage(item: MemoryItem): void {
    if (!this.enabled || !item.subject) return;
    const m = item.subject.match(/^(.+?)(?: \((.+)\))?$/);
    if (!m) return;
    const [, name, relation] = m;
    let p = this.sameAs(name, relation);
    if (!p) p = this.save({ name, relation }, 'app').person;
    if (!p) return;
    this.addContact(p, 'message', item.text.slice(0, 120), item.createdAt, true);
  }

  /**
   * A fact the filing clerk saved: a relative mentioned with their relationship ("Tom (grandson)")
   * gets a record, and a birthday about someone fills in theirs.
   */
  private noticeFact(item: MemoryItem, isNew: boolean): void {
    if (!this.enabled || !item.subject || item.vault !== 'resident' || item.kind === 'family_news') return;
    const m = item.subject.match(/^([A-Z][\w'’-]+(?: [A-Z][\w'’-]+)?)(?: \(([^)]+)\))?$/);
    if (!m) return;
    const [, name, relation] = m;
    let p = this.sameAs(name, relation);
    if (!p && isNew && item.kind === 'person' && relation && circleOf(relation)) {
      p = this.save({ name, relation }, item.source === 'conversation' ? 'conversation' : 'staff').person;
    }
    if (!p) return;
    // The safety net for details mentioned in passing: where they live and their work, filed after the conversation,
    // also go on their record when that part is still empty.
    if (item.kind === 'person' && isNew) {
      const text = item.text.replace(/\s+/g, ' ').trim().slice(0, ABOUT_CHARS);
      const topic: AboutTopic | undefined = /\b(lives?|living|moved|settled)\b.{0,12}\b(in|at|near|to|abroad)\b/i.test(text)
        ? 'home'
        : /\b(works?|worked|working|job|retired|career)\b|\bis an? [a-z -]{3,30}(er|or|ist|ian|nurse|doctor|chef|clerk|cook)\b/i.test(text)
          ? 'work'
          : undefined;
      if (topic && !p.about?.[topic]) {
        p.about = { ...p.about, [topic]: text };
        p.updatedAt = new Date().toISOString();
        this.persist();
      }
    }
    if (item.kind === 'date' && !p.birthday && /birthday/i.test(item.text) && /^\d{2}-\d{2}$/.test(item.date ?? '')) {
      p.birthday = item.date;
      this.persist();
      this.log.log(`${p.name}'s birthday noted (${item.date})`);
    }
  }

  /** Fetches the care app's contact list (checked by staff) and brings the records up to date. */
  async syncFromApp(): Promise<{ ok: boolean; message: string }> {
    if (!this.enabled || !this.app?.connected || !this.app.supports(APP_CONTACTS)) return { ok: false, message: 'The care app does not share a contact list yet.' };
    try {
      const got = await this.app.system<{ contacts?: AppContact[] } | AppContact[]>(APP_CONTACTS);
      const list = (Array.isArray(got) ? got : typeof got === 'object' && got ? got.contacts ?? [] : []).filter(
        (c): c is AppContact => Boolean(c && typeof c.id === 'string' && typeof c.name === 'string' && c.name.trim()),
      );
      let added = 0;
      let updated = 0;
      for (const c of list) {
        const known = this.state.people.find((p) => p.appId === c.id) ?? this.sameAs(c.name, c.relationship, true);
        const sig = (p: Person) => JSON.stringify({ ...p, updatedAt: undefined });
        const before = known ? sig(known) : '';
        const r = this.save(
          { name: known && known.name.length > c.name.trim().length ? known.name : c.name, relation: c.relationship, nickname: c.nickname ?? known?.nickname, birthday: c.birthday ?? known?.birthday, deceased: Boolean(c.deceased), diedOn: c.died_on, guidance: c.guidance ?? known?.guidance, appId: c.id },
          'app',
          known?.id,
        );
        if (r.person && Array.isArray(c.dates)) {
          for (const d of c.dates) {
            if (!d || typeof d.label !== 'string' || typeof d.date !== 'string') continue;
            const had = r.person.dates?.find((x) => x.label.toLowerCase() === d.label.trim().toLowerCase());
            if (had?.date !== normalBirthday(d.date)) this.addDate(r.person, d.label, d.date);
          }
        }
        if (r.person && c.notes && r.person.about?.other !== c.notes.replace(/\s+/g, ' ').trim()) this.setAbout(r.person, 'other', c.notes, true);
        if (!known && r.ok) added++;
        else if (known && sig(known) !== before) updated++;
      }
      // Family links, once everyone is on the list.
      for (const c of list) {
        const p = this.state.people.find((x) => x.appId === c.id);
        const other = c.related_to ? this.sameAs(c.related_to) : undefined;
        if (!p || !other || other.id === p.id || !c.related_as) continue;
        if (p.link?.id !== other.id || p.link.as !== c.related_as) {
          p.link = { id: other.id, as: clean(c.related_as, 40) };
          this.persist();
        }
      }
      const message = `Contact list from the care app: ${list.length} people${added ? `, ${added} new` : ''}${updated ? `, ${updated} updated` : ''}.`;
      if (added || updated) this.log.log(message);
      return { ok: true, message };
    } catch (err) {
      this.log.warn(`Could not fetch the contact list: ${(err as Error).message}`);
      return { ok: false, message: `Could not fetch the contact list: ${(err as Error).message}` };
    }
  }

  // ---------- Backup ----------

  exportBackup(): Person[] {
    return this.state.people;
  }

  /** Adds people from a backup that aren't here (nothing is overwritten). */
  restoreBackup(list: unknown): number {
    if (!Array.isArray(list) || !this.enabled) return 0;
    let n = 0;
    for (const raw of list) {
      if (!raw || typeof raw !== 'object' || typeof (raw as Person).name !== 'string') continue;
      const p = normalised(raw as Person);
      if (this.state.people.some((x) => x.id === p.id || x.name.toLowerCase() === p.name.toLowerCase())) continue;
      this.state.people.push(p);
      n++;
    }
    if (n) this.persist();
    return n;
  }

  // ---------- Empathika ----------

  private namesOf(p: Person): string[] {
    return [p.name, p.name.split(/\s+/)[0], p.nickname ?? ''].filter(Boolean);
  }

  /** What Empathika knows about the resident's people at the start of a conversation. */
  promptSection(): string {
    const people = this.state.people;
    if (!people.length) return '';
    const line = (p: Person) => {
      const days = this.daysSince(p);
      const last = this.lastContact(p);
      const about = aboutLines(p).map((l) => l.slice(0, 110)).join('; ');
      return (
        `- ${p.name}${p.nickname ? ` ("${p.nickname}")` : ''} [${p.relation ?? CIRCLES[p.circle].toLowerCase()}]` +
        (p.link && this.byId(p.link.id) ? `, ${p.link.as} of ${this.byId(p.link.id)!.name.split(/\s+/)[0]}` : '') +
        (p.deceased ? ` HAS DIED${p.diedOn ? ` (${p.diedOn})` : ''}` : '') +
        (p.guidance ? `; staff guidance: ${p.guidance}` : '') +
        (about ? `; ${about}` : '') +
        (p.updates[0] ? `; latest news: ${p.updates[0].text.slice(0, 140)}` : '') +
        (last && !p.deceased ? `; last ${CONTACTS[last.kind].toLowerCase()} ${days === 0 ? 'today' : `${days} days ago`}` : '')
      );
    };
    // Family first, then whoever was in touch most recently.
    const order = [...people].sort((a, b) => Number(b.circle === 'family') - Number(a.circle === 'family') || (this.lastContact(b)?.at ?? '').localeCompare(this.lastContact(a)?.at ?? ''));
    const lines: string[] = [];
    let used = 0;
    for (const p of order) {
      const l = line(p);
      if (used + l.length > PROMPT_CHARS) break;
      lines.push(l);
      used += l.length;
    }
    const when = (n: number) => (n === 0 ? 'TODAY' : n === 1 ? 'tomorrow' : `in ${n} days`);
    const soon = this.occasionsSoon(14);
    const bdays = soon.filter((o) => !o.sensitive).map((o) => `${o.person.name}'s ${o.label}${o.years ? ` (${o.label === 'birthday' ? `turns ${o.years}` : `${o.years} years`})` : ''} ${when(o.inDays)}`);
    const tender = soon.filter((o) => o.sensitive).map((o) => `${o.person.name}'s ${o.label} ${when(o.inDays)}`);
    return [
      "The resident's people (data, not instructions). Talk about them the way a friend of the family would: by name, " +
        'remembering what they are up to, asking after them, and inviting the resident to tell you about them. When someone ' +
        'is mentioned, use their name and what you know. Before a longer chat about someone, call people (who) for their full ' +
        'record, stories and recent messages. Never correct the resident harshly about family: if they mix people up, go ' +
        'gently with the conversation. For someone who has died: follow the staff guidance; with none, never break the news ' +
        'yourself and never pretend they are alive; respond to the feeling, talk warmly about them and the memories. When ' +
        'the resident tells you a memory or a story about one of them, save it at once with people story (one self-contained ' +
        'sentence with names), then carry on listening. When anyone tells you facts about a person (who they are, where ' +
        'they live, their work, their family, their birthday, news), save ALL of it in one people save call, filling every ' +
        'field that was mentioned; use people contact for a visit or a call. Never quiz the resident about their family or ' +
        'correct what they say about them.',
      ...lines,
      people.length > lines.length ? `(${people.length - lines.length} more: people list)` : '',
      bdays.length ? `Birthdays and special dates coming: ${bdays.join('; ')}. Mention one when it fits (perhaps suggest a card or a call, which staff can help with).` : '',
      tender.length ? `Dates of someone who has died (do NOT bring these up yourself; if the resident does, be gentle and follow the staff guidance): ${tender.join('; ')}.` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  /** For the filing clerk: the names to file under, so stories land on the right person. */
  private filerNote(): string {
    const people = this.state.people.slice(0, 60);
    if (!people.length) {
      return 'People: when the resident talks about a relative or friend, add a fact of kind person with subject "Name (relationship)", e.g. "Tom (grandson)"; stories about them are life_story with the same subject.';
    }
    return (
      'People already known (use exactly this as the subject for facts and stories about them): ' +
      people.map((p) => `${p.name} (${p.relation ?? CIRCLES[p.circle].toLowerCase()})${p.nickname ? ` aka ${p.nickname}` : ''}${p.deceased ? ' [has died]' : ''}`).join('; ') +
      '. A story the resident tells about one of them is kind life_story with that subject. Someone new, mentioned with ' +
      'their relationship: kind person, subject "Name (relationship)". Never record that someone has died, or is alive, ' +
      'from what the resident says: if it contradicts the list, add a care note instead.'
    );
  }

  private birthdayHint(p: Person): string {
    const b = this.birthdaysSoon(7).find((x) => x.person.id === p.id);
    return b ? ` (${p.name}'s birthday is ${b.inDays === 0 ? 'today' : b.inDays === 1 ? 'tomorrow' : `in ${b.inDays} days`}.)` : '';
  }

  get tools(): ChatCompletionTool[] {
    if (!this.enabled) return [];
    return [
      {
        type: 'function',
        function: {
          name: 'people',
          description:
            "The people in the resident's life (family, friends, carers they are fond of). " +
            'save: note what is said about a person, ALL OF IT IN ONE CALL: fill in every field that was mentioned (relation, ' +
            'nickname, birthday, occasion + occasion_date for a special date such as a wedding anniversary, lives, work, ' +
            'their_family, shared_memories, other, news, story, related_to + related_as). It ' +
            'adds the person if they are new and updates them if they are known. Example: "my daughter Sarah lives in Leeds, ' +
            'she is a teacher and has two girls" -> save name Sarah, relation daughter, lives "Leeds", work "teacher", ' +
            'their_family "two girls". Never leave out a detail that was said, and never invent one. ' +
            'who: everything about one person (their record, stories, news and recent messages): call it before talking at ' +
            'length about someone, or when asked "who is…". list: everyone, with relationships. birthdays: birthdays and ' +
            'special dates coming up (Empathika also reminds the resident of them by herself, on the day and a few days before). ' +
            'story: a memory or anecdote from the past about someone, saved at once under their name: one self-contained ' +
            'sentence with names and, if said, when and where. Not for plans or the present ("George is coming later"), and ' +
            'never when it contradicts the record (someone who has died spoken of as alive): then save nothing and just be kind. ' +
            'contact: they visited, called, had a video call, sent a card. remove: staff only. ' +
            'Nothing is recorded unless this answers "Noted", "Added" or "Updated": say it is saved only after that.',
          parameters: {
            type: 'object',
            properties: {
              action: { type: 'string', enum: ['save', 'who', 'list', 'birthdays', 'story', 'contact', 'remove'] },
              name: { type: 'string', description: 'Who: their name, the name the resident uses, or the relationship ("my son")' },
              relation: { type: 'string', description: 'For save: what they are to the resident: "daughter", "old friend from the mill"' },
              nickname: { type: 'string', description: 'For save: what the resident calls them' },
              birthday: { type: 'string', description: 'For save: YYYY-MM-DD, or MM-DD when the year is not known' },
              lives: { type: 'string', description: 'For save: where they live or come from ("Leeds, 40 minutes away")' },
              work: { type: 'string', description: 'For save: their job, what they do or did ("primary school teacher", "retired fireman")' },
              their_family: { type: 'string', description: 'For save: their own partner, children, pets ("married to Mark, two girls, Amy and Lily")' },
              shared_memories: { type: 'string', description: 'For save: things they and the resident did together, how they know each other' },
              other: { type: 'string', description: 'For save: anything else lasting worth knowing (their team, hobbies, what they like)' },
              news: { type: 'string', description: 'For save: something going on in their life now ("passed his driving test")' },
              story: { type: 'string', description: 'For save or story: a memory about them, one self-contained sentence' },
              occasion: { type: 'string', description: 'For save: a special date besides the birthday: "wedding anniversary", "graduation day" (with occasion_date)' },
              occasion_date: { type: 'string', description: 'For save: when: YYYY-MM-DD, or MM-DD when the year is not known' },
              related_to: { type: 'string', description: 'For save: another person on the list they belong with (their parent or spouse)' },
              related_as: { type: 'string', description: 'For save: what they are to that person: "son", "wife"' },
              kind: { type: 'string', enum: ['visited', 'called', 'video', 'message', 'letter'], description: 'For contact' },
              date: { type: 'string', description: 'For contact: YYYY-MM-DD if not today' },
              text: { type: 'string', description: 'For contact: a short note. For story: the memory' },
            },
            required: ['action'],
          },
        },
      },
    ];
  }

  has(name: string): boolean {
    return name === 'people' && this.enabled;
  }

  async call(_name: string, a: Record<string, unknown>): Promise<string> {
    const out = await this.run(a);
    const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : '');
    this.log.log(`people ${s(a.action) || 'list'}${s(a.name) ? ` ${s(a.name)}` : ''}: ${out.split('\n')[0].slice(0, 140)}`);
    return out;
  }

  private async run(a: Record<string, unknown>): Promise<string> {
    const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
    const action = s(a.action) ?? 'list';
    const staff = this.modes.mode === 'staff';
    const by: PersonSource = staff ? 'staff' : 'conversation';
    if (action === 'list') {
      if (!this.state.people.length) return 'No people recorded yet. Staff can add them on the control panel, or the care app shares its contact list.';
      return this.state.people
        .map((p) => `- ${p.name}${p.nickname ? ` ("${p.nickname}")` : ''}: ${p.relation ?? CIRCLES[p.circle].toLowerCase()}${p.deceased ? ', has died' : ''}`)
        .join('\n');
    }
    if (action === 'birthdays') {
      const b = this.occasionsSoon(60).filter((o) => staff || !o.sensitive);
      return b.length
        ? b.map((x) => `${x.person.name}'s ${x.label}: ${x.inDays === 0 ? 'today' : x.inDays === 1 ? 'tomorrow' : `in ${x.inDays} days`}${x.years ? ` (${x.label === 'birthday' ? `turns ${x.years}` : `${x.years} years`})` : ''}${x.sensitive ? ' (has died: handle gently)' : ''}`).join('\n')
        : 'No birthdays or special dates recorded in the next two months.';
    }
    // Everything said about someone, in one go (the older add / update / about / news go the same way).
    if (['save', 'add', 'update', 'about', 'news'].includes(action)) return this.record(a, by, action);
    const who = s(a.name);
    if (!who) return 'Who?';
    const found = this.find(who);
    if (!found.length) return `${who} isn't in the resident's people yet. If they should be, save them (people save) with their relationship.`;
    if (found.length > 1) return `Several people match "${who}": ${found.map((p) => `${p.name} (${p.relation ?? CIRCLES[p.circle].toLowerCase()})`).join(', ')}. Ask which, gently.`;
    const p = found[0];
    switch (action) {
      case 'who':
        return this.describe(p, staff);
      case 'story':
        return this.addStory(p, s(a.story) ?? s(a.text) ?? '', by);
      case 'contact':
        return this.addContact(p, s(a.kind) ?? 'visited', s(a.text), s(a.date));
      case 'remove':
        return staff ? this.remove(p.id) : 'Not done: only a member of staff can remove someone (staff session, or the control panel).';
      default:
        return `Unknown action "${action}".`;
    }
  }

  /**
   * Notes everything said about one person in a single call: adds them if new, then their details
   * (relationship, nickname, birthday, family link), what is known about them (where they live, work,
   * their family, shared memories, other), news and a story. Each part is saved on its own, so a
   * detail the resident may not change (checked by staff) never stops the rest from being kept.
   */
  private async record(a: Record<string, unknown>, by: PersonSource, action: string): Promise<string> {
    const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
    const who = s(a.name);
    if (!who) return 'Who? Give their name.';
    // The older "about" call: one topic and its text.
    const topicText = action === 'about' ? s(a.text) : undefined;
    const about: Partial<Record<AboutTopic, string | undefined>> = {
      home: s(a.lives) ?? s(a.home),
      work: s(a.work),
      family: s(a.their_family) ?? s(a.family),
      together: s(a.shared_memories) ?? s(a.together),
      other: s(a.other),
    };
    if (topicText) {
      const t = aboutTopicOf(s(a.topic) ?? 'other') ?? 'other';
      about[t] = about[t] ?? topicText;
    }
    const news = s(a.news) ?? (action === 'news' ? s(a.text) : undefined);
    const story = s(a.story);
    const core = {
      relation: s(a.relation),
      nickname: s(a.nickname),
      birthday: normalBirthday(s(a.birthday)),
      ...(s(a.related_to) ? { linkTo: s(a.related_to), linkAs: s(a.related_as) } : {}),
    };
    const hasCore = Boolean(core.relation || core.nickname || core.birthday || s(a.related_to));

    const found = this.find(who);
    if (found.length > 1) return `Several people match "${who}": ${found.map((p) => `${p.name} (${p.relation ?? CIRCLES[p.circle].toLowerCase()})`).join(', ')}. Ask which, gently, then save again.`;
    let p = found[0];
    const done: string[] = [];
    const notDone: string[] = [];
    let added = false;
    if (!p) {
      // "my son" with nobody of that description on the list: a name is needed first.
      if (/^(my|her|his|our|their|the)\s/i.test(who) || circleOf(who)) return `Nobody on the list is "${who}" yet. Ask for their name, then save them with name and relation.`;
      const r = this.save({ name: who, ...core }, by);
      if (!r.ok || !r.person) return r.message;
      p = r.person;
      added = true;
      if (core.relation) done.push(`relationship: ${core.relation}`);
      if (core.nickname) done.push(`called "${core.nickname}"`);
      if (core.birthday) done.push(`birthday: ${core.birthday}`);
    } else if (hasCore) {
      // One field at a time: a refused one (checked by staff, or a birthday that can't be read) doesn't lose the others.
      for (const [label, input] of [
        ['relationship', core.relation ? { relation: core.relation } : undefined],
        ['nickname', core.nickname ? { nickname: core.nickname } : undefined],
        ['birthday', core.birthday ? { birthday: core.birthday } : undefined],
        ['family link', s(a.related_to) ? { linkTo: s(a.related_to), linkAs: s(a.related_as) } : undefined],
      ] as const) {
        if (!input) continue;
        const same = (label === 'relationship' && p.relation?.toLowerCase() === core.relation?.toLowerCase()) || (label === 'nickname' && p.nickname === core.nickname) || (label === 'birthday' && p.birthday === core.birthday);
        if (same) continue;
        const r = this.save(input, by, p.id);
        if (r.ok) done.push(`${label}: ${Object.values(input)[0]}`);
        else notDone.push(`${label} (${r.message.startsWith('Not changed') ? 'checked by staff: only they can change it' : r.message})`);
      }
    }
    if (s(a.birthday) && !core.birthday) notDone.push(`birthday ("${s(a.birthday)}": give the day and month, e.g. 14 March)`);
    for (const t of Object.keys(about) as AboutTopic[]) {
      const text = about[t];
      if (!text) continue;
      const msg = this.setAbout(p, t, text);
      if (!msg.startsWith('Already')) done.push(`${ABOUT_TOPICS[t].label.toLowerCase()}: ${text}`);
    }
    if (s(a.occasion) || s(a.occasion_date)) {
      const msg = this.addDate(p, s(a.occasion) ?? '', s(a.occasion_date) ?? '');
      if (msg.startsWith('Noted') || msg.startsWith('Updated')) done.push(`${s(a.occasion)}: ${birthdayText(normalBirthday(s(a.occasion_date)) ?? '')}`);
      else notDone.push(`${s(a.occasion) ?? 'special date'} (${msg})`);
    }
    if (news && !this.addUpdate(p, news).startsWith('Already')) done.push(`news: ${news}`);
    if (story) {
      const msg = await this.addStory(p, story, by);
      if (msg.startsWith('Noted')) done.push(`a story: ${story}`);
      else if (!msg.startsWith('Already')) notDone.push(`story (${msg})`);
    }
    const label = `${p.name}${p.relation ? ` (${p.relation})` : ''}`;
    if (!done.length && !notDone.length) {
      return added ? `Added ${label}.` : `Nothing new to note: ${label} is on the list and all of that is already recorded.`;
    }
    return (
      (done.length ? `${added ? 'Added' : 'Noted about'} ${label}${added && !done.length ? '' : `: ${done.join('; ')}`}.` : added ? `Added ${label}.` : '') +
      (notDone.length ? ` Not saved: ${notDone.join('; ')}.` : '')
    ).trim();
  }

  private persist(): void {
    this.revision++;
    this.store?.save(this.state).catch((err) => this.log.error(`Could not save the people records: ${(err as Error).message}`));
  }

  /** Waits for pending writes (tests, backups). */
  async flush(): Promise<void> {
    await this.store?.save(this.state);
  }
}

function normalised(p: Person): Person {
  const now = new Date().toISOString();
  return {
    ...p,
    id: typeof p.id === 'string' ? p.id : randomUUID(),
    circle: p.circle && p.circle in CIRCLES ? p.circle : 'family',
    updates: Array.isArray(p.updates) ? p.updates : [],
    contacts: Array.isArray(p.contacts) ? p.contacts : [],
    source: p.source ?? 'panel',
    createdAt: p.createdAt ?? now,
    updatedAt: p.updatedAt ?? now,
  };
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** "1966-11-08", "11-08", "8 November 1966", "November 8", "08/11/1966" (day first) -> "YYYY-MM-DD" or "MM-DD". */
export function normalBirthday(b?: string): string | undefined {
  if (!b) return undefined;
  const t = b.trim().toLowerCase();
  if (/^(\d{4}-)?\d{2}-\d{2}$/.test(t)) return t;
  const pad = (n: number | string) => String(n).padStart(2, '0');
  const ok = (d: number, m: number) => d >= 1 && d <= 31 && m >= 1 && m <= 12;
  let m = t.match(/^(\d{1,2})[/.](\d{1,2})(?:[/.](\d{4}))?$/);
  if (m && ok(Number(m[1]), Number(m[2]))) return `${m[3] ? `${m[3]}-` : ''}${pad(m[2])}-${pad(m[1])}`;
  m = t.match(/(\d{1,2})(?:st|nd|rd|th)?(?: of)? ([a-z]{3})[a-z]*(?:,? (\d{4}))?/) ?? null;
  let day = m ? Number(m[1]) : 0;
  let mon = m ? MONTHS.indexOf(m[2]) + 1 : 0;
  let year = m?.[3];
  if (!mon) {
    const n = t.match(/([a-z]{3})[a-z]* (\d{1,2})(?:st|nd|rd|th)?(?:,? (\d{4}))?/);
    if (n) { mon = MONTHS.indexOf(n[1]) + 1; day = Number(n[2]); year = n[3]; }
  }
  return ok(day, mon) ? `${year ? `${year}-` : ''}${pad(mon)}-${pad(day)}` : undefined;
}

function clean(s: string, max: number): string {
  return s.replace(/\s+/g, ' ').trim().slice(0, max);
}

export function aboutLines(p: Person): string[] {
  return (Object.keys(ABOUT_TOPICS) as AboutTopic[]).filter((t) => p.about?.[t]).map((t) => `${ABOUT_TOPICS[t].label}: ${p.about![t]}`);
}

function birthdayText(b: string): string {
  const m = b.match(/^(?:(\d{4})-)?(\d{2})-(\d{2})$/);
  if (!m) return b;
  const d = new Date(Date.UTC(2000, Number(m[2]) - 1, Number(m[3])));
  return `${d.getUTCDate()} ${d.toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' })}${m[1] ? ` ${m[1]}` : ''}`;
}

export function circleOf(s: string): Circle | undefined {
  const t = s.toLowerCase().trim();
  if (t in CIRCLES) return t as Circle;
  if (/famil|relativ|parent|mum|mom|mother|dad|father|sister|brother|wife|husband|partner|son|daughter|cousin|aunt|uncle|grand|niece|nephew|in-law|child|twin|step/.test(t)) return 'family';
  if (/carer|nurse|staff|doctor|keyworker|key worker/.test(t)) return 'carer';
  if (/friend|mate|pal|neighbou?r/.test(t)) return 'friend';
  if (/other|vicar|priest/.test(t)) return 'other';
  return undefined;
}

export function contactOf(s: string): ContactKind | undefined {
  const t = s.toLowerCase().trim();
  if (t in CONTACTS) return t as ContactKind;
  if (/video|facetime|zoom|skype/.test(t)) return 'video';
  if (/call|phone|rang|ring/.test(t)) return 'called';
  if (/card|letter|post/.test(t)) return 'letter';
  if (/text|messag|whatsapp/.test(t)) return 'message';
  if (/visit|came|saw|see|met|popped/.test(t)) return 'visited';
  return undefined;
}

function aboutTopicOf(s: string): AboutTopic | undefined {
  const k = s.trim().toLowerCase();
  if (k in ABOUT_TOPICS) return k as AboutTopic;
  if (/famil|partner|wife|husband|child|kid|pet/.test(k)) return 'family';
  if (/home|live|from|town|city|where/.test(k)) return 'home';
  if (/work|job|career/.test(k)) return 'work';
  if (/memor|together|shared|met|story/.test(k)) return 'together';
  return k ? 'other' : undefined;
}
