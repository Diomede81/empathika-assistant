import { Logger } from '@nestjs/common';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import { matchesAny } from './glob';
import { compactResult } from './compact';

/** How much of an app's answer the AI gets (after removing the clutter): a full day of meetings or a page of emails. */
const RESULT_CHARS = 16_000;

export interface McpServerConfig {
  /** Short name shown in logs and the control panel, e.g. "empathika-app". */
  name: string;
  url: string;
  headers?: Record<string, string>;
  /** Only offer tools matching these wildcard patterns (all tools when empty). */
  allowedTools?: string[];
  /** Tools that need a spoken "yes" before they run (in addition to the built-in risky-action rules). */
  confirmTools?: string[];
}

/** One remote MCP server (Streamable HTTP) with reconnects and a filtered tool list. */
export class McpConnection {
  private readonly log: Logger;
  private client?: Client;
  private tools: ChatCompletionTool[] = [];
  private totalTools = 0;
  /** Every tool the server has, filtered or not (for actions Empathika runs herself). */
  private allNames = new Set<string>();
  lastError?: string;

  constructor(readonly config: McpServerConfig) {
    this.log = new Logger(`MCP:${config.name}`);
  }

  get connected(): boolean {
    return Boolean(this.client);
  }

  get openAiTools(): ChatCompletionTool[] {
    return this.tools;
  }

  /** Tools offered to the AI vs. tools the server has (some may be filtered out). */
  get counts(): { offered: number; total: number } {
    return { offered: this.tools.length, total: this.totalTools };
  }

  async connect(): Promise<void> {
    try {
      const transport = new StreamableHTTPClientTransport(new URL(this.config.url), {
        requestInit: { headers: this.config.headers ?? {} },
      });
      const client = new Client({ name: 'empathika-assistant', version: '0.1.0' });
      await client.connect(transport);
      this.client = client;
      await this.refresh();
      this.lastError = undefined;
    } catch (err) {
      this.client = undefined;
      this.lastError = (err as Error).message;
      this.log.error(`Cannot connect to ${this.config.name}: ${this.lastError}`);
    }
  }

  async refresh(): Promise<void> {
    if (!this.client) return;
    const { tools } = await this.client.listTools();
    this.totalTools = tools.length;
    this.allNames = new Set(tools.map((t) => t.name));
    const allowed = this.config.allowedTools;
    const kept = allowed?.length ? tools.filter((t) => matchesAny(t.name, allowed)) : tools;
    this.tools = kept.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: (t.description ?? '').slice(0, 1000),
        parameters: (t.inputSchema as Record<string, unknown>) ?? { type: 'object', properties: {} },
      },
    }));
    this.log.log(
      `${this.tools.length} of ${tools.length} tools available` +
        (this.tools.length ? `: ${this.tools.map((t) => (t.type === 'function' ? t.function.name : '')).join(', ')}` : ''),
    );
    if (allowed?.length && !this.tools.length && tools.length && !allowed.includes('__none__')) {
      this.log.warn(
        `None of the ${tools.length} tools matched the allowed patterns. Available: ` +
          tools.slice(0, 60).map((t) => t.name).join(', '),
      );
    }
    if (this.tools.length > 30) {
      this.log.warn(`${this.tools.length} tools is a lot for a voice assistant; narrow "allowedTools" for faster, more accurate answers`);
    }
  }

  has(name: string): boolean {
    return this.tools.some((t) => t.type === 'function' && t.function.name === name);
  }

  /** The server has this tool, offered to the AI or not. */
  hasAny(name: string): boolean {
    return this.allNames.has(name);
  }

  /** Calls any of the server's tools and returns its full text answer (no tidying): for Empathika's own jobs. */
  async rawCall(name: string, args: Record<string, unknown>): Promise<string> {
    if (!this.client) throw new Error(`${this.config.name} is not connected`);
    const result = await this.client.callTool({ name, arguments: args });
    const content = (result.content ?? []) as Array<{ type: string; text?: string }>;
    const text = content.map((c) => (c.type === 'text' ? c.text : '')).join('\n');
    if (result.isError) throw new Error(text || `${name} failed`);
    return text;
  }

  async call(name: string, args: Record<string, unknown>): Promise<string> {
    if (!this.client) return `${this.config.name} is not connected.`;
    const result = await this.client.callTool({ name, arguments: args });
    const content = (result.content ?? []) as Array<{ type: string; text?: string }>;
    const text = content.map((c) => (c.type === 'text' ? c.text : `[${c.type}]`)).join('\n') || 'ok';
    // Keep tool results short (they go back into the AI's context on every turn) without losing items.
    const out = compactResult(text, RESULT_CHARS);
    if (out.truncated) this.log.warn(`${name}: the answer was too long even after tidying (${text.length} characters); the AI got the first ${RESULT_CHARS}`);
    else if (out.compacted) this.log.debug(`${name}: answer tidied from ${text.length} to ${out.text.length} characters`);
    return out.text;
  }

  async close(): Promise<void> {
    await this.client?.close().catch(() => undefined);
    this.client = undefined;
  }
}
