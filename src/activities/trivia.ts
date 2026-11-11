/**
 * The trivia question bank: multiple choice, checked by the box (no AI needed to know the answer).
 * Written for people in their 70s to 90s in Britain: the music, films, places and everyday life they
 * know. Only well-established facts, nothing upsetting. The first option is always the right one
 * (they are shuffled when asked). Level 1 = most people know it, 3 = a good challenge.
 */
import { spokenNumbers } from './content';

export const TRIVIA_TOPICS = {
  music: 'Music and song',
  screen: 'Films and television',
  royal: 'The Royal Family',
  britain: 'Places',
  food: 'Food and drink',
  nature: 'Nature',
  history: 'History and the old days',
  sport: 'Sport and games',
  general: 'General knowledge',
} as const;
export type TriviaTopic = keyof typeof TRIVIA_TOPICS;

export interface TriviaQuestion {
  topic: TriviaTopic;
  level: 1 | 2 | 3;
  q: string;
  /** The right answer first, then two wrong ones. */
  options: [string, string, string];
}

const t = (topic: TriviaTopic, level: 1 | 2 | 3, q: string, right: string, wrong1: string, wrong2: string): TriviaQuestion => ({ topic, level, q, options: [right, wrong1, wrong2] });

export const TRIVIA: TriviaQuestion[] = [
  // ----- music -----
  t('music', 1, "Which group sang 'She Loves You'?", 'The Beatles', 'The Rolling Stones', 'The Kinks'),
  t('music', 1, 'Who was known as the King of Rock and Roll?', 'Elvis Presley', 'Cliff Richard', 'Tommy Steele'),
  t('music', 1, 'How many Beatles were there?', 'Four', 'Three', 'Five'),
  t('music', 1, "Which musical has the song 'Supercalifragilisticexpialidocious'?", 'Mary Poppins', 'The Sound of Music', 'Oliver!'),
  t('music', 1, "Vera Lynn sang 'We'll Meet Again'. What was she known as?", "The Forces' Sweetheart", 'The Nightingale of London', 'The Queen of Song'),
  t('music', 2, "Which singer had a hit with 'Summer Holiday'?", 'Cliff Richard', 'Adam Faith', 'Billy Fury'),
  t('music', 2, "Which Welsh singer is famous for 'It's Not Unusual'?", 'Tom Jones', 'Harry Secombe', 'Max Boyce'),
  t('music', 2, "Who sang 'Downtown' in 1964?", 'Petula Clark', 'Dusty Springfield', 'Sandie Shaw'),
  t('music', 2, "Which musical features the song 'Edelweiss'?", 'The Sound of Music', 'My Fair Lady', 'South Pacific'),
  t('music', 2, "Which Liverpool singer sang 'Anyone Who Had a Heart' and later presented Blind Date?", 'Cilla Black', 'Lulu', 'Helen Shapiro'),
  t('music', 2, "Which instrument did Acker Bilk play on 'Stranger on the Shore'?", 'The clarinet', 'The trumpet', 'The piano'),
  t('music', 3, 'Which group did Diana Ross sing with?', 'The Supremes', 'The Ronettes', 'The Shirelles'),
  t('music', 3, "Who composed the music for 'Land of Hope and Glory'?", 'Edward Elgar', 'Benjamin Britten', 'Gustav Holst'),
  t('music', 3, 'Shirley Bassey sang the theme for which James Bond film in 1964?', 'Goldfinger', 'Thunderball', 'Dr. No'),

  // ----- films and television -----
  t('screen', 1, 'In which programme would you find the Rovers Return pub?', 'Coronation Street', 'EastEnders', 'Emmerdale'),
  t('screen', 1, 'Who played Mary Poppins in the 1964 film?', 'Julie Andrews', 'Audrey Hepburn', 'Doris Day'),
  t('screen', 1, 'What kind of animal was Lassie?', 'A dog', 'A horse', 'A dolphin'),
  t('screen', 1, "In 'The Wizard of Oz', what colour is the brick road?", 'Yellow', 'Red', 'Green'),
  t('screen', 1, 'Which programme has the Queen Vic pub?', 'EastEnders', 'Coronation Street', 'Crossroads'),
  t('screen', 2, 'Which comedy pair were known as Eric and Ernie?', 'Morecambe and Wise', 'The Two Ronnies', 'Little and Large'),
  t('screen', 2, "In 'Dad's Army', what was the name of the town?", 'Walmington-on-Sea', 'Weston-super-Mare', 'Frinton-on-Sea'),
  t('screen', 2, 'Who was the first actor to play James Bond in the films?', 'Sean Connery', 'Roger Moore', 'David Niven'),
  t('screen', 2, 'Who was the Little Tramp of the silent films?', 'Charlie Chaplin', 'Buster Keaton', 'Stan Laurel'),
  t('screen', 2, "Which police series had the greeting 'Evening, all'?", 'Dixon of Dock Green', 'Z-Cars', 'The Bill'),
  t('screen', 2, "Which entertainer said 'Nice to see you, to see you, nice'?", 'Bruce Forsyth', 'Bob Monkhouse', 'Larry Grayson'),
  t('screen', 2, 'Which comedy featured Del Boy and Rodney?', 'Only Fools and Horses', 'Steptoe and Son', 'Porridge'),
  t('screen', 3, "Which film has the line 'Frankly, my dear, I don't give a damn'?", 'Gone with the Wind', 'Casablanca', 'Brief Encounter'),
  t('screen', 3, "Who starred with Humphrey Bogart in 'Casablanca'?", 'Ingrid Bergman', 'Lauren Bacall', 'Vivien Leigh'),

  // ----- the Royal Family -----
  t('royal', 1, 'What breed of dog did Queen Elizabeth the Second famously keep?', 'Corgis', 'Labradors', 'Spaniels'),
  t('royal', 1, "Who was Queen Elizabeth the Second's husband?", 'Prince Philip', 'Prince Albert', 'Prince Edward'),
  t('royal', 1, "Which palace is the monarch's home in London?", 'Buckingham Palace', 'Hampton Court Palace', 'Blenheim Palace'),
  t('royal', 2, 'In which year was Queen Elizabeth the Second crowned?', '1953', '1945', '1960'),
  t('royal', 2, 'Which castle in Berkshire is a royal home?', 'Windsor Castle', 'Warwick Castle', 'Leeds Castle'),
  t('royal', 2, 'Where in Scotland does the Royal Family spend the summer?', 'Balmoral', 'Gleneagles', 'St Andrews'),
  t('royal', 2, 'How many children did Queen Elizabeth the Second have?', 'Four', 'Two', 'Three'),
  t('royal', 3, 'Who was king just before Queen Elizabeth the Second?', 'George the Sixth', 'George the Fifth', 'Edward the Seventh'),
  t('royal', 3, 'Which king gave up the throne in 1936?', 'Edward the Eighth', 'George the Fifth', 'William the Fourth'),

  // ----- places -----
  t('britain', 1, 'What is the capital of Scotland?', 'Edinburgh', 'Glasgow', 'Aberdeen'),
  t('britain', 1, 'Which river runs through London?', 'The Thames', 'The Severn', 'The Mersey'),
  t('britain', 1, 'What is the capital of Wales?', 'Cardiff', 'Swansea', 'Newport'),
  t('britain', 1, 'What is the capital of France?', 'Paris', 'Rome', 'Madrid'),
  t('britain', 1, 'Which famous stone circle stands on Salisbury Plain?', 'Stonehenge', 'Avebury', 'Castlerigg'),
  t('britain', 1, 'Which city is the home of the Beatles?', 'Liverpool', 'Manchester', 'Newcastle'),
  t('britain', 2, 'Which seaside town is famous for its Tower and its Illuminations?', 'Blackpool', 'Brighton', 'Scarborough'),
  t('britain', 2, 'What is the highest mountain in Britain?', 'Ben Nevis', 'Snowdon', 'Scafell Pike'),
  t('britain', 2, 'In which county is the Lake District?', 'Cumbria', 'Yorkshire', 'Devon'),
  t('britain', 2, 'Which city has a famous Minster and a street called the Shambles?', 'York', 'Chester', 'Lincoln'),
  t('britain', 2, "In which county is Land's End?", 'Cornwall', 'Devon', 'Dorset'),
  t('britain', 2, 'What is the capital of Northern Ireland?', 'Belfast', 'Dublin', 'Londonderry'),
  t('britain', 3, 'Which is the longest river in Britain?', 'The Severn', 'The Thames', 'The Trent'),
  t('britain', 3, 'Which English city is known for its dreaming spires?', 'Oxford', 'Cambridge', 'Durham'),

  // ----- food and drink -----
  t('food', 1, 'What is traditionally served with roast beef on a Sunday?', 'Yorkshire pudding', 'Dumplings', 'Pancakes'),
  t('food', 1, 'What are chips made from?', 'Potatoes', 'Parsnips', 'Turnips'),
  t('food', 1, 'What do people traditionally eat on Shrove Tuesday?', 'Pancakes', 'Hot cross buns', 'Mince pies'),
  t('food', 1, 'What do bees make?', 'Honey', 'Jam', 'Butter'),
  t('food', 1, 'Which vegetable can make you cry when you chop it?', 'An onion', 'A carrot', 'A potato'),
  t('food', 1, 'According to the saying, which fruit a day keeps the doctor away?', 'An apple', 'A pear', 'A plum'),
  t('food', 2, 'Which county is famous for its pasties?', 'Cornwall', 'Kent', 'Norfolk'),
  t('food', 2, 'Which cheese is named after a village with a gorge in Somerset?', 'Cheddar', 'Stilton', 'Wensleydale'),
  t('food', 2, 'What is spread between the layers of a Victoria sponge?', 'Jam', 'Custard', 'Marmalade'),
  t('food', 2, 'Which spirit is poured over a Christmas pudding and set alight?', 'Brandy', 'Gin', 'Vodka'),
  t('food', 3, "Which meat goes into a traditional shepherd's pie?", 'Lamb', 'Beef', 'Pork'),
  t('food', 3, 'Which town in Leicestershire is famous for its pork pies?', 'Melton Mowbray', 'Bakewell', 'Eccles'),

  // ----- nature -----
  t('nature', 1, 'Which garden bird has a red breast?', 'The robin', 'The blackbird', 'The sparrow'),
  t('nature', 1, 'How many legs does a spider have?', 'Eight', 'Six', 'Ten'),
  t('nature', 1, 'What do caterpillars turn into?', 'Butterflies', 'Bees', 'Ladybirds'),
  t('nature', 1, 'In which season do the leaves fall from the trees?', 'Autumn', 'Spring', 'Summer'),
  t('nature', 2, 'Which tree do acorns come from?', 'The oak', 'The ash', 'The beech'),
  t('nature', 2, 'Which flower is a symbol of Wales, along with the leek?', 'The daffodil', 'The tulip', 'The poppy'),
  t('nature', 2, 'What is a baby swan called?', 'A cygnet', 'A gosling', 'A duckling'),
  t('nature', 2, "Which bird lays its eggs in other birds' nests?", 'The cuckoo', 'The magpie', 'The wren'),
  t('nature', 2, 'What is the national flower of England?', 'The rose', 'The daisy', 'The lily'),
  t('nature', 2, 'What is the national flower of Scotland?', 'The thistle', 'The heather', 'The bluebell'),
  t('nature', 2, 'What is a group of lions called?', 'A pride', 'A herd', 'A pack'),
  t('nature', 3, 'What is the largest bird in the world?', 'The ostrich', 'The eagle', 'The swan'),

  // ----- history and the old days -----
  t('history', 1, 'Who was Prime Minister for most of the Second World War?', 'Winston Churchill', 'Clement Attlee', 'Neville Chamberlain'),
  t('history', 1, 'During the war and after, what book did you need to buy your food?', 'A ration book', 'A cheque book', 'A log book'),
  t('history', 1, 'What was Florence Nightingale famous for being?', 'A nurse', 'A singer', 'A queen'),
  t('history', 2, 'In which year did the Second World War end?', '1945', '1939', '1950'),
  t('history', 2, 'Which great ship sank on her first voyage in 1912?', 'The Titanic', 'The Queen Mary', 'The Lusitania'),
  t('history', 2, 'Which old coin was worth twelve pennies?', 'A shilling', 'A florin', 'A farthing'),
  t('history', 2, 'How many shillings were there in a pound?', 'Twenty', 'Ten', 'Twelve'),
  t('history', 2, 'Who was the first man to walk on the Moon?', 'Neil Armstrong', 'Yuri Gagarin', 'Buzz Aldrin'),
  t('history', 2, 'In which year did man first walk on the Moon?', '1969', '1959', '1979'),
  t('history', 2, "Who was Britain's first woman Prime Minister?", 'Margaret Thatcher', 'Barbara Castle', 'Shirley Williams'),
  t('history', 2, 'Which famous battle was fought in 1066?', 'The Battle of Hastings', 'The Battle of Waterloo', 'The Battle of Trafalgar'),
  t('history', 3, 'In which year did Britain change to decimal money?', '1971', '1961', '1981'),

  // ----- sport and games -----
  t('sport', 1, 'Which sport is played at Wimbledon?', 'Tennis', 'Cricket', 'Golf'),
  t('sport', 1, 'In which year did England win the football World Cup?', '1966', '1956', '1976'),
  t('sport', 1, 'What kind of race is the Grand National?', 'A horse race', 'A motor race', 'A boat race'),
  t('sport', 1, "In which game might you hear 'two fat ladies, eighty-eight'?", 'Bingo', 'Darts', 'Snooker'),
  t('sport', 2, 'How many players does a football team have on the pitch?', 'Eleven', 'Nine', 'Thirteen'),
  t('sport', 2, 'Which sport uses a shuttlecock?', 'Badminton', 'Squash', 'Table tennis'),
  t('sport', 2, 'In which sport do you score a try?', 'Rugby', 'Hockey', 'Football'),
  t('sport', 2, 'In cricket, how many runs do you get for hitting the ball over the boundary without a bounce?', 'Six', 'Four', 'Two'),
  t('sport', 2, 'The Ashes are played between England and which country?', 'Australia', 'India', 'New Zealand'),
  t('sport', 3, 'Who was the captain of England when they won the World Cup in 1966?', 'Bobby Moore', 'Bobby Charlton', 'Geoff Hurst'),
  t('sport', 3, 'What is the highest score you can get with three darts?', '180', '150', '200'),

  // ----- general knowledge -----
  t('general', 1, 'How many days are there in a week?', 'Seven', 'Five', 'Six'),
  t('general', 1, 'How many months are there in a year?', 'Twelve', 'Ten', 'Eleven'),
  t('general', 1, 'How many minutes are there in an hour?', 'Sixty', 'Fifty', 'One hundred'),
  t('general', 1, 'Which month has the fewest days?', 'February', 'April', 'November'),
  t('general', 1, 'How many are there in a dozen?', 'Twelve', 'Ten', 'Twenty'),
  t('general', 1, 'In the nursery rhyme, who went up the hill with Jack?', 'Jill', 'Mary', 'Polly'),
  t('general', 1, 'Who looks after your teeth?', 'A dentist', 'An optician', 'A chemist'),
  t('general', 2, 'Which colour do you get by mixing red and yellow?', 'Orange', 'Green', 'Purple'),
  t('general', 2, "Who wrote 'Romeo and Juliet'?", 'William Shakespeare', 'Charles Dickens', 'Robert Burns'),
  t('general', 2, "Who wrote 'Oliver Twist'?", 'Charles Dickens', 'Thomas Hardy', 'Jane Austen'),
  t('general', 2, 'Which detective lived at 221B Baker Street?', 'Sherlock Holmes', 'Hercule Poirot', 'Miss Marple'),
  t('general', 2, 'Which bear loves marmalade sandwiches?', 'Paddington', 'Rupert', 'Winnie the Pooh'),
  t('general', 3, "Who wrote 'Pride and Prejudice'?", 'Jane Austen', 'Charlotte Brontë', 'George Eliot'),
  t('general', 3, "How many is a baker's dozen?", 'Thirteen', 'Twelve', 'Fourteen'),
  t('general', 3, 'Who painted the Mona Lisa?', 'Leonardo da Vinci', 'Michelangelo', 'Rembrandt'),
  t('general', 3, 'Who wrote the Peter Rabbit stories?', 'Beatrix Potter', 'Enid Blyton', 'A. A. Milne'),
];

