// Generates running-caption chunks (the karaoke-style Tier 2 replacement) from
// each scene's full VO narration + real Whisper word timestamps — replaces
// resync-tier2.mjs's isolated single-word matching entirely.
//
// Writes <dir>/captions.json, keyed "S{n}" -> array of
// {at_sec, duration_sec, words:[{text,start,end}]} (all scene-relative,
// t=0 at scene start) — consumed by assemble-local.mjs's mergeCaptions().
//
// Usage:
//   node apps/video/scripts/longform/generate-captions.mjs --dir content/longform/son-also-saves
//   node apps/video/scripts/longform/generate-captions.mjs --dir content/longform/son-also-saves --scenes 1-12

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseArgs } from 'util';

import { generateWordTimestamps } from '@signal-studio/media/subtitles';

import { chunkCaptions } from '../../src/longform/captions.js';
import { parseShotlistV2 } from '../../src/longform/parse-shotlist-v2.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../');

const { values } = parseArgs({
  options: {
    dir: { type: 'string' },
    shotlist: { type: 'string' },
    scenes: { type: 'string' },
  },
  strict: false,
});

if (!values.dir) {
  console.error('--dir <project-dir> required');
  process.exit(2);
}
const projectDir = resolve(REPO_ROOT, values.dir);
const shotlistPath = values.shotlist
  ? resolve(values.shotlist)
  : join(projectDir, 'shotlist-v2.md');
const voDir = join(projectDir, 'vo');
const captionsPath = join(projectDir, 'captions.json');

function parseSceneRange(str) {
  if (!str) return null;
  const m = str.match(/^(\d+)(?:-(\d+))?$/);
  if (!m) return null;
  return { from: Number(m[1]), to: m[2] ? Number(m[2]) : Number(m[1]) };
}
const sceneRange = parseSceneRange(values.scenes);
const pad2 = (n) => String(n).padStart(2, '0');

// Whisper's prompt-biasing only takes effect in natural title case, not
// all-caps or lowercase (verified empirically while building resync-tier2.mjs).
function titleCase(text) {
  return text.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

async function main() {
  if (!existsSync(shotlistPath)) throw new Error(`Shotlist not found: ${shotlistPath}`);
  const { scenes: allScenes } = parseShotlistV2(shotlistPath);
  const scenes = sceneRange
    ? allScenes.filter((s) => s.scene_n >= sceneRange.from && s.scene_n <= sceneRange.to)
    : allScenes;

  const captions = existsSync(captionsPath) ? JSON.parse(readFileSync(captionsPath, 'utf-8')) : {};

  for (const scene of scenes) {
    const n = pad2(scene.scene_n);
    if (!scene.vo_text) {
      console.log(`S${n}  no VO text — skipped`);
      continue;
    }

    const voPath = join(voDir, `S${n}.wav`);
    if (!existsSync(voPath)) {
      console.log(`S${n}  no VO audio — skipped`);
      continue;
    }

    // Bias on the FULL scene narration now (not just a short target phrase) —
    // captions need every word transcribed accurately, not just the ones a
    // single isolated Tier-2 accent used to target.
    const words = await generateWordTimestamps(
      voPath,
      join(voDir, `S${n}.words.json`),
      titleCase(scene.vo_text),
    );
    const chunks = chunkCaptions(scene.vo_text, words);

    captions[`S${n}`] = chunks.map((c) => ({
      at_sec: Number(c.start.toFixed(3)),
      duration_sec: Number((c.end - c.start).toFixed(3)),
      // Offsets from the chunk's own at_sec, not absolute timestamps — the
      // renderer re-anchors them to whatever at_sec becomes after any
      // upstream cut/scene timeline remapping (see motion.js's
      // buildCaptionAccent for why an absolute timestamp would break).
      words: c.words.map((w) => ({
        text: w.text,
        offset_start: Number((w.start - c.start).toFixed(3)),
        offset_end: Number((w.end - c.start).toFixed(3)),
      })),
    }));
    console.log(`S${n}  ${chunks.length} caption chunk(s)`);
  }

  writeFileSync(captionsPath, JSON.stringify(captions, null, 2));
  console.log(`\nWrote ${captionsPath}`);
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
