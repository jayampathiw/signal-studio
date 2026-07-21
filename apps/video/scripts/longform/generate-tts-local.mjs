// Local (non-Supabase) VO generation — synthesises Kokoro TTS for every scene's
// vo_text in a shotlist-v2.md, writing WAVs to <dir>/vo/S{n}.wav. Mirrors
// generate-tts.mjs's per-scene loop, adapted to a parsed shotlist instead of
// content_clips rows and to local files instead of R2 uploads.
//
// Usage:
//   node apps/video/scripts/longform/generate-tts-local.mjs --dir content/longform/son-also-saves
//   node apps/video/scripts/longform/generate-tts-local.mjs --dir content/longform/son-also-saves --scenes 1-5

import { parseArgs } from 'util';
import { mkdirSync, existsSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { synthesise } from '@signal-studio/media/tts';
import { parseShotlistV2 } from '../../src/longform/parse-shotlist-v2.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../');

const { values } = parseArgs({
  options: {
    dir:      { type: 'string' },
    shotlist: { type: 'string' },
    scenes:   { type: 'string' },
    voice:    { type: 'string' },   // override Kokoro voice ID, e.g. am_michael for a male narrator
  },
  strict: false,
});

if (!values.dir) { console.error('--dir <project-dir> required'); process.exit(2); }
const projectDir = resolve(REPO_ROOT, values.dir);
const shotlistPath = values.shotlist ? resolve(values.shotlist) : join(projectDir, 'shotlist-v2.md');
const voDir = join(projectDir, 'vo');

function parseSceneRange(str) {
  if (!str) return null;
  const m = str.match(/^(\d+)(?:-(\d+))?$/);
  if (!m) return null;
  return { from: Number(m[1]), to: m[2] ? Number(m[2]) : Number(m[1]) };
}
const sceneRange = parseSceneRange(values.scenes);
const pad2 = (n) => String(n).padStart(2, '0');

async function main() {
  if (!existsSync(shotlistPath)) throw new Error(`Shotlist not found: ${shotlistPath}`);
  mkdirSync(voDir, { recursive: true });

  const { scenes: allScenes } = parseShotlistV2(shotlistPath);
  const scenes = (sceneRange
    ? allScenes.filter((s) => s.scene_n >= sceneRange.from && s.scene_n <= sceneRange.to)
    : allScenes
  ).filter((s) => s.vo_text);

  if (!scenes.length) { console.error('No scenes with vo_text in range'); return; }

  let done = 0, skipped = 0, errors = 0;
  for (const scene of scenes) {
    const n = pad2(scene.scene_n);
    const label = `S${n}`;
    const outPath = join(voDir, `S${n}.wav`);

    if (existsSync(outPath)) {
      console.log(`[skip] ${label} already has VO (${outPath})`);
      skipped++;
      continue;
    }

    try {
      await synthesise(scene.vo_text, outPath, { country: 'EN', voice: values.voice });
      console.log(`[done] ${label} → ${outPath}`);
      done++;
    } catch (err) {
      console.error(`[error] ${label}: ${err.message}`);
      errors++;
    }
  }

  console.log(`\nGenerated ${done}, skipped ${skipped}, errors ${errors}`);
}

main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