/** The topic someone asked for ("music", "the royals", "films"), if it is one of ours. */
export function triviaTopicOf(s?: string): TriviaTopic | undefined {
  const k = (s ?? '').toLowerCase();
  if (!k) return undefined;
  if (k in TRIVIA_TOPICS) return k as TriviaTopic;
  if (/music|song|sing|band/.test(k)) return 'music';
  if (/film|movie|tv|telly|television|pictures|cinema|programme/.test(k)) return 'screen';
  if (/royal|queen|king|palace/.test(k)) return 'royal';
  if (/place|geograph|town|cit|britain|england|country|countries|map|seaside/.test(k)) return 'britain';
  if (/food|drink|cook|bak|eat/.test(k)) return 'food';
  if (/nature|animal|bird|flower|garden|plant/.test(k)) return 'nature';
  if (/histor|war|old days|past|money/.test(k)) return 'history';
  if (/sport|football|cricket|game|tennis/.test(k)) return 'sport';
  if (/general|anything|mix/.test(k)) return 'general';
  return undefined;
}

const NUMBER_WORDS: Record<number, string> = { 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine', 10: 'ten', 11: 'eleven', 12: 'twelve', 13: 'thirteen', 14: 'fourteen', 20: 'twenty', 50: 'fifty', 60: 'sixty', 100: 'one hundred' };

const ORDINALS: [RegExp, number][] = [
  [/\b(a|first|1st|one|number one|top)\b/, 0],
  [/\b(b|second|2nd|two|number two|middle)\b/, 1],
  [/\b(c|third|3rd|three|number three|last|bottom)\b/, 2],
];
const SMALL = new Set(['the', 'a', 'an', 'of', 'and', 'in', 'on', 'is', 'it', 'its', 'i', 'think', 'was', 'were', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']);

/**
 * Which option someone chose, from what they said: by its words ("the Beatles", "was it Churchill?"),
 * or by its letter or place ("B", "the second one"). undefined when it isn't clear (none, or more
 * than one option named).
 */
export function chosenOption(text: string, options: string[]): number | undefined {
  // Numbers both ways: "nineteen fifty three" also counts as 1953, and "4" as "four".
  const nums = spokenNumbers(text);
  const extra: string[] = nums.map(String);
  for (let i = 0; i + 1 < nums.length; i++) if (nums[i] >= 10 && nums[i] < 100 && nums[i + 1] < 100) extra.push(String(nums[i] * 100 + nums[i + 1]));
  for (const d of text.match(/\b\d{1,3}\b/g) ?? []) if (NUMBER_WORDS[Number(d)]) extra.push(NUMBER_WORDS[Number(d)]);
  const n = ' ' + (text + ' ' + extra.join(' ')).toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
  const words = (o: string) => o.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  // By the option's own words: all of them, or its distinctive ones (not "the", not shared with another option).
  const hits: number[] = [];
  options.forEach((o, i) => {
    const all = words(o);
    const others = new Set(options.filter((_, j) => j !== i).flatMap(words));
    const own = all.filter((w) => !SMALL.has(w) && !others.has(w));
    const whole = n.includes(' ' + all.join(' ') + ' ') || n.includes(' ' + all.filter((w) => w !== 'the' && w !== 'a' && w !== 'an').join(' ') + ' ');
    if (whole || (own.length > 0 && own.some((w) => n.includes(' ' + w + ' ') || n.includes(' ' + w + 's ')))) hits.push(i);
  });
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) return undefined;
  // By letter or place, only in a short answer ("B", "the second one", "number two").
  const plain = ' ' + text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
  if (plain.trim().split(' ').length > 6) return undefined;
  const places = ORDINALS.filter(([re]) => re.test(plain)).map(([, i]) => i);
  // "a" alone is too common a word: count it only as the whole answer or with "option"/"letter"/"answer".
  const t0 = plain.trim();
  const letter = /^(option |letter |answer )?([abc])$/.exec(t0);
  if (letter) return 'abc'.indexOf(letter[2]);
  const strict = places.filter((i) => !(i === 0 && !/\b(first|1st|number one|top)\b/.test(plain) && t0 !== 'one'));
  return strict.length === 1 ? strict[0] : undefined;
}
