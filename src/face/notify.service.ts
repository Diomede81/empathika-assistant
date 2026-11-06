import { Inject, Injectable, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../config';
import { FaceService } from './face.service';
import { Card, CardHandlers } from './screen';
import { LockService } from '../lock/lock.service';
import { FamilyUpdatesService, whenSaid } from '../care-app/family-updates.service';
import { TimerService } from '../actions/timer.service';
import { MemoryItem } from '../memory/memory.service';
import { AmbientService } from './ambient.service';
import { DeviceService } from '../device/device.service';
import { ActivitiesService, ActivityKind, KINDS } from '../activities/activities.service';
import { PeopleService } from '../people/people.service';
import { ConversationControl } from '../actions/conversation-control';
import { localToday, timeZone } from '../actions/clock';

const TICK_MS = 15_000;
const NOTE_MS = 15 * 60_000;

interface PuzzleCard {
  kind: ActivityKind;
  title: string;
  icon: string;
  big: string;
  hint?: string;
}

interface Pending {
  card: Card;
  handlers: CardHandlers;
}

/**
 * Notifications on the round screen, shown when something needs attention even though nobody
 * asked. They wait politely: never while someone is talking to Empathika, never over a card
 * that's in use (a timer, the staff keypad), and never while she is locked.
 */
@Injectable()
export class NotifyService implements OnModuleInit, OnModuleDestroy {
  private pending: Pending[] = [];
  private ticks: NodeJS.Timeout[] = [];

  constructor(
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
    private readonly face: FaceService,
    @Optional() private readonly lock?: LockService,
    @Optional() private readonly family?: FamilyUpdatesService,
    @Optional() private readonly timers?: TimerService,
    @Optional() private readonly ambient?: AmbientService,
    @Optional() private readonly device?: DeviceService,
    @Optional() private readonly activities?: ActivitiesService,
    @Optional() private readonly people?: PeopleService,
    @Optional() private readonly control?: ConversationControl,
  ) {}

  /** The day the birthday card last went out. */
  private birthdayShownOn?: string;

  onModuleInit(): void {
    // Family photos go to the evening photo frame.
    if (this.family && this.ambient) this.family.addPhoto = (data) => this.ambient!.addPhoto(data);
    if (!this.cfg.face.enabled) return;
    this.ticks.push(setInterval(() => this.deliver(), TICK_MS));
    this.family?.on('new', () => this.familyCard());
    this.activities?.on('show', (c: PuzzleCard) => this.puzzleCard(c));
    this.activities?.on('hint', (hint: string) => this.puzzleHint(hint));
    this.activities?.on('clear', () => this.face.dismissCard('activity'));
    this.activities?.on('invite', (kind: ActivityKind) => this.inviteCard(kind));
    this.ticks.push(setInterval(() => this.birthdayCard(), 10 * 60_000));
    setTimeout(() => this.birthdayCard(), 60_000).unref?.();
    this.family?.on('shared', () => {
      if (!this.family?.unshared().length) {
        this.pending = this.pending.filter((p) => p.card.id !== 'notify-family');
        this.face.dismissCard('notify-family');
      }
    });
  }

  // ---------- News from the family ----------

  /** A card for the messages not yet passed on: "Read it to me" says them out loud. */
  private familyCard(): void {
    const news = this.family?.unshared() ?? [];
    if (!news.length) return;
    const last = news[news.length - 1];
    const several = news.length > 1;
    this.notify(
      {
        id: 'notify-family',
        kind: 'notice',
        icon: '💌',
        title: several ? `${news.length} messages from family` : 'A message from family',
        subtitle: `${last.subject ?? 'Family'} · ${whenSaid(last.createdAt)}`,
        big: several ? `From ${[...new Set(news.map((i) => (i.subject ?? 'family').replace(/ \(.*\)$/, '')))].join(', ')}` : `${(last.subject ?? 'Your family').replace(/ \(.*\)$/, '')} sent you a message`,
        actions: [{ id: 'read', label: 'Read it to me', style: 'primary' }, { id: 'later', label: 'Later' }],
        ttlMs: 60 * 60_000,
      },
      {
        read: () => this.readOut(news),
        later: () => this.face.dismissCard('notify-family'),
      },
    );
  }

  /** Reads the messages out exactly as written (not through the AI), and shows the last one. */
  private readOut(news: MemoryItem[]): void {
    this.face.dismissCard('notify-family');
    for (const i of news) this.timers?.announce(this.family!.spoken(i));
    this.family?.markShared(news);
  }

  // ---------- Activities ----------

  private puzzle?: PuzzleCard;

  /** The current puzzle, big on the screen (shown straight away: it's part of the conversation). */
  private puzzleCard(c: PuzzleCard, hint?: string): void {
    this.puzzle = c;
    this.face.showCard(
      { id: 'activity', kind: 'notice', icon: c.icon, title: c.title, big: c.big, subtitle: hint, actions: c.hint && !hint ? [{ id: 'hint', label: 'Clue' }] : [], ttlMs: 15 * 60_000 },
      { hint: () => void this.activities?.hint() },
    );
  }

  private puzzleHint(hint: string): void {
    if (this.puzzle) this.puzzleCard(this.puzzle, hint);
  }

  /** "Fancy a little puzzle?" at the times set on the control panel. */
  private inviteCard(kind: ActivityKind): void {
    if (this.face.info().muted) return; // the microphone is off: she couldn't hear the answer
    const k = KINDS[kind];
    const question = kind === 'reminiscence' ? 'Fancy a chat about the old days?' : kind === 'quiz' ? 'Fancy a little quiz?' : `Fancy a ${k.label.toLowerCase()}?`;
    this.notify(
      { id: 'notify-activity', kind: 'notice', icon: k.icon, title: 'Something to do', big: question, actions: [{ id: 'yes', label: 'Yes please', style: 'primary' }, { id: 'later', label: 'Not now' }], ttlMs: 30 * 60_000 },
      {
        yes: () => {
          this.face.dismissCard('notify-activity');
          const opening = this.activities!.startFromScreen(kind);
          if (!this.control?.requestStart(opening)) this.activities!.finish('stopped');
        },
        later: () => this.face.dismissCard('notify-activity'),
      },
    );
  }

  // ---------- Birthdays ----------

  /** On the morning of a birthday in the family: a card, so the resident (and staff) know. */
  private birthdayCard(): void {
    const today = localToday();
    if (!this.people || this.birthdayShownOn === today) return;
    const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: timeZone() }).format(new Date()));
    if (hour < 9 || hour >= 20) return;
    const b = this.people.birthdaysSoon(0);
    if (!b.length) return;
    this.birthdayShownOn = today;
    const names = b.map((x) => `${x.person.name}${x.person.relation ? ` (${x.person.relation})` : ''}${x.age ? `, ${x.age} today` : ''}`);
    this.notify(
      { id: 'notify-birthday', kind: 'notice', icon: '🎂', title: 'A birthday today', big: b.length === 1 ? `It's ${b[0].person.name}'s birthday` : `Birthdays: ${b.map((x) => x.person.name).join(' and ')}`, subtitle: names.join(' · '), actions: [{ id: 'ok', label: 'Lovely' }], ttlMs: 2 * 60 * 60_000 },
      { ok: () => this.face.dismissCard('notify-birthday') },
    );
  }

  onModuleDestroy(): void {
    for (const t of this.ticks) clearInterval(t);
  }

  // ---------- Showing them, politely ----------

  /** Queue a notification (a newer one with the same id replaces the older). */
  notify(card: Card, handlers: CardHandlers = {}): void {
    this.pending = [...this.pending.filter((p) => p.card.id !== card.id), { card: { ttlMs: NOTE_MS, ...card }, handlers }];
    this.deliver();
  }

  /** Shows the next waiting notification if now is a good moment. */
  deliver(): void {
    if (this.lock?.locked) return; // kept until the start-up code is entered
    if (this.device?.nightNow) return; // night mode: kept until the morning
    if (!this.pending.length) return;
    const info = this.face.info();
    if (info.state !== 'idle') return; // talking, asleep, or setting up the WiFi
    const c = info.card;
    if (c && !c.id.startsWith('notify-')) return; // you're using a card
    if (c?.id.startsWith('notify-')) return; // one at a time: the next when this one is gone
    const next = this.pending.shift()!;
    this.face.showCard(next.card, next.handlers);
  }
}
