// Generates a .srt subtitle file for a finished long-form video by replaying
// the exact same per-scene duration math assemble-local.mjs used when it
// rendered the scenes (VO-stretch / --max-silent-tail tighten), so cue
// timestamps land on the actual concatenated timeline, not the shotlist's
// planned timecodes. Reads the same captions.json produced by
// generate-captions.mjs — no re-transcription, this only re-times it.
//
// Usage:
//   node apps/video/scripts/longform/generate-srt.mjs --dir content/longform/son-also-saves
//   node apps/video/scripts/longform/generate-srt.mjs --dir content/longform/one-match-short --max-silent-tail 2.5
//   node apps/video/scripts/longform/generate-srt.mjs --dir content/longform/silenced-goalkeeper --output content/longform/silenced-goalkeeper/output/silenced-goalkeeper.srt

import { parseArgs } from 'util';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseShotlistV2 } from '../../src/longform/parse-shotlist-v2.js';
import { probeDuration } from '../../src/longform/render.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../');
const STILL_EXTS = ['.jpeg', '.jpg', '.png'];

const { values } = parseArgs({
  options: {
    dir:              { type: 'string' },
    shotlist:         { type: 'string' },
    output:           { type: 'string' },
    'max-silent-tail': { type: 'string' },
  },
  strict: false,
});
if (!values.dir) { console.error('--dir <project-dir> required'); process.exit(2); }
const maxSilentTail = values['max-silent-tail'] != null ? Number(values['max-silent-tail']) : null;

const projectDir = resolve(REPO_ROOT, values.dir);
const shotlistPath = values.shotlist ? resolve(values.shotlist) : join(projectDir, 'shotlist-v2.md');
const stillsDir = join(projectDir, 'stills');
const voDir = join(projectDir, 'vo');
const captionsPath = join(projectDir, 'captions.json');

// Same per-project caption-suppression map as assemble-local.mjs — a scene
// with real VO/captions.json data can still render silently (no running
// captions) if its still already has the line baked in, or the beat is
// deliberately silent. Must match exactly, or the SRT would show lines that
// never appear on screen.
const NO_CAPTION_SCENES_BY_PROJECT = {
  'silenced-goalkeeper': new Set([51]),
  'fifth-match': new Set([22]),
  'channel-trailer': new Set([9, 11]),
};
const NO_CAPTION_SCENES = NO_CAPTION_SCENES_BY_PROJECT[projectDir.split('/').pop()] ?? new Set();

function pad2(n) { return String(n).padStart(2, '0'); }

function findStillFile(sceneN, cut) {
  for (const ext of STILL_EXTS) {
    const p = join(stillsDir, `S${pad2(sceneN)}-${cut}${ext}`);
    if (existsSync(p)) return p;
  }
  return null;
}
function findVoFile(sceneN) {
  const p = join(voDir, `S${pad2(sceneN)}.wav`);
  return existsSync(p) ? p : null;
}

function srtTimestamp(sec) {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = Math.floor(s % 60);
  const ms = Math.round((s - Math.floor(s)) * 1000);
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(ss)},${pad(ms, 3)}`;
}

function main() {
  if (!existsSync(shotlistPath)) throw new Error(`Shotlist not found: ${shotlistPath}`);
  const { scenes } = parseShotlistV2(shotlistPath);
  const sceneCaptions = existsSync(captionsPath) ? JSON.parse(readFileSync(captionsPath, 'utf-8')) : {};

  let cursor = 0; // absolute seconds in the final concatenated timeline
  const cues = [];

  for (const scene of scenes) {
    const n = pad2(scene.scene_n);
    const plannedDur = scene.duration_sec;
    let sceneDur;

    if (!scene.stills?.length) {
      // Text/title card — buildTextCard holds for exactly the planned duration, no VO stretch.
      sceneDur = plannedDur;
    } else {
      // Mirrors render.js's buildStillsScene exactly: stretch (VO overrunning
      // the planned duration) always wins first; --max-silent-tail only ever
      // tightens a scene that did NOT already need to stretch.
      const voPath = findVoFile(scene.scene_n);
      const voDur = voPath ? probeDuration(voPath) : 0;
      sceneDur = Math.max(plannedDur, voDur + 0.4);
      if (sceneDur === plannedDur && maxSilentTail != null && voDur > 0) {
        const capped = Math.min(plannedDur, voDur + maxSilentTail);
        if (capped < sceneDur) sceneDur = capped;
      }
    }

    if (!NO_CAPTION_SCENES.has(scene.scene_n)) {
      const chunks = sceneCaptions[`S${n}`];
      if (chunks?.length) {
        for (const c of chunks) {
          const text = c.words.map((w) => w.text).join(' ').trim();
          if (!text) continue;
          const start = cursor + c.at_sec;
          const end = start + c.duration_sec;
          cues.push({ start, end, text });
        }
      }
    }

    cursor += sceneDur;
  }

  const srt = cues.map((c, i) =>
    `${i + 1}\n${srtTimestamp(c.start)} --> ${srtTimestamp(c.end)}\n${c.text}\n`
  ).join('\n');

  const outPath = values.output
    ? resolve(REPO_ROOT, values.output)
    : join(projectDir, 'output', `${projectDir.split('/').pop()}.srt`);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, srt, 'utf-8');
  console.log(`✓ Wrote ${cues.length} cues, total timeline ${cursor.toFixed(2)}s → ${outPath}`);
}

main();
