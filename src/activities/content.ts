/**
 * The puzzles Empathika can run and check by herself (no AI needed to know the answer), in three
 * levels each, plus starters for the activities the AI runs (quiz topics, reminiscence prompts).
 * Familiar words and sayings for people in their 70s to 90s, British English.
 */

/** Words to unscramble, by level, with a clue. */
export const ANAGRAMS: Record<1 | 2 | 3, [string, string][]> = {
  1: [
    ['CAKE', 'something sweet for tea'], ['ROSE', 'a flower'], ['BREAD', 'from the baker'], ['HOUSE', 'a place to live'], ['TRAIN', 'runs on rails'],
    ['APPLE', 'a fruit'], ['CHAIR', 'you sit on it'], ['MILK', 'from the cow'], ['BOAT', 'on the water'], ['SNOW', 'falls in winter'],
    ['BIRD', 'it sings in the garden'], ['SHOE', 'you wear it'], ['LAMB', 'a young sheep'], ['BEACH', 'at the seaside'], ['CLOCK', 'tells the time'],
    ['DANCE', 'on a Saturday night'], ['HONEY', 'made by bees'], ['TOAST', 'for breakfast'], ['STAR', 'in the night sky'], ['PIANO', 'a musical instrument'],
  ],
  2: [
    ['GARDEN', 'where flowers grow'], ['KITTEN', 'a young cat'], ['SUMMER', 'a season'], ['BUTTER', 'on your bread'], ['ORANGE', 'a fruit and a colour'],
    ['CASTLE', 'a king lives there'], ['BRIDGE', 'crosses a river'], ['POTATO', 'a vegetable'], ['WINDOW', 'you look out of it'], ['CARPET', 'on the floor'],
    ['PARCEL', 'comes in the post'], ['TEAPOT', 'for a good brew'], ['ROBIN', 'a bird with a red breast'], ['SCHOOL', 'where children learn'], ['MARKET', 'stalls and shopping'],
    ['CHURCH', 'bells on Sunday'], ['PICNIC', 'food outdoors'], ['DAISY', 'a little white flower'], ['TICKET', 'for the bus or the pictures'], ['SPRING', 'a season'],
  ],
  3: [
    ['HOLIDAY', 'a trip away'], ['BUTTERFLY', 'colourful wings'], ['CHRISTMAS', 'in December'], ['ELEPHANT', 'a big grey animal'], ['SANDWICH', 'for a packed lunch'],
    ['UMBRELLA', 'for the rain'], ['STRAWBERRY', 'with cream at Wimbledon'], ['CHOCOLATE', 'a sweet treat'], ['NEWSPAPER', 'read with breakfast'], ['WARDROBE', 'where clothes hang'],
    ['BLACKBIRD', 'sings at dusk'], ['PEPPERMINT', 'a sweet or a tea'], ['LIGHTHOUSE', 'by the sea'], ['ALLOTMENT', 'growing vegetables'], ['GRANDFATHER', 'family'],
    ['TELEPHONE', 'to make a call'], ['BALLROOM', 'for dancing'], ['RAINBOW', 'after the rain'], ['CARNATION', 'a flower'], ['SEASIDE', 'a day out'],
  ],
};

