/**
 * When a conversation is over.
 *
 * Three signals, from the surest to the gentlest:
 *
 *  1. A clear stop or goodbye, said on its own ("stop", "that's all", "goodbye", "good night", "never
 *     mind", "I'm not talking to you"), with or without a thank-you around it ("thank you, that's
 *     all", "thanks, bye for now"): the conversation ends at once, without asking the AI model.
 *     Not when it is part of a sentence ("stop the timer", "I said goodbye to her").
 *
 *  2. A thank-you on its own ("thank you", "lovely, thank you dear") is politeness, not a goodbye:
 *     people in a care home say it all the time. It never ends the conversation. Empathika answers
 *     it, and then winds down: if she didn't ask anything back, she listens for a shorter moment and
 *     goes quiet if nothing more is said (windDown). A request after it carries on as usual.
 *
 *  3. Everything else is the AI model's call (the end_conversation action): it hears the whole
 *     conversation, so it can tell "right, I'll have my tea now" from a question.
 */
const PHRASES = [
  'stop', 'stop it', 'stop talking', 'stop now', 'just stop', 'please stop', 'stop stop',
  'quiet', 'be quiet', 'shush', 'shh', 'hush', 'shut up', 'silence', 'enough', "that's enough",
  "that's all", "that's it", 'that is all', 'that will be all', "that'll be all", 'all good', "i'm done", 'done', "we're done",
  'never mind', 'nevermind', 'forget it', 'forget about it', 'cancel', 'cancel that',
  'go to sleep', 'go away', 'goodbye', 'bye', 'bye bye', 'see you', 'see you later', 'see you tomorrow', 'good night', 'night night',
  'nothing', 'nothing else', 'no nothing else',
  'not you', "i'm not talking to you", "i wasn't talking to you", 'not talking to you', "wasn't talking to you",
  'talking to someone else', "i'm talking to someone else",
];
const STOP = new Set(PHRASES.map((p) => p.replace(/'/g, '')));
const WAKE_WORDS = /^(hey |hi |ok |okay )?(empathika|empathica|empatika|max|jarvis)\b ?/;
/** Words of thanks, in the forms speech recognition writes them. */
const THANK = '(?:thank you|thanks|thankyou|thank u|cheers|ta|much obliged|bless you)';
/**
 * Words that don't change what was meant: politeness, endearments, her name, little fillers. Taken
 * out before looking for a goodbye, so "thank you dear, that's all for now" is still "that's all".
 */
const FILLER = new RegExp(
  `\\b(?:${THANK}(?: (?:so|very) much| a lot| a million| again| for that| for your help| for everything)*` +
    '|please|ok|okay|oh|well|right|alright|so|then|now|for now|for today|for tonight|i think|yes|yeah' +
    '|lovely|great|perfect|brilliant|wonderful|super|that s (?:great|perfect|lovely)|thats (?:great|perfect|lovely)' +
    '|dear|love|darling|pet|duck|nurse|empathika|empathica|max|my dear|my love)\\b',
  'g',
);
/** Only thanks and filler, nothing asked ("thank you", "oh that's lovely, thank you dear"). */
const HAS_THANKS = new RegExp(`\\b${THANK}\\b`);

function plain(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** What is left once the politeness and fillers are taken out. */
function core(t: string): string {
  return t.replace(WAKE_WORDS, '').replace(FILLER, ' ').replace(/\s+/g, ' ').trim();
}

/** A clear stop or goodbye: ends the conversation at once. A thank-you alone is not one. */
export function isStopRequest(text: string): boolean {
  const t = plain(text);
  if (!t || t.split(' ').length > 10) return false;
  // As said ("good night", "all good"), then with the politeness and fillers taken out ("thank you dear, that's all for now").
  if (STOP.has(t.replace(WAKE_WORDS, '').trim())) return true;
  const c = core(t);
  if (!c) return false; // only thanks and fillers: politeness, not a goodbye
  return STOP.has(c) || STOP.has(c.replace(/^(no|and) /, ''));
}

/** A thank-you and nothing else: politeness. Empathika answers it; it doesn't end the conversation. */
export function isJustThanks(text: string): boolean {
  const t = plain(text);
  if (!t || t.split(' ').length > 10 || !HAS_THANKS.test(t)) return false;
  return core(t).replace(/^no$/, '') === '';
}

/**
 * After a thank-you on its own: whether to wind the conversation down (a shorter wait, then quiet).
 * Not when Empathika's answer asked something ("Would you like another?"): then she waits for the
 * answer as usual. Not when an activity is under way: "thank you" there is part of the game.
 */
export function windDown(userText: string, reply: string | undefined, activityRunning = false): boolean {
  if (activityRunning || !isJustThanks(userText)) return false;
  return !/\?\s*["'”’)]*\s*$/.test((reply ?? '').trim());
}
