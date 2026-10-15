import { Injectable, Logger, Optional } from '@nestjs/common';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import { McpServersService } from '../mcp/mcp-servers.service';
import { matchesAny } from '../mcp/glob';
import { EXTERNAL_FLAG } from './builtin-actions.service';
import { BuiltinActionsService } from './builtin-actions.service';
import { ScreenToolsService } from './screen-tools.service';
import { LockService } from '../lock/lock.service';
import { WebService } from '../web/web.service';
import { UpdatesService } from '../updates/updates.service';
import { CareAppService } from '../care-app/care-app.service';
import { EventEmitter } from 'node:events';
import { Activity, describeActivity } from './activity';

/** Emitted around every action: 'start' and 'end' (for the face and spoken "checking…" cues). */
export interface ActivityEvent extends Activity {
  id: number;
  name: string;
  ok?: boolean;
}

/** Actions that change something in another system: adding a note to the care record, sending, deleting... */
const RISKY = /(SEND|REPLY|FORWARD|DELETE|REMOVE|TRASH|ARCHIVE|MOVE|CREATE|UPDATE|ACCEPT|DECLINE|CANCEL|POST|INVITE|SHARE)|(^|_)(ADD|WRITE|EDIT|SET|LOG|RECORD)(_|$)/i;
const CONFIRM_WINDOW_MS = 3 * 60 * 1000;
const CONFIRM_PARAM = 'confirmed';
/** Facts saved this soon after reading web pages are marked unverified (they may come from that content). */
const EXTERNAL_CONTENT_WINDOW_MS = 10 * 60 * 1000;

/**
 * Every action Empathika can take, in one place: built-in actions (time, timers, memory, staff
 * sessions, family news), the Empathika care app, and any extra MCP servers
 * (config/mcp-servers.json). Used by both voice modes.
 *
 * Safety:
 *  - care-record actions only exist in a staff session (CareAppService checks it again on every call);
 *  - actions that change another system (adding a care note, sending, deleting…) are never run
 *    on the first request. Empathika must read the details back and get a "yes"; the action only
 *    runs when the same request comes back with confirmed=true within 3 minutes. Voice is easy to
 *    mishear, so this is enforced here, not left to the AI.
 */
@Injectable()
export class ToolRouterService {
  private readonly log = new Logger(ToolRouterService.name);
  private readonly pending = new Map<string, number>();
  private externalContentAt = 0;

  constructor(
    private readonly builtin: BuiltinActionsService,
    private readonly mcp: McpServersService,
    @Optional() private readonly app?: CareAppService,
    @Optional() private readonly web?: WebService,
    @Optional() private readonly updates?: UpdatesService,
    @Optional() private readonly screenTools?: ScreenToolsService,
    @Optional() private readonly lock?: LockService,
  ) {}

  /** Tool definitions in Chat Completions format. */
  get tools(): ChatCompletionTool[] {
    const confirm = (t: ChatCompletionTool) => (t.type === 'function' && this.needsConfirmation(t.function.name) ? withConfirmParam(t) : t);
    return [
      ...this.builtin.tools,
      ...(this.app?.tools ?? []).map(confirm),
      ...(this.web?.tools ?? []),
      ...(this.updates?.tools ?? []),
      ...(this.screenTools?.tools ?? []),
      ...this.mcp.tools.map(confirm),
    ];
  }

  get careAppConnected(): boolean {
    return Boolean(this.app?.connected);
  }

  needsConfirmation(name: string): boolean {
    if (this.app?.has(name)) return RISKY.test(name);
    const server = this.mcp.serverFor(name);
    if (!server) return false; // built-in actions run straight away
    return RISKY.test(name) || matchesAny(name, server.config.confirmTools);
  }

  /** 'start' / 'end' (ActivityEvent) around every action that isn't instant. */
  readonly activity = new EventEmitter();
  private activityId = 0;

  async call(name: string, args: Record<string, unknown>): Promise<string> {
    // Belt and braces: nothing runs while the start-up code hasn't been entered.
    if (this.lock?.locked) return 'Not done: Empathika is locked. The start-up code has to be entered on her screen first.';
    const what = describeActivity(name);
    if (!what) return this.run(name, args);
    const ev: ActivityEvent = { id: ++this.activityId, name, ...what };
    this.activity.emit('start', ev);
    const out = await this.run(name, args);
    this.activity.emit('end', { ...ev, ok: !/^Error:|^Could not do that/.test(out) });
    this.activity.emit('result', { name, out });
    return out;
  }

  private async run(name: string, args: Record<string, unknown>): Promise<string> {
    this.log.log(`tool ${name} ${JSON.stringify(args)}`);
    if (name === 'remember' && Date.now() - this.externalContentAt < EXTERNAL_CONTENT_WINDOW_MS) {
      args = { ...args, [EXTERNAL_FLAG]: true };
    }
    try {
      if (this.builtin.has(name)) return this.builtin.call(name, args);
      if (this.web?.has(name)) {
        this.externalContentAt = Date.now(); // facts from web pages are marked unverified
        return await this.web.call(name, args);
      }
      if (this.updates?.has(name)) return await this.updates.call(name, args);
      if (this.screenTools?.has(name)) return await this.screenTools.call(name, args);
      const app = this.app?.has(name) ? this.app : undefined;
      const server = app ? undefined : this.mcp.serverFor(name);
      if (!app && !server) return `Unknown action "${name}".`;
      const run = (a: Record<string, unknown>) => (app ? app.call(name, a) : server!.call(name, a));

      if (this.needsConfirmation(name)) {
        const { [CONFIRM_PARAM]: confirmed, ...rest } = args;
        const key = `${name}:${stableJson(rest)}`;
        const askedAt = this.pending.get(key);
        if (confirmed !== true || !askedAt || Date.now() - askedAt > CONFIRM_WINDOW_MS) {
          this.pending.set(key, Date.now());
          this.log.log(`${name} needs a spoken confirmation first`);
          return (
            'NOT DONE YET - this action needs the user\'s confirmation. Read the key details back in one short ' +
            'sentence (who/what/when) and ask "Shall I go ahead?". Only if the user clearly says yes, call ' +
            `${name} again with exactly the same arguments plus "${CONFIRM_PARAM}": true. If they say no, drop it.`
          );
        }
        this.pending.delete(key);
        return await run(rest);
      }
      return await run(args);
    } catch (err) {
      return `Error: ${(err as Error).message}`;
    }
  }
}

function withConfirmParam(t: ChatCompletionTool): ChatCompletionTool {
  if (t.type !== 'function') return t;
  const params = (t.function.parameters ?? { type: 'object', properties: {} }) as {
    properties?: Record<string, unknown>;
  };
  return {
    ...t,
    function: {
      ...t.function,
      description: `${t.function.description ?? ''} (Needs the user's spoken confirmation: see "${CONFIRM_PARAM}".)`.trim(),
      parameters: {
        ...params,
        properties: {
          ...(params.properties ?? {}),
          [CONFIRM_PARAM]: {
            type: 'boolean',
            description: 'Set to true ONLY after reading the details back and hearing them say yes.',
          },
        },
      },
    },
  };
}

/** JSON with sorted keys, so the same request always produces the same key. */
function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${stableJson((v as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}
