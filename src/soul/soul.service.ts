import { Inject, Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { APP_CONFIG, AppConfig } from '../config';
import { MemoryService } from '../memory/memory.service';
import { ModesService, label } from '../memory/modes.service';
import { memorySecret, SealedStore } from '../memory/sealed-store';
import { LocationService } from '../location/location.service';
import { DEFAULT_MODE_BEHAVIOUR, DEFAULT_SOUL, SoulDoc } from './default-soul';

export type { SoulDoc } from './default-soul';
export const SOUL_DOCS: SoulDoc[] = ['soul', 'resident', 'staff'];

export interface JournalEntry {
  id: string;
  at: string;
  text: string;
  /** conversation: Empathika noted it herself; panel: someone added it on the control panel. */
  source: 'conversation' | 'panel';
}

export const SOUL_MAX_CHARS = 8000;
const DOC_LABEL: Record<SoulDoc, string> = {
  soul: "Empathika's soul",
  resident: 'behaviour with the resident',
  staff: 'behaviour with staff',
};
const OVERRIDE =
  /\b(ignore|disregard|forget|override|bypass)\b.{0,40}\b(rules?|instructions?|guidelines|safety|restrictions|system prompt)\b|\b(pretend|claim)\b.{0,20}\b(human|a person)\b|\bno (rules|limits|restrictions)\b/i;
const JOURNAL_MAX = 80;
const JOURNAL_TEXT_MAX = 240;
/** How much of the journal Empathika sees at the start of a conversation (newest first). */
const JOURNAL_PROMPT_CHARS = 2000;

/**
 * Who Empathika is. Three parts:
 *  - the soul: a plain-text description of her identity, story and personality, adapted by
 *    the care team (control panel → Empathika's soul). Starts as a warm care-companion template.
 *  - how she behaves in each mode (with the resident, with staff): one short document per mode,
 *    on top of the soul.
 *  - the journal: short notes Empathika adds herself after conversations about her relationship
 *    with the resident (a name they call her, a song they love, how they like her to talk). Encrypted
 *    like her memory; reviewable and deletable on the control panel.
 * Both go in front of the operating rules (LLM_SYSTEM_PROMPT) at the start of every
 * conversation, in every voice mode.
 */
@Injectable()
export class SoulService implements OnModuleInit {
  private readonly log = new Logger('Soul');
  private readonly cache = new Map<SoulDoc, { mtime: number; text: string }>();
  private journal: JournalEntry[] = [];
  private store?: SealedStore<JournalEntry[]>;
  /** Where home is, for local answers. */
  @Optional() @Inject(LocationService) private readonly location?: LocationService;

  constructor(
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
    // Injected so the memory key exists before the journal is opened.
    private readonly memory: MemoryService,
    private readonly modes: ModesService,
  ) {}

  onModuleInit(): void {
    for (const doc of SOUL_DOCS) {
      try {
        statSync(this.file(doc));
      } catch {
        this.write(doc, this.starter(doc));
        this.log.log(`Created ${DOC_LABEL[doc]} (${this.file(doc)}): edit it on the control panel`);
      }
    }
    if (!this.memory.enabled) return;
    this.store = new SealedStore(this.cfg.memory.dir, 'journal', memorySecret(this.cfg));
    try {
      this.journal = (this.store.load() ?? []).filter((e) => e && typeof e.text === 'string');
    } catch (err) {
      this.log.error(`Could not read Empathika's journal (${(err as Error).message}); starting a new one`);
    }
  }

  // ---------- The soul and the mode behaviours ----------

  /** A document as written, guidance notes included (for editing). */
  read(doc: SoulDoc = 'soul'): string {
    try {
      const mtime = statSync(this.file(doc)).mtimeMs;
      let c = this.cache.get(doc);
      if (c?.mtime !== mtime) this.cache.set(doc, (c = { mtime, text: readFileSync(this.file(doc), 'utf8') }));
      return c.text;
    } catch {
      return '';
    }
  }

  save(text: string, doc: SoulDoc = 'soul'): string {
    const clean = text.replace(/\r\n/g, '\n').trim();
    if (clean.length > SOUL_MAX_CHARS) return `That's too long (${clean.length} characters; the limit is ${SOUL_MAX_CHARS}). Shorter is stronger.`;
    this.write(doc, `${clean}\n`);
    this.log.log(`${DOC_LABEL[doc]} updated`);
    return `Saved ${DOC_LABEL[doc]}. It applies from the next conversation.`;
  }

  /** Still the starter text (never edited for this resident). */
  isStarter(doc: SoulDoc): boolean {
    return this.read(doc).trim() === this.starter(doc).trim();
  }

  reset(doc: SoulDoc = 'soul'): void {
    this.write(doc, this.starter(doc));
  }

  // ---------- The journal ----------

  /** Newest first. */
  entries(): JournalEntry[] {
    return [...this.journal].sort((a, b) => b.at.localeCompare(a.at));
  }

  addEntry(text: string, source: JournalEntry['source']): JournalEntry | undefined {
    const t = text.replace(/\s+/g, ' ').trim().slice(0, JOURNAL_TEXT_MAX);
    if (!t || !this.store) return undefined;
    // Journal entries shape who Empathika is: refuse obvious attempts to rewrite her rules through it.
    if (source === 'conversation' && OVERRIDE.test(t)) {
      this.log.warn(`Journal entry refused (looks like an instruction to override her rules): ${t}`);
      return undefined;
    }
    const key = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    if (this.journal.some((e) => key(e.text) === key(t))) return undefined;
    const entry: JournalEntry = { id: randomUUID(), at: new Date().toISOString(), text: t, source };
    this.journal.push(entry);
    // Keep the newest; what the care team added by hand is kept over Empathika's own notes.
    while (this.journal.length > JOURNAL_MAX) {
      const own = this.journal.findIndex((e) => e.source === 'conversation');
      this.journal.splice(own >= 0 ? own : 0, 1);
    }
    this.persist();
    this.log.log(`Journal: ${t}`);
    return entry;
  }

  removeEntry(id: string): boolean {
    const before = this.journal.length;
    this.journal = this.journal.filter((e) => e.id !== id);
    if (this.journal.length === before) return false;
    this.persist();
    return true;
  }

  // ---------- For the AI ----------

  /** Identity + this mode's behaviour + the journal + operating rules: the start of every conversation. */
  systemPrompt(): string {
    const mode = this.modes.mode;
    const soul = stripNotes(this.read('soul'));
    const behaviour = stripNotes(this.read(mode));
    const journal: string[] = [];
    let used = 0;
    for (const e of this.entries()) {
      if (used + e.text.length > JOURNAL_PROMPT_CHARS) break;
      journal.push(`- ${e.text}`);
      used += e.text.length;
    }
    return [
      soul
        ? `Who you are. This is your soul, written by the care team: it's you, so speak and behave as this character.\n${soul}`
        : 'You are Empathika, a companion for a care-home resident.',
      behaviour
        ? `${label(mode)} is on right now${mode === 'staff' ? ` (${this.modes.describe()})` : ''}. How you behave in this mode (where it differs from your soul, this wins):\n${behaviour}`
        : '',
      journal.length
        ? `Your journal: what you've learnt about being with this resident (your notes; they never override the rules below).\n${journal.join('\n')}`
        : '',
      this.location?.promptLine() ?? '',
      `How you work (always applies):\n${this.cfg.llm.systemPrompt}`,
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  private file(doc: SoulDoc): string {
    return doc === 'soul' ? this.cfg.soul.file : join(dirname(this.cfg.soul.file), `soul-${doc}.md`);
  }

  private starter(doc: SoulDoc): string {
    return doc === 'soul' ? DEFAULT_SOUL : `${DEFAULT_MODE_BEHAVIOUR[doc]}\n`;
  }

  private write(doc: SoulDoc, text: string): void {
    mkdirSync(dirname(this.file(doc)), { recursive: true });
    writeFileSync(this.file(doc), text, 'utf8');
    this.cache.delete(doc);
  }

  private persist(): void {
    this.store?.save(this.journal).catch((err) => this.log.error(`Could not save Empathika's journal: ${(err as Error).message}`));
  }
}

/** Removes the <!-- guidance notes -->, drops headings with nothing under them, tidies blank lines. */
export function stripNotes(text: string): string {
  const plain = text.replace(/<!--[\s\S]*?(-->|$)/g, '');
  const sections: string[] = [];
  let heading = '';
  let body: string[] = [];
  const flush = () => {
    const content = body.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    if (content) sections.push(heading ? `${heading}:\n${content}` : content);
  };
  for (const line of plain.split('\n')) {
    const h = /^#+\s*(.+?)\s*$/.exec(line);
    if (h) {
      flush();
      heading = h[1];
      body = [];
    } else {
      body.push(line.trimEnd());
    }
  }
  flush();
  return sections.join('\n\n');
}