/** Finish the saying: [the start, the end, the key words that must be in the answer]. */
export const SAYINGS: [string, string, string[]][] = [
  ['A stitch in time…', 'saves nine', ['nine']],
  ['Too many cooks…', 'spoil the broth', ['broth']],
  ['An apple a day…', 'keeps the doctor away', ['doctor']],
  ['Every cloud…', 'has a silver lining', ['silver']],
  ['The early bird…', 'catches the worm', ['worm']],
  ['Don\'t count your chickens…', 'before they hatch', ['hatch']],
  ['Many hands…', 'make light work', ['light']],
  ['Where there\'s a will…', 'there\'s a way', ['way']],
  ['Look before…', 'you leap', ['leap']],
  ['Absence makes the heart…', 'grow fonder', ['fonder']],
  ['A bird in the hand…', 'is worth two in the bush', ['two', 'bush']],
  ['Better late…', 'than never', ['never']],
  ['Birds of a feather…', 'flock together', ['flock']],
  ['Don\'t put all your eggs…', 'in one basket', ['basket']],
  ['Every dog…', 'has its day', ['day']],
  ['Actions speak louder…', 'than words', ['words']],
  ['Rome wasn\'t built…', 'in a day', ['day']],
  ['Still waters…', 'run deep', ['deep']],
  ['There\'s no place…', 'like home', ['home']],
  ['Waste not…', 'want not', ['want']],
  ['You can\'t teach an old dog…', 'new tricks', ['tricks']],
  ['All\'s well…', 'that ends well', ['ends']],
  ['Two heads…', 'are better than one', ['better']],
  ['When the cat\'s away…', 'the mice will play', ['mice']],
  ['The grass is always greener…', 'on the other side', ['other', 'side']],
  ['Out of sight…', 'out of mind', ['mind']],
  ['Laughter is…', 'the best medicine', ['medicine']],
  ['Practice makes…', 'perfect', ['perfect']],
  ['Make hay…', 'while the sun shines', ['sun']],
  ['It never rains…', 'but it pours', ['pours']],
  ['A watched pot…', 'never boils', ['boils']],
  ['Beauty is in the eye…', 'of the beholder', ['beholder']],
  ['Don\'t judge a book…', 'by its cover', ['cover']],
  ['Home is where…', 'the heart is', ['heart']],
  ['Necessity is the mother…', 'of invention', ['invention']],
  ['Strike while the iron…', 'is hot', ['hot']],
  ['You can lead a horse to water…', 'but you can\'t make it drink', ['drink']],
  ['Every little helps', 'every little helps', ['little']],
  ['Old habits…', 'die hard', ['die']],
  ['The proof of the pudding…', 'is in the eating', ['eating']],
].filter((s) => s[0] !== 'Every little helps') as [string, string, string[]][];

/** Everyday words for the "remember these" game. */
export const RECALL_WORDS = [
  'apple', 'train', 'blue', 'kettle', 'rose', 'hat', 'piano', 'garden', 'bread', 'dog', 'church', 'sea', 'book', 'candle', 'river',
  'clock', 'butter', 'robin', 'bicycle', 'scarf', 'lemon', 'bridge', 'cup', 'violin', 'tulip', 'cake', 'boat', 'pencil', 'shoe', 'moon',
  'chair', 'orange', 'bell', 'carrot', 'umbrella', 'horse', 'window', 'tea', 'ladder', 'cherry', 'drum', 'teapot', 'snow', 'button', 'basket',
];

/** Things to name (open: the AI judges the answers). */
export const CATEGORIES = [
  'flowers you might find in an English garden', 'things you take to the seaside', 'animals on a farm', 'fruits', 'vegetables for a Sunday dinner',
  'things in a kitchen', 'girls\' names beginning with M', 'boys\' names beginning with J', 'towns by the sea', 'kinds of bird',
  'things that are red', 'puddings', 'board games and card games', 'dances', 'jobs people did when you were young', 'things in a sewing box',
  'colours', 'kinds of tree', 'things you\'d find in a shed', 'sweets from when you were young',
];

/** Topics for a gentle quiz (the AI makes the questions, suited to the resident's era and interests). */
export const QUIZ_TOPICS = [
  'famous songs and singers of the 1950s and 60s', 'classic British films and film stars', 'the Royal Family', 'British towns and cities',
  'old television programmes', 'food and cooking', 'nature and garden birds', 'football and cricket', 'famous inventions', 'the seaside',
  'the seasons and the weather', 'animals', 'old money and shopping', 'nursery rhymes and children\'s stories', 'flowers and plants',
  'famous landmarks', 'the countryside', 'dances and dance halls', 'Christmas traditions', 'history (gently, nothing upsetting)',
];

