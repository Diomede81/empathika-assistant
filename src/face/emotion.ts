/**
 * Empathika's facial expression, worked out from what she says. Simple word cues are enough for a
 * face (and cost nothing): an apology looks concerned, good news looks happy, a question
 * looks curious. Works the same for every voice option because it reads her words.
 */
export type Emotion = 'neutral' | 'happy' | 'warm' | 'curious' | 'concerned' | 'surprised' | 'sleepy' | 'thoughtful';

export const EMOTIONS: Emotion[] = ['neutral', 'happy', 'warm', 'curious', 'concerned', 'surprised', 'sleepy', 'thoughtful'];

const CUES: [Emotion, RegExp][] = [
  ['concerned', /\b(sorry|apologi[sz]e|unfortunately|can'?t|cannot|couldn'?t|unable|failed|error|problem|went wrong|not working|didn'?t work|afraid|no access|trouble|careful|warning|urgent|overdue|missed)\b/i],
  ['surprised', /\b(wow|whoa|oh!|really\?|no way|amazing|incredible|surprising|unexpected)\b|\btime'?s up\b|^reminder:/i],
  // Tenderness: affection, family, comfort ("Sarah sends her love", "take care, dear").
  ['warm', /\b(love|loves|loved|dear|darling|sweetheart|bless (you|her|him)|miss(es|ed)? you|proud|take care|hug|cuddle|grandchild\w*|granddaughter|grandson|lovely to (see|hear)|thinking of you|you'?re (safe|not alone)|i'?m here (for you|with you))\b/i],
  ['happy', /\b(great|done|sure|of course|happy to|glad|lovely|brilliant|perfect|excellent|nice|awesome|congrat\w*|well done|good (morning|afternoon|evening|news)|enjoy|you'?re welcome|no problem|absolutely|ha(ha)+|fun)\b|!\s*$/i],
  ['thoughtful', /\b(let me (check|look|see|find|search)|looking (it )?up|checking|searching|one moment|just a (moment|sec)|working on)\b/i],
  ['sleepy', /\b(good ?night|sleep well|sweet dreams|bed ?time|tired)\b/i],
  ['curious', /\?\s*$|\b(i wonder|interesting|curious|tell me more|which one|what (kind|sort))\b/i],
];

/** The expression for a piece of text, or undefined to keep the current one. */
export function emotionFor(text: string): Emotion | undefined {
  const t = text.trim();
  if (!t) return undefined;
  for (const [e, re] of CUES) if (re.test(t)) return e;
  return undefined;
}
