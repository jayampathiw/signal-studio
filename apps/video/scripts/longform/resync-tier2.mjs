// Re-times Tier 2 word-sync accents against real, spoken-word timestamps —
// the script's `at H:MM` values are estimates only (per shotlist Section D).
// Requires VO already synthesised (generate-tts-local.mjs) for each scene.
//
// Writes <dir>/overlay-resync.json, keyed "S{n}-2-{index}" -> {at_sec, duration_sec, exact},
// which assemble-local.mjs applies as an override on top of the shotlist's estimate.
//
// Usage:
//   node apps/video/scripts/longform/resync-tier2.mjs --dir content/longform/son-also-saves
//   node apps/video/scripts/longform/resync-tier2.mjs --dir content/longform/son-also-saves --scenes 1-5

import { parseArgs } from 'util';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { generateWordTimestamps } from '@signal-studio/media/subtitles';
import { parseShotlistV2 } from '../../src/longform/parse-shotlist-v2.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../');

const { values } = parseArgs({
  options: {
    dir:      { type: 'string' },
    shotlist: { type: 'string' },
    scenes:   { type: 'string' },
  },
  strict: false,
});

if (!values.dir) { console.error('--dir <project-dir> required'); process.exit(2); }
const projectDir = resolve(REPO_ROOT, values.dir);
const shotlistPath = values.shotlist ? resolve(values.shotlist) : join(projectDir, 'shotlist-v2.md');
const voDir = join(projectDir, 'vo');
const resyncPath = join(projectDir, 'overlay-resync.json');

function parseSceneRange(str) {
  if (!str) return null;
  const m = str.match(/^(\d+)(?:-(\d+))?$/);
  if (!m) return null;
  return { from: Number(m[1]), to: m[2] ? Number(m[2]) : Number(m[1]) };
}
const sceneRange = parseSceneRange(values.scenes);
const pad2 = (n) => String(n).padStart(2, '0');

// Tier 2 accents are sometimes numerals/scores ("26", "2-1") while the VO speaks
// them as words ("twenty-six", "two-one") per the shotlist's TTS-normalization
// rule — convert numeral tokens to word form before matching against VO words.
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function numberToWords(n) {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : '');
  if (n < 1000) {
    const h = Math.floor(n / 100);
    const rest = n % 100;
    return `${ONES[h]} hundred${rest ? ` ${numberToWords(rest)}` : ''}`;
  }
  return String(n);
}

function normWord(w) {
  return w.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function titleCase(text) {
  return text.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

// Whisper's own transcription often normalizes spoken numbers back to digit
// form ("twenty-six" spoken → "26" transcribed) rather than preserving the
// word form — so build both a word-form and a raw-digit token variant and try
// each against the VO transcript; whichever matches wins.
function targetTokenVariants(text) {
  const words = text.split(/[\s·:]+/).filter(Boolean);
  const wordForm = [];
  const digitForm = [];
  for (const w of words) {
    for (const piece of w.split('-')) {
      if (!piece) continue;
      if (/^\d+$/.test(piece)) {
        wordForm.push(...numberToWords(Number(piece)).split(/[\s-]+/));
        digitForm.push(piece);
      } else {
        wordForm.push(piece);
        digitForm.push(piece);
      }
    }
  }
  const norm = (arr) => arr.map(normWord).filter(Boolean);
  const a = norm(wordForm);
  const b = norm(digitForm);
  return a.join(' ') === b.join(' ') ? [a] : [a, b];
}

function findMatchOne(words, tokens) {
  const normed = words.map((w) => normWord(w.word));
  // Prefer an exact contiguous match of every token — gives both onset and offset.
  for (let i = 0; i <= normed.length - tokens.length; i++) {
    let ok = true;
    for (let j = 0; j < tokens.length; j++) {
      if (normed[i + j] !== tokens[j]) { ok = false; break; }
    }
    if (ok) return { start: words[i].start, end: words[i + tokens.length - 1].end, exact: true };
  }
  return null;
}

function findMatch(words, tokenVariants) {
  for (const tokens of tokenVariants) {
    const exact = findMatchOne(words, tokens);
    if (exact) return exact;
  }
  // Fallback: anchor on just the first token of the first variant — onset only.
  const normed = words.map((w) => normWord(w.word));
  const idx = normed.findIndex((w) => w === tokenVariants[0][0]);
  if (idx !== -1) return { start: words[idx].start, end: words[idx].end, exact: false };
  return null;
}

async function main() {
  if (!existsSync(shotlistPath)) throw new Error(`Shotlist not found: ${shotlistPath}`);
  const { scenes: allScenes } = parseShotlistV2(shotlistPath);
  const scenes = sceneRange
    ? allScenes.filter((s) => s.scene_n >= sceneRange.from && s.scene_n <= sceneRange.to)
    : allScenes;

  const resync = existsSync(resyncPath) ? JSON.parse(readFileSync(resyncPath, 'utf-8')) : {};
  const rows = [];

  for (const scene of scenes) {
    const n = pad2(scene.scene_n);
    const tier2 = (scene.overlays ?? []).filter((o) => o.tier === 2);
    if (!tier2.length) continue;

    const voPath = join(voDir, `S${n}.wav`);
    if (!existsSync(voPath)) {
      for (const ov of tier2) rows.push({ scene: n, text: ov.text, status: 'no-vo', script_at: ov.at_sec });
      continue;
    }

    // Bias Whisper toward this scene's own Tier-2 text (often proper nouns —
    // "Mostafa Shobeir", "Ahmed Shobeir" — that the tiny model otherwise
    // mis-transcribes badly, e.g. "most of a sober"). Whisper's prompt-biasing
    // only takes effect in natural title case — an all-caps prompt (how the
    // shotlist stores card text) does NOT bias the decoder (verified
    // empirically: "AHMED SHOBEIR" as prompt still gave "Ack Med Shobr";
    // "Ahmed Shobeir" gave the correct transcription).
    const initialPrompt = tier2.map((ov) => titleCase(ov.text)).join(', ');
    const words = await generateWordTimestamps(voPath, join(voDir, `S${n}.words.json`), initialPrompt);

    tier2.forEach((ov, idx) => {
      const tokens = targetTokenVariants(ov.text);
      const match = findMatch(words, tokens);
      const key = `S${n}-2-${idx}`;
      if (!match) {
        rows.push({ scene: n, text: ov.text, status: 'no-match', script_at: ov.at_sec });
        return;
      }
      const at_sec = Number(match.start.toFixed(3));
      const duration_sec = match.exact
        ? Number(Math.max(match.end - match.start + 0.3, 0.5).toFixed(3))
        : (ov.duration_sec ?? 1);
      resync[key] = { at_sec, duration_sec, exact: match.exact };
      rows.push({
        scene: n, text: ov.text, status: match.exact ? 'matched' : 'anchor-only',
        script_at: ov.at_sec, resync_at: at_sec,
      });
    });
  }

  writeFileSync(resyncPath, JSON.stringify(resync, null, 2));

  console.log('scene  text                            status       script_at  resync_at');
  for (const r of rows) {
    console.log(
      `S${r.scene}  ${r.text.padEnd(30).slice(0, 30)}  ${r.status.padEnd(11)}  ${String(r.script_at ?? '-').padEnd(9)}  ${r.resync_at ?? '-'}`,
    );
  }
  const matched = rows.filter((r) => r.status === 'matched').length;
  console.log(`\n${matched}/${rows.length} Tier 2 accents matched exactly. Wrote ${resyncPath}`);
}

main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
