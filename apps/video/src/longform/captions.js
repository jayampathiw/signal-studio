// Chunks a scene's full VO narration into short running-caption phrases, each
// carrying real per-word timestamps — the karaoke-style replacement for the
// old isolated single-word Tier 2 accent (which flashed on/off with no
// sentence context, e.g. a bare "26"). Captions are built from Whisper's
// word-level timestamps against the synthesized VO, but DISPLAYED using the
// original script wording (correct spelling/casing) whenever the word counts
// line up — Whisper is only the clock, not the transcript of record.

// Whisper's own word-level JSON (biased by the `--initial_prompt`) frequently
// echoes a lone "—" from the script back as its own timestamped "word" too —
// so the same punctuation-only entries need folding out of the ASR list, not
// just the script tokens, or the two lists silently drift out of count-parity
// for the wrong reason and positional pairing misaligns everything after it.
function foldAsrWords(words) {
  const out = [];
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

// Whisper occasionally drops/merges/splits a word relative to the script
// (mis-hearing, normalization). When the counts don't match 1:1 we can't pair
// positionally, so timestamps are distributed proportionally by character
// length across the whole spoken span instead — an approximation, but it
// keeps captions roughly in sync rather than failing outright.
function alignTokensToWords(tokens, words) {
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

/**
 * @param {string} voText — the scene's full narration, as authored in the shotlist
 * @param {Array<{word:string,start:number,end:number}>} words — Whisper word timestamps
 * @param {object} [opts]
 * @param {number} [opts.maxWords] — hard cap on words per caption chunk
 * @param {number} [opts.tailPad] — seconds to extend a chunk's end past its last word,
 *   so it doesn't vanish the instant speech stops; capped by the next chunk's start.
 * @returns {Array<{start:number, end:number, words:Array<{text:string,start:number,end:number}>}>}
 */
// A script line like "Their captain — the greatest" whitespace-splits into a
// standalone "—" token — not a spoken word, so pairing it 1:1 against a real
// ASR word would misalign the rest of the sentence, and displaying it as its
// own caption "word" would put a lone floating dash on screen. Fold any
// punctuation-only token into the end of the previous word instead (it still
// ends the string in a dash, so the clause-break chunking rule below still
// fires at the right place).
function tokenizeScript(voText) {
  const raw = voText.trim().split(/\s+/).filter(Boolean);
  const tokens = [];
  for (const t of raw) {
    if (tokens.length && /^[^a-zA-Z0-9]+$/.test(t)) {
      tokens[tokens.length - 1] += ` ${t}`;
    } else {
      tokens.push(t);
    }
  }
  return tokens;
}

export function chunkCaptions(voText, words, { maxWords = 8, tailPad = 0.3 } = {}) {
  if (!voText || !words?.length) return [];
  const tokens = tokenizeScript(voText);
  if (!tokens.length) return [];
  const paired = alignTokensToWords(tokens, foldAsrWords(words));

  const chunks = [];
  let cur = [];
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
