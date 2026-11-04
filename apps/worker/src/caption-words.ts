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
  return numbersToFigures(joinAcronyms(joinHyphenPieces(words)));
}

/**
 * The narration's own words, timed against what Whisper heard (P.16).
 *
 * Whisper mishears: spelled-out acronyms come back as loose letters split
 * across caption chunks ("T C callers"), and numbers can be wrong outright
 * ("three billion" heard as "20 billion"). The script is what the voice was
 * given, so the captions show the script and only borrow Whisper's timing.
 * The two are aligned word by word (edit distance); script words Whisper
 * missed share the time between their aligned neighbours, and words Whisper
 * heard that the script lacks stretch the word before them.
 */
export function scriptTimedWords(
  script: string,
  heard: WordTimingT[],
  durationSec: number,
): WordTimingT[] {
  const tokens = script.split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  if (!heard.length) return evenlySpread(tokens, 0, durationSec);

  const key = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const a = tokens.map(key);
  const b = heard.map((w) => key(w.text));
  const n = a.length;
  const m = b.length;
  const cost: number[][] = Array.from({ length: n + 1 }, (_, i) =>
    Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      cost[i]![j] = Math.min(
        cost[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
        cost[i - 1]![j]! + 1,
        cost[i]![j - 1]! + 1,
      );
    }
  }

  // Walk back: each script word gets the heard word it lines up with, if any.
  const pair: Array<number | null> = new Array(n).fill(null);
  const extraAfter: number[] = new Array(n).fill(-1);
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && cost[i]![j] === cost[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1)) {
      pair[i - 1] = j - 1;
      i--;
      j--;
    } else if (i > 0 && cost[i]![j] === cost[i - 1]![j]! + 1) {
      i--;
    } else {
      if (i > 0) extraAfter[i - 1] = Math.max(extraAfter[i - 1]!, j - 1);
      j--;
    }
  }

  const out: WordTimingT[] = tokens.map((text, k) => {
    const h = pair[k];
    if (h == null) return { text, start: NaN, end: NaN };
    const end = extraAfter[k]! >= 0 ? heard[extraAfter[k]!]!.end : heard[h]!.end;
    return { text, start: heard[h]!.start, end: Math.max(end, heard[h]!.end) };
  });

  for (let k = 0; k < n;) {
    if (!Number.isNaN(out[k]!.start)) {
      k++;
      continue;
    }
    let e = k;
    while (e < n && Number.isNaN(out[e]!.start)) e++;
    const from = k > 0 ? out[k - 1]!.end : 0;
    const to = e < n ? out[e]!.start : Math.max(durationSec, from);
    evenlySpread(tokens.slice(k, e), from, to).forEach((w, x) => (out[k + x] = w));
    k = e;
  }
  return out;
}

function evenlySpread(tokens: string[], from: number, to: number): WordTimingT[] {
  const step = (to - from) / tokens.length;
  return tokens.map((text, i) => ({ text, start: from + i * step, end: from + (i + 1) * step }));
}

// "F T C" / "F-T-C" → "FTC", "A T Ms" → "ATMs": a spelled-out acronym is one
// caption word, so it is never split across chunks. Punctuation after a
// letter ends the run ("Plan A. Then").
function joinAcronyms(words: WordTimingT[]): WordTimingT[] {
  const out: WordTimingT[] = [];
  let i = 0;
  while (i < words.length) {
    const hyphenated = /^([^\p{L}\p{N}]*)((?:[A-Z]-)+[A-Z](?:s)?)([^\p{L}\p{N}]*)$/u.exec(
      words[i]!.text,
    );
    if (hyphenated) {
      out.push({
        ...words[i]!,
        text: hyphenated[1]! + hyphenated[2]!.replace(/-/g, '') + hyphenated[3]!,
      });
      i++;
      continue;
    }
    let j = i;
    while (j < words.length) {
      const s = split(words[j]!.text);
      const letter = /^[A-Z]$/.test(s.core);
      const plural = j > i && /^[A-Z]s$/.test(s.core);
      if (!(letter || plural) || (j > i && s.lead)) break;
      j++;
      if (s.trail || plural) break;
    }
    if (j - i < 2) {
      out.push(words[i]!);
      i++;
      continue;
    }
    const run = words.slice(i, j);
    const first = split(run[0]!.text);
    const last = split(run[run.length - 1]!.text);
    out.push({
      text: first.lead + run.map((w) => split(w.text).core).join('') + last.trail,
      start: run[0]!.start,
      end: run[run.length - 1]!.end,
    });
    i = j;
  }
  return out;
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
