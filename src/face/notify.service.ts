import { Inject, Injectable, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../config';
import { FaceService } from './face.service';
import { Card, CardHandlers } from './screen';
import { LockService } from '../lock/lock.service';
import { FamilyUpdatesService, whenSaid } from '../care-app/family-updates.service';
import { TimerService } from '../actions/timer.service';
import { MemoryItem } from '../memory/memory.service';
import { AmbientService } from './ambient.service';

const TICK_MS = 15_000;
const NOTE_MS = 15 * 60_000;

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
  ) {}

  onModuleInit(): void {
    // Family photos go to the evening photo frame.
    if (this.family && this.ambient) this.family.addPhoto = (data) => this.ambient!.addPhoto(data);
    if (!this.cfg.face.enabled) return;
    this.ticks.push(setInterval(() => this.deliver(), TICK_MS));
    this.family?.on('new', () => this.familyCard());
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
