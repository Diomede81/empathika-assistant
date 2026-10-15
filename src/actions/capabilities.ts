import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import { SCREEN_RULE } from './screen-tools.service';

/**
 * A short briefing of what Empathika can reach right now, built from the actions actually
 * offered. Without it, AI models fall back on their default "I can't access that", even when
 * the tools are right there.
 */
export function describeCapabilities(tools: ChatCompletionTool[]): string {
  const fns = tools.filter((t): t is Extract<ChatCompletionTool, { type: 'function' }> => t.type === 'function');
  const names = fns.map((t) => t.function.name);
  const reach: string[] = [];
  if (fns.some((t) => (t.function.description ?? '').startsWith('Care record'))) {
    reach.push("the resident's care record in the Empathika app (this staff session only: answer the member of staff precisely, citing the record)");
  }
  if (names.includes('web_search')) reach.push('the internet: search the web and news, and read any web page');
  const screen = names.includes('show_on_screen') ? SCREEN_RULE : '';
  if (!reach.length) return screen;
  return (
    (screen ? `${screen}\n` : '') +
    `Live connections you have RIGHT NOW through your tools: ${reach.join('; ')}. ` +
    'When asked about any of them, call the matching tool straight away instead of saying you cannot. ' +
    'If a tool returns an error, say briefly what went wrong.'
  );
}

/** Said when the care app is set up but can't be reached. */
export const CARE_APP_OFFLINE =
  'The Empathika care app is not reachable right now: you cannot look up the care record or fetch new family messages. ' +
  'If asked, say so briefly; everything you remember still works.';
