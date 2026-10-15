import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import { APP_CONFIG, AppConfig } from '../config';
import { McpConnection } from '../mcp/mcp-connection';
import { matchesAny } from '../mcp/glob';
import { ModesService } from '../memory/modes.service';
import { StaffService } from '../staff/staff.service';

const SERVER = 'empathika-app';
const RETRY_MS = 60_000;
/** The parameter every care-app action takes; always filled in by Empathika, never by the AI. */
export const RESIDENT_PARAM = 'resident_id';

/**
 * The connection to the Empathika care app (MCP over HTTP; the contract is in docs/CARE-APP-MCP.md).
 *
 * Three kinds of app actions, decided by name (EMPATHIKA_APP_RESIDENT_TOOLS / _SYSTEM_TOOLS):
 *  - resident actions (e.g. today's activities): offered in every conversation;
 *  - system actions (memory backup, family updates): used by Empathika herself, never offered to the AI;
 *  - everything else is the care record: offered ONLY during a staff session, refused otherwise
 *    (checked again when the action runs, not left to the AI), and every use is in the audit log.
 *
 * Every call is for this box's resident only: Empathika fills in resident_id herself and removes
 * it from what the AI sees, so a conversation can never ask about another resident.
 */
@Injectable()
export class CareAppService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('CareApp');
  private conn?: McpConnection;
  private retry?: NodeJS.Timeout;

  constructor(
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
    private readonly modes: ModesService,
    @Optional() private readonly staff?: StaffService,
  ) {}

  get configured(): boolean {
    return Boolean(this.cfg.app.mcpUrl);
  }

  get connected(): boolean {
    return Boolean(this.conn?.connected);
  }

  get lastError(): string | undefined {
    return this.conn?.lastError;
  }

  async onModuleInit(): Promise<void> {
    if (!this.configured) {
      this.log.log('Not connected to the Empathika care app (EMPATHIKA_APP_MCP_URL is not set)');
      return;
    }
    if (!this.cfg.app.residentId) this.log.warn('RESIDENT_ID is not set: the care app will not know which resident this box belongs to');
    this.conn = new McpConnection({
      name: SERVER,
      url: this.cfg.app.mcpUrl,
      headers: this.cfg.app.token ? { Authorization: `Bearer ${this.cfg.app.token}` } : {},
    });
    await this.conn.connect();
    this.retry = setInterval(() => void this.reconnect(), RETRY_MS);
    this.retry.unref?.();
  }

  async onModuleDestroy(): Promise<void> {
    clearInterval(this.retry);
    await this.conn?.close();
  }

  private async reconnect(): Promise<void> {
    if (this.conn && !this.conn.connected) await this.conn.connect();
  }

  // ---------- For the AI ----------

  /** The app actions offered right now: resident ones always, the care record only in a staff session. */
  get tools(): ChatCompletionTool[] {
    const staff = this.modes.mode === 'staff';
    return (this.conn?.openAiTools ?? [])
      .filter((t): t is Extract<ChatCompletionTool, { type: 'function' }> => t.type === 'function')
      .filter((t) => !this.isSystem(t.function.name) && (staff || this.isResident(t.function.name)))
      .map((t) => withoutResident(this.isResident(t.function.name) ? t : describedAsCare(t)));
  }

  has(name: string): boolean {
    return Boolean(this.conn?.has(name)) && !this.isSystem(name);
  }

  /** A care-record action is one that needs a staff session. */
  isCareRecord(name: string): boolean {
    return !this.isResident(name) && !this.isSystem(name);
  }

  async call(name: string, args: Record<string, unknown>): Promise<string> {
    if (!this.conn) return 'The care app is not connected.';
    if (this.isSystem(name)) return 'That action is not available.';
    const care = this.isCareRecord(name);
    if (care && this.modes.mode !== 'staff') {
      return (
        'Not done: the care record is only available to staff. Do not share any health details. If the person ' +
        'says they are staff, ask them to start a staff session (staff_session) and enter their PIN on the screen.'
      );
    }
    const { [RESIDENT_PARAM]: _ignored, ...rest } = args;
    if (care) this.staff?.audit('care_record', undefined, `${name} ${JSON.stringify(rest).slice(0, 200)}`);
    if (!this.conn.connected) await this.conn.connect();
    return this.conn.call(name, { ...rest, [RESIDENT_PARAM]: this.cfg.app.residentId });
  }

  // ---------- For Empathika's own jobs (backup, family updates) ----------

  /** The app has this action (offered to the AI or not). */
  supports(name: string): boolean {
    return Boolean(this.conn?.hasAny(name));
  }

  /** Runs one of the app's actions for Empathika herself and returns its answer parsed as JSON when it is JSON. */
  async system<T = unknown>(name: string, args: Record<string, unknown> = {}): Promise<T | string> {
    if (!this.conn) throw new Error('the care app is not configured');
    if (!this.conn.connected) await this.conn.connect();
    const text = await this.conn.rawCall(name, { ...args, [RESIDENT_PARAM]: this.cfg.app.residentId });
    try {
      return JSON.parse(text) as T;
    } catch {
      return text;
    }
  }

  private isResident(name: string): boolean {
    return matchesAny(name, this.cfg.app.residentTools);
  }

  private isSystem(name: string): boolean {
    return matchesAny(name, this.cfg.app.systemTools);
  }
}

/** The AI never sees (or fills in) resident_id. */
function withoutResident(t: Extract<ChatCompletionTool, { type: 'function' }>): ChatCompletionTool {
  const p = (t.function.parameters ?? { type: 'object', properties: {} }) as { properties?: Record<string, unknown>; required?: string[] };
  const { [RESIDENT_PARAM]: _r, ...properties } = p.properties ?? {};
  const required = (p.required ?? []).filter((r) => r !== RESIDENT_PARAM);
  return { ...t, function: { ...t.function, parameters: { ...p, properties, ...(required.length ? { required } : { required: undefined }) } } };
}

function describedAsCare(t: Extract<ChatCompletionTool, { type: 'function' }>): Extract<ChatCompletionTool, { type: 'function' }> {
  return { ...t, function: { ...t.function, description: `Care record (staff session only). ${t.function.description ?? ''}`.trim() } };
}