/** Conversation starters about the old days (used when there is nothing personal to build on yet). */
export const REMINISCENCE = [
  'What was your first job, and how did you get there each day?', 'Tell me about the house you grew up in.', 'What games did you play as a child?',
  'What was your school like? Did you have a favourite teacher?', 'Where did you go dancing when you were young?', 'Tell me about your wedding day.',
  'What did a Sunday look like when you were growing up?', 'What was your favourite meal your mother made?', 'Did you have a holiday you remember especially?',
  'What music did you love when you were young?', 'Tell me about a pet you had.', 'What did you do at Christmas when you were little?',
  'What was the first film you saw at the pictures?', 'Which shops were on your street when you were young?', 'How did you meet your best friend?',
  'What were you most proud of in your working life?', 'Tell me about a place you lived that you loved.', 'What did you do on bonfire night?',
  'Did you have a garden? What did you grow?', 'What was your first car, or how did you get about?', 'Who taught you to cook, or to sew, or to fix things?',
  'What was the best present you ever got?', 'What made you laugh as a youngster?', 'Tell me about your brothers and sisters.',
];

/** A sum or a little money puzzle, by level: [what to ask, the answer, is it money (pence)]. */
export function numberPuzzle(level: 1 | 2 | 3, rnd = Math.random): { ask: string; show: string; answer: number; money: boolean } {
  const r = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
  if (level === 1) {
    const a = r(2, 9);
    const b = r(1, 9);
    return rnd() < 0.7 ? { ask: `What is ${a} add ${b}?`, show: `${a} + ${b}`, answer: a + b, money: false } : { ask: `What is ${a + b} take away ${b}?`, show: `${a + b} − ${b}`, answer: a, money: false };
  }
  if (level === 2) {
    const pick = rnd();
    if (pick < 0.4) {
      const a = r(11, 49);
      const b = r(5, 40);
      return { ask: `What is ${a} add ${b}?`, show: `${a} + ${b}`, answer: a + b, money: false };
    }
    if (pick < 0.7) {
      const a = r(2, 10);
      const b = r(2, 10);
      return { ask: `What is ${a} times ${b}?`, show: `${a} × ${b}`, answer: a * b, money: false };
    }
    const a = r(30, 99);
    const b = r(10, a - 5);
    return { ask: `What is ${a} take away ${b}?`, show: `${a} − ${b}`, answer: a - b, money: false };
  }
  const pick = rnd();
  if (pick < 0.5) {
    const price = r(3, 19) * 5 + 100 * r(0, 2);
    const paid = price < 100 ? 100 : price < 200 ? 200 : 500;
    return { ask: `You buy something for ${money(price)} and pay with a ${money(paid)} ${paid >= 500 ? 'note' : 'coin'}. How much change do you get?`, show: `${money(paid)} − ${money(price)}`, answer: paid - price, money: true };
  }
  if (pick < 0.75) {
    const a = r(3, 12);
    const b = r(3, 12);
    return { ask: `What is ${a} times ${b}?`, show: `${a} × ${b}`, answer: a * b, money: false };
  }
  const start = r(1, 10);
  const step = r(2, 7);
  const seq = [0, 1, 2, 3].map((i) => start + i * step);
  return { ask: `What comes next: ${seq.join(', ')}…?`, show: `${seq.join(', ')}, ?`, answer: start + 4 * step, money: false };
}

export function money(pence: number): string {
  if (pence < 100) return `${pence}p`;
  return pence % 100 ? `£${Math.floor(pence / 100)}.${String(pence % 100).padStart(2, '0')}` : `£${pence / 100}`;
}

