import { EventEmitter } from 'node:events';
import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import { APP_CONFIG, AppConfig } from '../config';
import { MemoryService } from '../memory/memory.service';
import { ModesService } from '../memory/modes.service';
import { memorySecret, SealedStore } from '../memory/sealed-store';
import { localToday, timeZone } from '../actions/clock';
import { CareAppService } from '../care-app/care-app.service';
import { PeopleService } from '../people/people.service';
import { ANAGRAMS, CATEGORIES, money, norm, numberPuzzle, QUIZ_TOPICS, RECALL_WORDS, REMINISCENCE, saidWord, SAYINGS, scramble, spokenNumbers } from './content';

/** The activities: the first four are run and checked by Empathika herself, the others by the AI. */
export const KINDS = {
  words: { label: 'Word puzzle', icon: '🔤', checked: true, about: 'unscramble a word, with a clue' },
  sayings: { label: 'Finish the saying', icon: '💬', checked: true, about: 'old sayings to complete' },
  numbers: { label: 'Number puzzle', icon: '🔢', checked: true, about: 'sums, times tables and counting change' },
  memory: { label: 'Memory game', icon: '🧠', checked: true, about: 'remember a few words, chat a moment, then recall them' },
  quiz: { label: 'Quiz', icon: '❓', checked: false, about: 'a gentle quiz on a topic they like' },
  categories: { label: 'Name five', icon: '📝', checked: false, about: 'name things in a category' },
  reminiscence: { label: 'Memory lane', icon: '📷', checked: false, about: 'talking about the old days, their life and their people' },
} as const;
export type ActivityKind = keyof typeof KINDS;
const KIND_NAMES = Object.keys(KINDS) as ActivityKind[];

type Level = 1 | 2 | 3;

interface Item {
  ask: string;
  /** Shown big on the screen. */
  show: string;
  /** A clue (shown with Hint, or said when asked). */
  hint?: string;
  /** The answer said back when they give up or get it wrong. */
  answer: string;
  check: { word?: string; keys?: string[]; number?: number; money?: boolean; recall?: string[] };
}

interface Game {
  kind: ActivityKind;
  level: Level;
  items: Item[];
  index: number;
  asked: number;
  correct: number;
  hints: number;
  /** Tries at the current item (a second go before the answer is given). */
  tries: number;
  startedAt: string;
  /** Memory game: the words were shown, a chat comes before the recall. */
  phase?: 'remember' | 'recall';
  topic?: string;
}

/** One finished (or stopped) activity, for staff and the care app. */
export interface Session {
  at: string;
  kind: ActivityKind;
  level: Level;
  asked: number;
  correct: number;
  minutes: number;
  /** finished = played to the end; stopped = they had enough (that's fine). */
  ended: 'finished' | 'stopped';
  topic?: string;
}

export interface ActivitySettings {
  /** The daily invitation on the screen ("Fancy a little puzzle?"). */
  invite: boolean;
  /** "10:30". */
  inviteTime: string;
  /** A second invitation in the afternoon ("" = none). */
  inviteTime2: string;
}

interface State {
  levels: Partial<Record<ActivityKind, Level>>;
  sessions: Session[];
  settings?: Partial<ActivitySettings>;
  /** Days ("YYYY-MM-DD HH:MM") an invitation already went out. */
  invited?: string[];
}

const DEFAULTS: ActivitySettings = { invite: true, inviteTime: '10:30', inviteTime2: '15:00' };
const SESSIONS_KEPT = 1000;
const ITEMS_PER_GAME = 5;
const LOG_TOOL = 'activity_log_add';
const STALE_MS = 45 * 60_000;

