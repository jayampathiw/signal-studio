import type { WordTimingT } from '@signal-studio/providers/contracts';

/**
 * Cleans up word timings before they become on-video captions (P.11).
 *
 * Narration spells numbers out so the voice reads them well, and Whisper
 * writes them back as words, split at hyphens ("twenty", "-twenty", "-four,").
 * The 4-word caption chunks then show hyphen fragments and long spelled-out
 * numbers. This rejoins the fragments (merging their timings) and turns
 * spoken numbers into figures — "ninety-five percent" → "95%", "twenty
 * twenty-four" → "2024", "four hundred eighteen thousand dollars" →
 * "$418,000". Single-digit counts ("one in three") stay words. Only the
 * captions change; the narration text is untouched.
 */
export function tidyCaptionWords(words: WordTimingT[]): WordTimingT[] {
  return numbersToFigures(joinHyphenPieces(words));
}

function joinHyphenPieces(words: WordTimingT[]): WordTimingT[] {
  const out: WordTimingT[] = [];
  for (const w of words) {
    const prev = out[out.length - 1];
    if (prev && (/^-\S/.test(w.text) || /\S-$/.test(prev.text))) {
      out[out.length - 1] = { text: prev.text + w.text, start: prev.start, end: w.end };
    } else {
      out.push({ ...w });
    }
  }
  return out;
}

const UNITS: Record<string, number> = {
  zero: 0,
  oh: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
};
const TEENS: Record<string, number> = {
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};
const SCALES: Record<string, number> = { thousand: 1e3, million: 1e6, billion: 1e9 };

function isNumberWord(w: string): boolean {
  return w in UNITS || w in TEENS || w in TENS || w in SCALES || w === 'hundred' || w === 'point';
}

// "ninety-five," → { lead: '', parts: ['ninety', 'five'], trail: ',' }
function split(text: string) {
  const m = /^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u.exec(text)!;
  return { lead: m[1]!, core: m[2]!, trail: m[3]!, parts: m[2]!.toLowerCase().split('-') };
}

type Kind = 'unit' | 'teen' | 'tens' | 'hundred' | 'scale';

// Parses number words into one or more numbers; a word that can't continue
// the current number starts the next ("twenty twenty four" → [20, 24]).
// Returns null for anything it doesn't understand.
function parseNumbers(parts: string[]): number[] | null {
  const numbers: number[] = [];
  let total = 0;
  let current = 0;
  let last: Kind | null = null;
  let decimals: string | null = null;
  const flush = () => {
    if (last === null) return;
    numbers.push(total + current + (decimals ? Number(`0.${decimals}`) : 0));
    total = 0;
    current = 0;
    last = null;
    decimals = null;
  };
  for (const p of parts) {
    if (decimals !== null) {
      if (!(p in UNITS)) return null;
      decimals += String(UNITS[p]);
      continue;
    }
    if (p === 'point') {
      if (last === null) return null;
      decimals = '';
      continue;
    }
    if (p in UNITS) {
      if (last === 'unit' || last === 'teen') flush();
      current += UNITS[p]!;
      last = 'unit';
    } else if (p in TEENS) {
      if (last === 'unit' || last === 'teen' || last === 'tens') flush();
      current += TEENS[p]!;
      last = 'teen';
    } else if (p in TENS) {
      if (last === 'unit' || last === 'teen' || last === 'tens') flush();
      current += TENS[p]!;
      last = 'tens';
    } else if (p === 'hundred') {
      if (last !== 'unit' && last !== 'teen') return null;
      current *= 100;
      last = 'hundred';
    } else if (p in SCALES) {
      if (last === null || last === 'scale') return null;
      total += current * SCALES[p]!;
      current = 0;
      last = 'scale';
    } else {
      return null;
    }
  }
  if (decimals === '') return null;
  flush();
  return numbers;
}

function figure(n: number): string {
  if (n >= 1e6) {
    for (const [word, scale] of [
      ['billion', 1e9],
      ['million', 1e6],
    ] as const) {
      const v = n / scale;
      if (v >= 1 && Number.isInteger(v * 10)) return `${v} ${word}`;
    }
  }
  // "two thousand nineteen" is a year far more often than a count.
  if (Number.isInteger(n) && n >= 1900 && n <= 2099) return String(n);
  return Number.isInteger(n) ? n.toLocaleString('en-US') : String(n);
}

function numbersToFigures(words: WordTimingT[]): WordTimingT[] {
  const out: WordTimingT[] = [];
  let i = 0;
  while (i < words.length) {
    // Longest run of number-word tokens; punctuation after a token ends the run.
    let j = i;
    while (j < words.length) {
      const s = split(words[j]!.text);
      if (!s.core || !s.parts.every(isNumberWord)) break;
      if (j > i && split(words[j - 1]!.text).trail) break;
      j++;
    }
    if (j === i) {
      out.push(words[i]!);
      i++;
      continue;
    }

    const run = words.slice(i, j);
    const first = split(run[0]!.text);
    const lastSplit = split(run[run.length - 1]!.text);
    const numbers = parseNumbers(run.flatMap((w) => split(w.text).parts));
    let text: string | null = null;
    if (numbers?.length === 1) {
      text = figure(numbers[0]!);
    } else if (
      numbers?.length === 2 &&
      numbers[0]! >= 10 &&
      numbers[0]! <= 20 &&
      numbers[1]! >= 10 &&
      numbers[1]! <= 99 &&
      Number.isInteger(numbers[1]!)
    ) {
      text = String(numbers[0]! * 100 + numbers[1]!);
    }

    let end = run[run.length - 1]!.end;
    let trail = lastSplit.trail;
    let consumed = j;
    const next = !trail && j < words.length ? split(words[j]!.text) : null;
    const unit = next?.core.toLowerCase();
    if (text && (unit === 'percent' || unit === 'dollars' || unit === 'dollar')) {
      text = unit === 'percent' ? `${text}%` : `$${text}`;
      end = words[j]!.end;
      trail = next!.trail;
      consumed = j + 1;
    } else if (
      text &&
      numbers!.length === 1 &&
      Number.isInteger(numbers![0]) &&
      numbers![0]! < 10
    ) {
      text = null;
    }

    if (text === null) {
      out.push(...run);
      i = j;
      continue;
    }
    out.push({ text: `${first.lead}${text}${trail}`, start: run[0]!.start, end });
    i = consumed;
  }
  return out;
}