const UNITS: Record<string, number> = {
  zero: 0, nought: 0, nil: 0, oh: 0, one: 1, a: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

/**
 * Numbers someone might say for an answer: "twelve", "42", "one hundred and five", and for money
 * "65p", "£1.20", "a pound and twenty pence", "one pound twenty", "one twenty" (as pence).
 */
export function spokenNumbers(text: string, asMoney = false): number[] {
  const t = text.toLowerCase().replace(/,/g, '').replace(/-/g, ' ');
  const out = new Set<number>();
  // Written: £1.20, 1.20, 65p, 42
  for (const m of t.matchAll(/£?\s*(\d+)(?:\.(\d{1,2}))?\s*(p\b|pence\b)?/g)) {
    const whole = Number(m[1]);
    if (m[2] !== undefined) out.add(asMoney ? whole * 100 + Number(m[2].padEnd(2, '0')) : Number(`${m[1]}.${m[2]}`));
    else if (asMoney && (m[0].includes('£') || /pound/.test(t.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 8)))) out.add(whole * 100);
    else out.add(whole);
  }
  // Spoken words: runs of number words ("one hundred and five", "twenty five"; "one twenty" is two numbers).
  const runs = wordRuns(t.split(/[^a-z]+/).filter(Boolean));
  for (const r of runs) out.add(r);
  if (asMoney) {
    // "a pound and twenty pence", "one pound twenty", "two pounds fifty"
    const m = t.match(/(\w+(?: \w+)?)\s+pounds?(?:\s+and)?\s+(\w+(?: \w+)?)(?:\s+(?:pence|p))?/);
    if (m) {
      const pounds = wordsValue(m[1]);
      const pence = wordsValue(m[2]);
      if (pounds !== undefined && pence !== undefined && pence < 100) out.add(pounds * 100 + pence);
    }
    const pm = t.match(/(\w+(?: \w+)?)\s+pounds?\b/);
    if (pm) {
      const pounds = wordsValue(pm[1]);
      if (pounds !== undefined) out.add(pounds * 100);
    }
    // "one twenty" said for £1.20
    for (let i = 0; i + 1 < runs.length; i++) {
      if (runs[i] < 10 && runs[i + 1] >= 10 && runs[i + 1] < 100) out.add(runs[i] * 100 + runs[i + 1]);
    }
  }
  return [...out];
}

/** The numbers in a run of words, in order. */
function wordRuns(words: string[]): number[] {
  const out: number[] = [];
  let total = 0;
  let current = 0;
  let has = false;
  const end = () => {
    if (has) out.push(total + current);
    total = 0;
    current = 0;
    has = false;
  };
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const v = w === 'a' ? (/^(hundred|thousand|pound)/.test(words[i + 1] ?? '') ? 1 : undefined) : UNITS[w];
    if (v !== undefined) {
      const fresh = current % 100 === 0;
      const ok = !has || (v < 20 ? fresh || (current % 100 >= 20 && current % 10 === 0) : fresh);
      if (!ok) end();
      current += v;
      has = true;
    } else if (w === 'hundred' && has) current = (current % 100 || 1) * 100 + (current - (current % 100));
    else if (w === 'thousand' && has) {
      total += (current || 1) * 1000;
      current = 0;
    } else if (w === 'and' && has) continue;
    else end();
  }
  end();
  return out;
}

function wordsValue(s: string): number | undefined {
  const t = s.trim().toLowerCase();
  if (/^\d+$/.test(t)) return Number(t);
  const parts = t.split(/\s+/).map((w) => (w === 'a' ? 1 : UNITS[w]));
  if (parts.some((p) => p === undefined)) {
    const last = UNITS[t.split(/\s+/).pop() ?? ''];
    return last;
  }
  return (parts as number[]).reduce((a, b) => a + b, 0);
}

/** Lower case, letters and digits only, single spaces. */
export function norm(s: string): string {
  return s.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

/** The word was said: as a word, or spelt out letter by letter ("c a t"). */
export function saidWord(text: string, word: string): boolean {
  const n = norm(text);
  const w = word.toLowerCase();
  if (new RegExp(`\\b${w}s?\\b`).test(n)) return true;
  return n.replace(/\b([a-z])\b\s*/g, '$1').includes(w);
}

/** Shuffles the letters so the word isn't still readable. */
export function scramble(word: string, rnd = Math.random): string {
  const letters = word.split('');
  for (let tries = 0; tries < 10; tries++) {
    for (let i = letters.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [letters[i], letters[j]] = [letters[j], letters[i]];
    }
    if (letters.join('') !== word) break;
  }
  return letters.join('');
}