/**
 * Keeping the resident's mind active, gently: word and number puzzles, finishing old sayings, a
 * "remember these words" game, quizzes on topics they enjoy, naming things in a category, and
 * memory-lane conversations built from their own life story and people.
 *
 * Empathika checks the answers of her own puzzles (not the AI), so scores mean something; the level
 * follows how they do (3 levels per activity). Each session is logged: staff see on the control panel
 * how often the resident plays, what they enjoy and how they're doing, and each one goes to the care
 * app (activity_log_add) when it offers that. A daily invitation on the screen ("Fancy a little
 * puzzle?") starts one with a tap. Never a test: praise effort, give the answer kindly, stop any time.
 *
 * Emits 'show' (an Item card for the screen), 'clear' (game over), 'invite' (time for the invitation).
 */
@Injectable()
export class ActivitiesService extends EventEmitter implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Activities');
  private state: State = { levels: {}, sessions: [] };
  private store?: SealedStore<State>;
  private game?: Game;
  private lastMove = 0;
  private timer?: NodeJS.Timeout;
  /** Rotates which activity the invitation offers. */
  private offerIndex = 0;
  revision = 0;

  constructor(
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
    private readonly memory: MemoryService,
    private readonly modes: ModesService,
    @Optional() private readonly app?: CareAppService,
    @Optional() private readonly people?: PeopleService,
  ) {
    super();
  }

  onModuleInit(): void {
    if (!this.memory.enabled) return;
    this.store = new SealedStore(this.cfg.memory.dir, 'activities', memorySecret(this.cfg));
    try {
      const s = this.store.load();
      if (s) this.state = { levels: s.levels ?? {}, sessions: Array.isArray(s.sessions) ? s.sessions : [], settings: s.settings, invited: s.invited };
    } catch (err) {
      this.log.error(`Could not read the activity log (${(err as Error).message}); starting afresh`);
    }
    this.memory.sections.push(() => this.promptSection());
    this.timer = setInterval(() => this.tick(), 30_000);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  get enabled(): boolean {
    return Boolean(this.store);
  }

  get settings(): ActivitySettings {
    return { ...DEFAULTS, ...(this.state.settings ?? {}) };
  }

  saveSettings(input: { invite: boolean; inviteTime?: string; inviteTime2?: string }): string {
    const time = (t?: string) => (t === undefined ? undefined : t.trim());
    const t1 = time(input.inviteTime) ?? this.settings.inviteTime;
    const t2 = time(input.inviteTime2) ?? this.settings.inviteTime2;
    if (!/^\d{2}:\d{2}$/.test(t1) || (t2 && !/^\d{2}:\d{2}$/.test(t2))) return 'Times should look like 10:30.';
    this.state.settings = { invite: input.invite, inviteTime: t1, inviteTime2: t2 };
    this.persist();
    return input.invite ? `Empathika offers an activity at ${t1}${t2 ? ` and ${t2}` : ''}.` : 'No invitations: Empathika offers activities only in conversation.';
  }

  get sessions(): Session[] {
    return this.state.sessions;
  }

  get playing(): ActivityKind | undefined {
    if (this.game && Date.now() - this.lastMove > STALE_MS) this.finish('stopped');
    return this.game?.kind;
  }

  level(kind: ActivityKind): Level {
    return this.state.levels[kind] ?? 1;
  }

  setLevel(kind: ActivityKind, level: Level): void {
    this.state.levels[kind] = level;
    this.persist();
  }

  // ---------- Playing ----------

  /** Starts an activity; returns what Empathika says first (instructions plus the first question). */
  start(kind: ActivityKind, level?: Level, topic?: string): string {
    if (this.game) this.finish('stopped');
    const lv = level ?? this.level(kind);
    const g: Game = { kind, level: lv, items: [], index: 0, asked: 0, correct: 0, hints: 0, tries: 0, startedAt: new Date().toISOString(), topic };
    this.lastMove = Date.now();
    switch (kind) {
      case 'words':
        g.items = pick(ANAGRAMS[lv], ITEMS_PER_GAME).map(([w, clue]) => {
          const letters = scramble(w).split('').join(' ');
          return { ask: `Unscramble these letters: ${letters}. Clue: ${clue}.`, show: letters, hint: `It starts with ${w[0]}, and it's ${clue}.`, answer: w.toLowerCase(), check: { word: w.toLowerCase() } };
        });
        break;
      case 'sayings':
        g.items = pick(SAYINGS, ITEMS_PER_GAME).map(([start, end, keys]) => ({ ask: `Finish the saying: ${start}`, show: start, hint: `It ends with "${keys[keys.length - 1]}".`, answer: `${start.replace(/…$/, '')} ${end}`, check: { keys } }));
        break;
      case 'numbers':
        g.items = Array.from({ length: ITEMS_PER_GAME }, () => {
          const p = numberPuzzle(lv);
          return { ask: p.ask, show: p.show, answer: p.money ? money(p.answer) : String(p.answer), hint: p.money ? 'Count up from the price to what you paid.' : 'Take your time; count it on your fingers if you like.', check: { number: p.answer, money: p.money } };
        });
        break;
      case 'memory': {
        const words = pick(RECALL_WORDS, lv + 2);
        g.items = [{ ask: `Here are ${words.length} words to remember: ${words.join(', ')}. I'll ask for them in a little while.`, show: words.map(cap).join(' · '), answer: words.join(', '), check: { recall: words } }];
        g.phase = 'remember';
        break;
      }
      default:
        break;
    }
    this.game = g;
    this.log.log(`Started ${KINDS[kind].label.toLowerCase()} (level ${lv}${topic ? `, ${topic}` : ''})`);
    if (KINDS[kind].checked) {
      this.showItem();
      const first = g.items[0];
      return kind === 'memory'
        ? `${first.ask} (Say the words slowly, shown on the screen too. Then chat about something else for a minute, e.g. ask what ` +
            'they had for breakfast, before asking them to say the words back; pass their answer to activity answer.)'
        : `${KINDS[kind].label}, level ${lv}, ${g.items.length} to do. First: ${first.ask} (It's on the screen too. Pass what they say to activity answer; the box checks it.)`;
    }
    return this.openInstructions(g);
  }

  /** Instructions for the activities the AI runs itself, personalised from memory and people. */
  private openInstructions(g: Game): string {
    const likes = this.memory.itemsAbout(['love', 'loved', 'enjoy', 'enjoys', 'favourite', 'likes'], 8).map((i) => i.text);
    const people = this.people?.people.filter((p) => !p.deceased).slice(0, 6).map((p) => `${p.name} (${p.relation ?? p.circle})`) ?? [];
    const tone = 'Keep it light and warm; praise effort; if an answer is wrong, give the right one kindly and move on; stop as soon as they want.';
    switch (g.kind) {
      case 'quiz': {
        const topic = g.topic ?? pick(QUIZ_TOPICS, 1)[0];
        g.topic = topic;
        return (
          `A gentle quiz, level ${g.level} of 3 (1 = very easy, with clues; 3 = harder). Topic: ${topic}` +
          `${likes.length ? `; or build it around what they enjoy: ${likes.slice(0, 4).join(' / ')}` : ''}. Ask ${ITEMS_PER_GAME} questions, one at a time; ` +
          'offer two or three choices at level 1. Use only facts you are sure of, nothing upsetting. After each answer call activity result ' +
          `(correct true or false). ${tone}`
        );
      }
      case 'categories': {
        const cat = g.topic ?? pick(CATEGORIES, 1)[0];
        g.topic = cat;
        return `Name five: ask them to name ${g.level === 1 ? 'three' : 'five'} ${cat}. Count each good one warmly, help with a clue if they get stuck, then call activity result once (correct true if they managed it, with or without help). Offer another category after. ${tone}`;
      }
      case 'reminiscence': {
        const stories = this.memory.itemsAbout(['grew', 'born', 'worked', 'married', 'school', 'lived', 'holiday', 'remember'], 6).map((i) => i.text);
        const prompts = pick(REMINISCENCE, 3);
        g.topic = 'memory lane';
        return (
          'Memory lane: an unhurried chat about their life. Start from something you know and invite them to tell you more ' +
          `(${[...stories.slice(0, 4), ...people.slice(0, 3).map((p) => `their ${p}`)].join('; ') || 'nothing personal known yet'}), or ask one of: ` +
          `${prompts.join(' / ')}. Ask one open question at a time, follow what they enjoy, reflect back what they say, and share how lovely it sounds. ` +
          'If a memory makes them sad, comfort them and change the subject softly. When the chat winds down, call activity end. (What they tell you is filed in their memory automatically.)'
        );
      }
      default:
        return tone;
    }
  }

  /** Checks an answer to Empathika's own puzzles. Returns what to say. */
  answer(text: string): string {
    const g = this.game;
    if (!g) return 'No game is running. Start one with activity start.';
    if (!KINDS[g.kind].checked) return 'For this activity, judge the answer yourself and call activity result.';
    this.lastMove = Date.now();
    const item = g.items[g.index];
    if (g.kind === 'memory') {
      const words = item.check.recall ?? [];
      const got = words.filter((w) => saidWord(text, w) || norm(text).split(' ').some((x) => x.length > 3 && w.startsWith(x.slice(0, 4))));
      g.asked = words.length;
      g.correct = got.length;
      g.phase = 'recall';
      const missed = words.filter((w) => !got.includes(w));
      const summary = this.finish('finished');
      return `They remembered ${got.length} of ${words.length}${got.length ? ` (${got.join(', ')})` : ''}.${missed.length ? ` The others were: ${missed.join(', ')}.` : ' All of them!'} ${summary}`;
    }
    const ok = this.isRight(item, text);
    if (!ok && g.tries === 0 && text.trim().length > 0) {
      g.tries = 1;
      return `Not quite. Encourage them to have another go${item.hint ? `, with a clue: ${item.hint}` : ''}. (Don't say the answer yet; pass the next try to activity answer.)`;
    }
    g.asked++;
    if (ok) g.correct++;
    const said = ok ? `Correct${g.tries ? ' on the second go' : ''}! Praise them.` : `Not this time: the answer is ${item.answer}. Say it kindly, no fuss.`;
    return `${said} ${this.next()}`;
  }

  /** A clue for the current puzzle. */
  hint(): string {
    const g = this.game;
    if (!g) return 'No game is running.';
    this.lastMove = Date.now();
    const item = g.items[g.index];
    if (!item?.hint) return 'No clue for this one: encourage them, or skip it.';
    g.hints++;
    this.emit('hint', item.hint);
    return `Clue: ${item.hint}`;
  }

  /** Gives the answer and moves on. */
  skip(): string {
    const g = this.game;
    if (!g) return 'No game is running.';
    if (!KINDS[g.kind].checked) return 'Move on to the next question yourself.';
    this.lastMove = Date.now();
    const item = g.items[g.index];
    g.asked++;
    return `The answer was ${item.answer}. ${this.next()}`;
  }

  /** The AI's own scoring for quizzes and categories. */
  result(correct: boolean): string {
    const g = this.game;
    if (!g) return 'No game is running.';
    this.lastMove = Date.now();
    g.asked++;
    if (correct) g.correct++;
    if (g.kind === 'quiz' && g.asked >= ITEMS_PER_GAME) return `Noted. That was the last question. ${this.finish('finished')}`;
    return `Noted (${g.correct} of ${g.asked} so far). Carry on, or call activity end when they've had enough.`;
  }

  private next(): string {
    const g = this.game!;
    g.index++;
    g.tries = 0;
    if (g.index >= g.items.length) return this.finish('finished');
    this.showItem();
    return `Next (${g.index + 1} of ${g.items.length}): ${g.items[g.index].ask}`;
  }

  /** Ends the game: logs it, adjusts the level, tells the care app. Returns the summary. */
  finish(how: 'finished' | 'stopped'): string {
    const g = this.game;
    if (!g) return 'No game is running.';
    this.game = undefined;
    this.emit('clear');
    const minutes = Math.max(1, Math.round((Date.now() - Date.parse(g.startedAt)) / 60_000));
    const s: Session = { at: g.startedAt, kind: g.kind, level: g.level, asked: g.asked, correct: g.correct, minutes, ended: how, topic: g.topic };
    if (g.kind === 'reminiscence' || g.asked > 0) {
      this.state.sessions = [s, ...this.state.sessions].slice(0, SESSIONS_KEPT);
      this.adjustLevel(g);
      this.persist();
      this.sendToApp(s);
      this.log.log(`${KINDS[g.kind].label}: ${g.kind === 'reminiscence' ? `${minutes} min` : `${g.correct}/${g.asked}`} (${how})`);
    }
    if (g.kind === 'reminiscence') return 'Lovely chat. Thank them for sharing their memories.';
    if (!g.asked) return 'Stopped. Offer something else another time.';
    const ratio = g.correct / g.asked;
    const praise = ratio >= 0.8 ? 'Wonderful' : ratio >= 0.5 ? 'Well done' : 'Thank you for playing; it was a tricky one';
    return `${praise}: ${g.correct} out of ${g.asked}. Tell them warmly; don't dwell on the score. Ask if they'd like another, or something different.`;
  }

  private adjustLevel(g: Game): void {
    if (g.asked < 3 && g.kind !== 'memory') return;
    const ratio = g.asked ? g.correct / g.asked : 0;
    const lv = g.level;
    if (ratio >= 0.8 && g.hints <= 1) this.state.levels[g.kind] = Math.min(3, lv + 1) as Level;
    else if (ratio <= 0.4) this.state.levels[g.kind] = Math.max(1, lv - 1) as Level;
    else this.state.levels[g.kind] = lv;
  }

  private isRight(item: Item, text: string): boolean {
    const c = item.check;
    if (c.word) return saidWord(text, c.word);
    if (c.keys) {
      const n = norm(text);
      return c.keys.every((k) => new RegExp(`\\b${norm(k)}`).test(n));
    }
    if (c.number !== undefined) {
      let nums = spokenNumbers(text, c.money);
      // Said in pounds: only the pound readings count (so "a pound and twenty pence" isn't also 20p).
      if (c.money && /£|pound/i.test(text)) nums = nums.filter((n) => n >= 100);
      // A guess at everything isn't an answer.
      return nums.includes(c.number) && new Set(nums.filter((n) => n !== c.number)).size <= (c.money ? 3 : 1);
    }
    return false;
  }

  private showItem(): void {
    const g = this.game;
    if (!g) return;
    const item = g.items[g.index];
    this.emit('show', {
      kind: g.kind,
      title: `${KINDS[g.kind].label}${g.items.length > 1 ? ` · ${g.index + 1} of ${g.items.length}` : ''}`,
      icon: KINDS[g.kind].icon,
      big: item.show,
      hint: item.hint,
    });
  }

  // ---------- Suggestions and the daily invitation ----------

  /** What to offer now: what they enjoy and haven't done today, rotating. */
  suggestions(): ActivityKind[] {
    const today = localToday();
    const recent = this.state.sessions.filter((s) => Date.now() - Date.parse(s.at) < 30 * 86400_000);
    const doneToday = new Set(recent.filter((s) => s.at.slice(0, 10) === today).map((s) => s.kind));
    // Liked = played to the end more often than stopped.
    const score = (k: ActivityKind) => {
      const mine = recent.filter((s) => s.kind === k);
      return mine.filter((s) => s.ended === 'finished').length - mine.filter((s) => s.ended === 'stopped').length * 0.5;
    };
    return [...KIND_NAMES].filter((k) => !doneToday.has(k)).sort((a, b) => score(b) - score(a));
  }

  /** The activity the invitation offers (rotating through the favourites). */
  offer(): ActivityKind {
    const list = this.suggestions();
    const top = list.slice(0, 4);
    const k = top.length ? top[this.offerIndex++ % top.length] : 'words';
    return k;
  }

  /** "Yes please" on the invitation: starts it and returns what Empathika says first. */
  startFromScreen(kind: ActivityKind): string {
    const said = this.start(kind);
    const g = this.game;
    if (!g) return 'Lovely!';
    if (KINDS[kind].checked) return `Lovely! ${g.items[0].ask}`;
    if (kind === 'reminiscence') return `Lovely. ${pick(REMINISCENCE, 1)[0]}`;
    if (kind === 'categories') return `Lovely! Can you name ${g.level === 1 ? 'three' : 'five'} ${g.topic}?`;
    void said;
    return `Lovely! A little quiz about ${g.topic}. Are you ready for the first question?`;
  }

  private tick(): void {
    const s = this.settings;
    if (!s.invite || this.game) return;
    const now = new Date();
    const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: timeZone(), hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const hm = fmt.format(now);
    const today = localToday();
    for (const t of [s.inviteTime, s.inviteTime2].filter(Boolean)) {
      const key = `${today} ${t}`;
      // Its time has come (within the hour), and it hasn't gone out today.
      if (hm < t || minutes(hm) - minutes(t) > 60 || this.state.invited?.includes(key)) continue;
      this.state.invited = [key, ...(this.state.invited ?? [])].slice(0, 20);
      this.persist();
      this.emit('invite', this.offer());
      return;
    }
  }

  // ---------- Reports ----------

  /** Per activity over the last `days` days: how often, how well, minutes. */
  summary(days = 14): { kind: ActivityKind; label: string; times: number; asked: number; correct: number; minutes: number; level: Level }[] {
    const since = Date.now() - days * 86400_000;
    const recent = this.state.sessions.filter((s) => Date.parse(s.at) >= since);
    return KIND_NAMES.map((k) => {
      const mine = recent.filter((s) => s.kind === k);
      return {
        kind: k,
        label: KINDS[k].label,
        times: mine.length,
        asked: mine.reduce((n, s) => n + s.asked, 0),
        correct: mine.reduce((n, s) => n + s.correct, 0),
        minutes: mine.reduce((n, s) => n + s.minutes, 0),
        level: this.level(k),
      };
    });
  }

  /** In words, for the resident or staff. */
  report(days = 7): string {
    const rows = this.summary(days).filter((r) => r.times);
    if (!rows.length) return `No activities in the last ${days} days.`;
    return `Last ${days} days: ${rows
      .map((r) => `${r.label} ${r.times} time${r.times === 1 ? '' : 's'}${r.asked && r.kind !== 'reminiscence' ? ` (${r.correct}/${r.asked} right)` : r.kind === 'reminiscence' ? ` (${r.minutes} min)` : ''}`)
      .join('; ')}.`;
  }

  private sendToApp(s: Session): void {
    if (!this.app?.connected || !this.app.supports(LOG_TOOL)) return;
    this.app
      .system(LOG_TOOL, { activity: { ...s, label: KINDS[s.kind].label } })
      .catch((err) => this.log.debug(`Could not send the activity to the care app: ${(err as Error).message}`));
  }

  // ---------- Empathika ----------

  promptSection(): string {
    if (!this.enabled) return '';
    const g = this.game && Date.now() - this.lastMove < STALE_MS ? this.game : undefined;
    const last = this.state.sessions[0];
    const liked = this.suggestions().slice(0, 3).map((k) => KINDS[k].label.toLowerCase());
    return [
      'Keeping their mind active: now and then, when the moment is right (they seem bored, or ask for something to do; not when ' +
        'tired, upset, or in the middle of something), offer an activity: a word or number puzzle, finishing old sayings, a memory ' +
        'game, a gentle quiz, naming things, or a chat about the old days (activity). It is never a test: praise effort, never ' +
        'say "wrong" bluntly, give answers kindly, and stop the moment they want.' +
        (liked.length ? ` Good ones to offer today: ${liked.join(', ')}.` : '') +
        (last ? ` Last activity: ${KINDS[last.kind].label.toLowerCase()}, ${shortAgo(last.at)}.` : ''),
      g
        ? `AN ACTIVITY IS IN PROGRESS: ${KINDS[g.kind].label}` +
          (KINDS[g.kind].checked
            ? g.kind === 'memory'
              ? ` (they are holding the words in mind; after a minute's chat, ask for them back and pass the answer to activity answer).`
              : `, ${g.index + 1} of ${g.items.length}: "${g.items[g.index].ask}". Pass their answer to activity answer (the box checks it); hint or skip if they're stuck; end if they want to stop.`
            : ` (${g.topic ?? ''}, ${g.correct}/${g.asked} so far): carry on, calling activity result after each answer, and end when done.`)
        : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  get tools(): ChatCompletionTool[] {
    if (!this.enabled) return [];
    return [
      {
        type: 'function',
        function: {
          name: 'activity',
          description:
            'Brain games and activities to keep the resident\'s mind active. start: begin one (kind: words = unscramble a word, ' +
            'sayings = finish the saying, numbers = sums and change, memory = remember a few words, quiz = a gentle quiz (topic ' +
            'optional), categories = name five things, reminiscence = memory lane, a chat about their life). For words, sayings, ' +
            'numbers and memory the box sets and checks the questions: pass whatever the resident says to answer. hint: a clue. ' +
            'skip: give the answer and move on. For quiz and categories you ask and judge: call result (correct) after each. ' +
            'end: stop now (always fine). suggest: what to offer. report: how they have been getting on (last 7 days).',
          parameters: {
            type: 'object',
            properties: {
              action: { type: 'string', enum: ['start', 'answer', 'hint', 'skip', 'result', 'end', 'suggest', 'report'] },
              kind: { type: 'string', enum: KIND_NAMES, description: 'For start' },
              level: { type: 'integer', enum: [1, 2, 3], description: 'For start: only if they ask for easier or harder (else it follows how they do)' },
              topic: { type: 'string', description: 'For start (quiz or categories): a topic they like' },
              text: { type: 'string', description: 'For answer: exactly what the resident said' },
              correct: { type: 'boolean', description: 'For result' },
            },
            required: ['action'],
          },
        },
      },
    ];
  }

  has(name: string): boolean {
    return name === 'activity' && this.enabled;
  }

  async call(_name: string, a: Record<string, unknown>): Promise<string> {
    const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
    const action = s(a.action) ?? 'suggest';
    switch (action) {
      case 'start': {
        const k = s(a.kind) as ActivityKind | undefined;
        if (!k || !(k in KINDS)) return `Which one: ${KIND_NAMES.join(', ')}?`;
        const lv = a.level === 1 || a.level === 2 || a.level === 3 ? (a.level as Level) : undefined;
        return this.start(k, lv, s(a.topic));
      }
      case 'answer':
        return this.answer(s(a.text) ?? '');
      case 'hint':
        return this.hint();
      case 'skip':
        return this.skip();
      case 'result':
        return this.result(a.correct === true);
      case 'end':
        return this.finish(this.game && KINDS[this.game.kind].checked && this.game.index < this.game.items.length ? 'stopped' : 'finished');
      case 'report':
        return this.report(7);
      case 'suggest':
      default:
        return `Offer one of these (their favourites first): ${this.suggestions().slice(0, 4).map((k) => `${KINDS[k].label} (${KINDS[k].about})`).join('; ')}.`;
    }
  }

  // ---------- Backup ----------

  exportBackup(): Pick<State, 'levels' | 'sessions'> {
    return { levels: this.state.levels, sessions: this.state.sessions };
  }

  restoreBackup(b: unknown): number {
    if (!b || typeof b !== 'object' || !this.enabled) return 0;
    const x = b as Partial<State>;
    if (this.state.sessions.length || !Array.isArray(x.sessions)) return 0;
    this.state.sessions = x.sessions.slice(0, SESSIONS_KEPT);
    this.state.levels = { ...(x.levels ?? {}) };
    this.persist();
    return this.state.sessions.length;
  }

  private persist(): void {
    this.revision++;
    this.store?.save(this.state).catch((err) => this.log.error(`Could not save the activity log: ${(err as Error).message}`));
  }
}

function pick<T>(list: readonly T[], n: number): T[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function minutes(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}

function shortAgo(iso: string): string {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86400_000);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
}
