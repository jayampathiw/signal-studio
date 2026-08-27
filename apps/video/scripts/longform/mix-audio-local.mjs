// Layers the audio-kit music bed + SFX onto a file-based (non-Supabase)
// long-form render produced by assemble-local.mjs. That assembler only does
// VO + Ken Burns + text overlays (no music layer) — this is the missing F5
// step for the local/file-based pipeline, reusing the same buildAudioMix()
// primitive the DB-backed assemble-longform.mjs uses.
//
// Usage:
//   node apps/video/scripts/longform/mix-audio-local.mjs --dir content/longform/two-shots-messi
//   node apps/video/scripts/longform/mix-audio-local.mjs --dir content/longform/two-shots-messi --input output/final.mp4 --output output/final-mixed.mp4

import { parseArgs } from 'util';
import { existsSync, mkdirSync, rmSync, readFileSync, copyFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import { parseShotlistV2 } from '../../src/longform/parse-shotlist-v2.js';
import { mapAllCues } from '../../src/longform/map-audio-cues.js';
import { buildAudioMix } from '../../src/longform/audio-mix.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../');

const { values } = parseArgs({
  options: {
    dir:    { type: 'string' },
    input:  { type: 'string' },  // relative to <dir>, defaults to output/final.mp4
    output: { type: 'string' },  // relative to <dir>, defaults to output/final-mixed.mp4
    'audio-plan': { type: 'string' }, // override path, defaults to <dir>/audio-plan.json
    'keep-tmp': { type: 'boolean', default: false },
  },
  strict: false,
});

if (!values.dir) { console.error('--dir <project-dir> required'); process.exit(2); }
const projectDir = resolve(REPO_ROOT, values.dir);
const inputPath = resolve(projectDir, values.input ?? 'output/final.mp4');
const outputPath = resolve(projectDir, values.output ?? 'output/final-mixed.mp4');
const audioPlanPath = values['audio-plan'] ? resolve(values['audio-plan']) : join(projectDir, 'audio-plan.json');
const shotlistPath = join(projectDir, 'shotlist-v2.md');

async function main() {
  if (!existsSync(inputPath)) throw new Error(`Input video not found: ${inputPath}`);
  if (!existsSync(audioPlanPath)) throw new Error(`audio-plan.json not found: ${audioPlanPath}`);

  const audioPlan = JSON.parse(readFileSync(audioPlanPath, 'utf-8'));
  const { scenes } = parseShotlistV2(shotlistPath);
  const unmatched = mapAllCues(scenes);
  if (unmatched.length) {
    console.warn(`[warn] ${unmatched.length} audio cue(s) unmatched (no SFX, bed continues):`,
      unmatched.map((u) => `S${u.scene_n}`).join(', '));
  }

  // Real per-scene durations (post VO-stretch/tighten), written by
  // assemble-local.mjs — SFX/segment offsets are cumulative sums of these,
  // not the shotlist's static planned duration_sec, or every scene after the
  // first tightened one lands its cues at the wrong absolute time.
  const sceneDurationsPath = join(projectDir, 'scene-durations.json');
  const realDurations = existsSync(sceneDurationsPath)
    ? JSON.parse(readFileSync(sceneDurationsPath, 'utf-8'))
    : {};

  const clips = scenes.map((s) => {
    const n = String(s.scene_n).padStart(2, '0');
    return {
      scene_n: s.scene_n,
      duration_sec: realDurations[`S${n}`] ?? s.duration_sec,
      sfx: Array.isArray(s.sfx) ? s.sfx : [],
    };
  });

  const workDir = join(tmpdir(), `audio-mix-local-${Date.now()}`);
  mkdirSync(workDir, { recursive: true });

  try {
    console.log(`Mixing audio for ${clips.length} scenes (${audioPlan.segments.length} bed segments)…`);
    const { loudnormStats } = await buildAudioMix({
      concatPath: inputPath,
      clips,
      audioPlan: audioPlan.segments,
      outputPath,
      workDir,
    });
    console.log(`  Loudnorm measured: I=${Number(loudnormStats.input_i).toFixed(1)} → -14.0 LUFS, TP=${Number(loudnormStats.input_tp).toFixed(1)} → -1.0 dBTP`);
    console.log(`\n✓ Mixed: ${outputPath}`);
  } finally {
    if (values['keep-tmp']) console.log(`Temp dir kept: ${workDir}`);
    else rmSync(workDir, { recursive: true, force: true });
  }
}

main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
