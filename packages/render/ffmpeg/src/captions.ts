// P3.1 — moved from apps/video/src/longform/captions.js, retyped
// (behavior-preserving mechanical port). Chunks a scene's full VO
// narration into short running-caption phrases, each carrying real
// per-word timestamps — built from Whisper's word-level timestamps against
// the synthesized VO, but DISPLAYED using the original script wording
// whenever the word counts line up (Whisper is only the clock, not the
// transcript of record).

export type AsrWord = { word: string; start: number; end: number };
export type CaptionToken = { text: string; start: number; end: number };
export type CaptionChunk = { start: number; end: number; words: CaptionToken[] };

// Whisper's own word-level JSON frequently echoes a lone "—" from the
// script back as its own timestamped "word" too — fold punctuation-only
// entries out of the ASR list, or the two lists drift out of count-parity
// for the wrong reason and positional pairing misaligns everything after
// it.
function foldAsrWords(words: AsrWord[]): AsrWord[] {
  const out: AsrWord[] = [];
  for (const w of words) {
    const text = w.word.trim();
    if (out.length && /^[^a-zA-Z0-9]+$/.test(text)) {
      out[out.length - 1] = { ...out[out.length - 1], end: w.end };
    } else {
      out.push({ word: text, start: w.start, end: w.end });
    }
  }
  return out;
}

// Whisper occasionally drops/merges/splits a word relative to the script.
// When the counts don't match 1:1 we can't pair positionally, so
// timestamps are distributed proportionally by character length across the
// whole spoken span instead — an approximation, but keeps captions roughly
// in sync rather than failing outright.
function alignTokensToWords(tokens: string[], words: AsrWord[]): CaptionToken[] {
  if (tokens.length === words.length) {
    return tokens.map((text, i) => ({ text, start: words[i].start, end: words[i].end }));
  }
  const spanStart = words[0].start;
  const spanEnd = words[words.length - 1].end;
  const span = Math.max(spanEnd - spanStart, 0.01);
  const totalChars = tokens.reduce((a, t) => a + t.length, 0) || 1;
  let t = spanStart;
  return tokens.map((text) => {
    const dur = (text.length / totalChars) * span;
    const start = t;
    const end = t + dur;
    t = end;
    return { text, start, end };
  });
}

// A script line like "Their captain — the greatest" whitespace-splits into
// a standalone "—" token — fold any punctuation-only token into the end of
// the previous word instead (it still ends the string in a dash, so the
// clause-break chunking rule below still fires at the right place).
function tokenizeScript(voText: string): string[] {
  const raw = voText.trim().split(/\s+/).filter(Boolean);
  const tokens: string[] = [];
  for (const t of raw) {
    if (tokens.length && /^[^a-zA-Z0-9]+$/.test(t)) {
      tokens[tokens.length - 1] += ` ${t}`;
    } else {
      tokens.push(t);
    }
  }
  return tokens;
}

// Render-format caption overlay chunk, matching timeline.v1's
// KenBurnsOverlay (tier 2) shape.
export type RenderCaptionChunk = {
  atSec: number;
  durationSec: number;
  words: Array<{ text: string; offsetStartSec: number; offsetEndSec: number }>;
};

// Splits any caption chunk that would render wider than maxWidth at a FIXED
// fontsize into multiple sub-chunks instead — keeps one constant caption
// size everywhere; the trade is more (shorter) caption chunks rather than a
// size wobble.
export function splitOversizedCaptions(
  overlays: RenderCaptionChunk[],
  measureWidth: (text: string) => number,
  maxWidth: number,
): RenderCaptionChunk[] {
  const out: RenderCaptionChunk[] = [];
  for (const chunk of overlays) {
    const texts = chunk.words.map((w) => w.text);
    const joined = (i: number, j: number) => texts.slice(i, j).join(' ');
    if (measureWidth(joined(0, texts.length)) <= maxWidth) {
      out.push(chunk);
      continue;
    }
    let start = 0;
    while (start < chunk.words.length) {
      let end = start + 1;
      while (end < chunk.words.length && measureWidth(joined(start, end + 1)) <= maxWidth) end++;
      const sub = chunk.words.slice(start, end);
      const firstOffset = sub[0].offsetStartSec;
      out.push({
        ...chunk,
        atSec: Number((chunk.atSec + firstOffset).toFixed(3)),
        durationSec: Number((sub[sub.length - 1].offsetEndSec - firstOffset).toFixed(3)),
        words: sub.map((w) => ({
          text: w.text,
          offsetStartSec: Number((w.offsetStartSec - firstOffset).toFixed(3)),
          offsetEndSec: Number((w.offsetEndSec - firstOffset).toFixed(3)),
        })),
      });
      start = end;
    }
  }
  return out;
}

export function chunkCaptions(
  voText: string,
  words: AsrWord[],
  opts: { maxWords?: number; tailPad?: number } = {},
): CaptionChunk[] {
  const { maxWords = 8, tailPad = 0.3 } = opts;
  if (!voText || !words?.length) return [];
  const tokens = tokenizeScript(voText);
  if (!tokens.length) return [];
  const paired = alignTokensToWords(tokens, foldAsrWords(words));

  const chunks: CaptionChunk[] = [];
  let cur: CaptionToken[] = [];
  const flush = () => {
    if (!cur.length) return;
    chunks.push({ start: cur[0].start, end: cur[cur.length - 1].end, words: cur });
    cur = [];
  };
  for (const tok of paired) {
    cur.push(tok);
    const endsClause = /[,.!?;:—-]$/.test(tok.text);
    if (endsClause || cur.length >= maxWords) flush();
  }
  flush();

  for (let i = 0; i < chunks.length; i++) {
    const nextStart = i + 1 < chunks.length ? chunks[i + 1].start : Infinity;
    chunks[i].end = Math.min(chunks[i].end + tailPad, nextStart);
  }
  return chunks;
}
