// Local (non-Supabase) long-form assembler — stills + Ken Burns pipeline driven
// entirely by files under a project directory (shotlist-v2.md + stills/ + vo/),
// for videos that intentionally stay outside content_clips/content_stills.
//
// Reuses the same render.js functions as the DB-backed assemble-longform.mjs —
// only the data source (files vs. Supabase) differs.
//
// Usage:
//   node apps/video/scripts/longform/assemble-local.mjs --dir content/longform/son-also-saves
//   node apps/video/scripts/longform/assemble-local.mjs --dir content/longform/son-also-saves --scenes 1-5
//   node apps/video/scripts/longform/assemble-local.mjs --dir content/longform/son-also-saves --keep-tmp

import { execFile } from 'child_process';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { parseArgs } from 'util';
import { promisify } from 'util';

import { parseShotlistV2, tcToSec } from '../../src/longform/parse-shotlist-v2.js';
import { buildTextCard, buildStillsScene } from '../../src/longform/render.js';

const execAsync = promisify(execFile);
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../');
const STILL_EXTS = ['.jpeg', '.jpg', '.png'];

const { values } = parseArgs({
  options: {
    dir: { type: 'string' },
    shotlist: { type: 'string' }, // override default <dir>/shotlist-v2.md
    scenes: { type: 'string' }, // e.g. "1-5" for partial render
    output: { type: 'string' }, // override final output path
    'keep-tmp': { type: 'boolean', default: false },
    watermark: { type: 'string' }, // override watermark file under assets/logos/; 'none' to disable
    'max-silent-tail': { type: 'string' }, // cap seconds of silence held after VO ends (opt-in; unset = old Math.max-only behavior)
  },
  strict: false,
});
const maxSilentTail = values['max-silent-tail'] != null ? Number(values['max-silent-tail']) : null;

if (!values.dir) {
  console.error('--dir <project-dir> required, e.g. content/longform/son-also-saves');
  process.exit(2);
}
const projectDir = resolve(REPO_ROOT, values.dir);
const shotlistPath = values.shotlist
  ? resolve(values.shotlist)
  : join(projectDir, 'shotlist-v2.md');
const stillsDir = join(projectDir, 'stills');
const voDir = join(projectDir, 'vo');
const outputDir = join(projectDir, 'output');
const captionsPath = join(projectDir, 'captions.json');
const keepTmp = values['keep-tmp'];

// Default watermark matches the channel config for this project (Underdog
// Archive, see apps/video/src/config/channels.js's watermarkFile for
// football/documentary/EN) — this project is file-based/no channel_key, so
// it isn't looked up from there; hardcoded here instead. Same overlay recipe
// as assemble-longform.mjs: 80px wide icon, 40% opacity, bottom-right.
const watermarkFile =
  values.watermark === 'none' ? null : (values.watermark ?? 'underdog_archive_standalone_icon.png');
const watermarkPath = watermarkFile ? resolve(REPO_ROOT, 'assets/logos', watermarkFile) : null;

// Running-caption chunks from generate-captions.mjs (real Whisper word
// timestamps against the synthesized VO), keyed "S{n}" -> chunk[]. These
// replace the shotlist's hand-authored 🔤 Tier 2 lines entirely once
// generated — a scene with no captions.json entry yet falls back to the
// shotlist's own script-estimate Tier 2 lines so it still renders something.
const sceneCaptions = existsSync(captionsPath)
  ? JSON.parse(readFileSync(captionsPath, 'utf-8'))
  : {};

// generate-captions.mjs measures word timestamps against a per-scene VO file
// (t=0 at scene start), but buildStillsScene expects overlay.at_sec on the
// same absolute timeline as the scene's from_sec (it subtracts from_sec back
// out) — so add fromSec back in here to keep everything on one timeline.
// Per user request: only the running caption/subtitle track renders for now
// — no Tier 1 hero cards, no standalone Tier 2 reveals (e.g. "26"). Both
// were found to distract from the narration once captions covered the same
// ground with full sentence context. The shotlist's own tier1/tier2 lines
// are left untouched (still parsed) so either can be turned back on later
// by re-including `tier1`/`revealOverlays` in the returned array below.
// Per-project scene numbers where captions must be suppressed even though
// real VO/captions.json data exists for them:
//  - silenced-goalkeeper S51: the still already has full sentence text (and a
//    "Subscribe" button) baked into the image — running captions on top
//    would double-print the same text.
//  - fifth-match S22: the source shot list explicitly calls for the final
//    whistle to "land silently" (no captions on that beat), same silent-beat
//    convention as silenced-goalkeeper's S38.
//  - channel-trailer S9/S11: both brand cards already have their tagline text
//    baked into the still itself ("REAL MATCHES. REAL HISTORY." / "NEW VIDEOS
//    EVERY WEEK.") — running captions duplicated the same line on top.
// Keyed by project dir name (not a flat scene-number set) so numbers don't
// collide across projects.
const NO_CAPTION_SCENES_BY_PROJECT = {
  'silenced-goalkeeper': new Set([51]),
  'fifth-match': new Set([22]),
  'channel-trailer': new Set([9, 11]),
};
const NO_CAPTION_SCENES = NO_CAPTION_SCENES_BY_PROJECT[projectDir.split('/').pop()] ?? new Set();

function mergeCaptions(sceneN, fromSec, overlays) {
  if (NO_CAPTION_SCENES.has(sceneN)) return [];
  const n = pad2(sceneN);
  const chunks = sceneCaptions[`S${n}`];
  if (!chunks?.length) return [];

  const captionOverlays = chunks.map((c) => ({
    format: 'tiered',
    tier: 2,
    kind: 'caption',
    at_sec: fromSec + c.at_sec,
    duration_sec: c.duration_sec,
    // Offsets (not absolute times) — see generate-captions.mjs/motion.js for why.
    words: c.words.map((w) => ({
      text: w.text,
      offset_start: w.offset_start,
      offset_end: w.offset_end,
    })),
  }));

  return captionOverlays;
}

function parseSceneRange(str) {
  if (!str) return null;
  const m = str.match(/^(\d+)(?:-(\d+))?$/);
  if (!m) return null;
  const from = Number(m[1]);
  const to = m[2] ? Number(m[2]) : from;
  return { from, to };
}
const sceneRange = parseSceneRange(values.scenes);

function pad2(n) {
  return String(n).padStart(2, '0');
}

// Manual cut-split overrides, scene-relative seconds within the PLANNED
// (unstretched) scene duration, one entry per cut boundary (stills.length-1
// entries). render.js's default equal-split ignores where dialogue actually
// breaks; son-also-saves' S02 VO stretched the scene to 16.9s and the default
// 50/50 split landed cut A's boundary right at 8.45s — exactly where the
// caption "is standing eleven metres away" (8.44s-10.74s) starts, so it got
// included but displayed for ~10ms before the cut to B swallowed it. Pushing
// the boundary to 11s (of the 15s planned duration) keeps that whole line
// inside cut A. Keyed by project dir name (not global) — a bare `{2: [...]}`
// silently corrupted every other project's own scene 2 with whatever
// scene-relative second happened to equal *its* different scene 2 length,
// collapsing a cut to zero duration (found via two-shots-messi's S02).
const CUT_SPLIT_OVERRIDES_BY_PROJECT = {
  'son-also-saves': { 2: [11] },
};
const CUT_SPLIT_OVERRIDES = CUT_SPLIT_OVERRIDES_BY_PROJECT[basename(projectDir)] ?? {};
const ENABLE_AUTO_CUT_SPLIT = basename(projectDir) !== 'son-also-saves';

function findStillFile(sceneN, cut) {
  const base = `S${pad2(sceneN)}-${cut}`;
  for (const ext of STILL_EXTS) {
    const p = join(stillsDir, `${base}${ext}`);
    if (existsSync(p)) return p;
  }
  return null;
}

function findVoFile(sceneN) {
  const p = join(voDir, `S${pad2(sceneN)}.wav`);
  return existsSync(p) ? p : null;
}

// motion.js only supports two regrade presets today (warm_amber/cold_blue);
// map the shotlist's four grade labels onto the nearest one.
function mapGrade(grade) {
  if (grade === 'WARM' || grade === 'MOURNFUL') return 'warm_amber';
  if (grade === 'COLD' || grade === 'MONOCHROME') return 'cold_blue';
  return null;
}

async function main() {
  if (!existsSync(shotlistPath)) throw new Error(`Shotlist not found: ${shotlistPath}`);
  const { title, target_duration_sec, scenes: allScenes } = parseShotlistV2(shotlistPath);

  const scenes = sceneRange
    ? allScenes.filter((s) => s.scene_n >= sceneRange.from && s.scene_n <= sceneRange.to)
    : allScenes;
  if (!scenes.length) throw new Error('No scenes matched --scenes filter');

  const rangeLabel = sceneRange ? ` scenes ${sceneRange.from}-${sceneRange.to}` : '';
  console.log(
    `"${title}"${rangeLabel} — ${scenes.length} scenes (target ${target_duration_sec}s)\n`,
  );

  const workDir = join(tmpdir(), `longform-local-${Date.now()}`);
  mkdirSync(workDir, { recursive: true });
  console.log(`Working dir: ${workDir}\n`);

  // Real per-scene durations (post VO-stretch/tighten), keyed "S{n}" -> seconds.
  // The audio mixer (mix-audio-local.mjs) needs these, not the shotlist's
  // static planned duration_sec, to place SFX/bed segments at the right
  // offsets — a scene tightened from 13s down to 7s throws off every later
  // scene's absolute start time if the mixer assumes the planned duration.
  // Persisted (merged, not overwritten) so partial --scenes runs accumulate.
  const sceneDurationsPath = join(projectDir, 'scene-durations.json');
  const sceneDurations = existsSync(sceneDurationsPath)
    ? JSON.parse(readFileSync(sceneDurationsPath, 'utf-8'))
    : {};

  try {
    const scenePaths = [];

    for (const scene of scenes) {
      const n = pad2(scene.scene_n);
      const label = `S${n}`;
      const voPath = findVoFile(scene.scene_n);

      // A scene with zero stills is a true text/title card, regardless of the
      // "EDITOR GRAPHIC"/"EDITOR BUILD" kind flag the parser derives from the
      // header line — several scenes in this shotlist (S13, S17, S32) carry
      // that flag but DO have a real generated still to animate.
      if (!scene.stills?.length) {
        // No project-specific fallback here — a bare title-card scene with no
        // tier-1 overlay (e.g. a blank end-screen plate) should render blank,
        // not silently borrow another project's title text.
        const cardText = scene.overlays?.find((o) => o.tier === 1)?.text ?? '';
        // Title cards have no 🖼️ line in the shotlist (so parser gives them zero
        // stills), but some carry an optional background image by convention —
        // reuse the same S{n}-A file lookup; falls back to plain black if absent.
        const bgImagePath = findStillFile(scene.scene_n, 'A');
        process.stdout.write(
          `  ${label} [text_card${bgImagePath ? '+bg' : ''}] "${cardText.slice(0, 40)}" … `,
        );
        const out = join(workDir, `scene_${n}.mp4`);
        await buildTextCard(cardText, scene.duration_sec, out, bgImagePath);
        scenePaths.push(out);
        sceneDurations[`S${n}`] = scene.duration_sec; // text cards never stretch/tighten
        console.log('done');
        continue;
      }

      const splitPoints = CUT_SPLIT_OVERRIDES[scene.scene_n] ?? null;
      const stillRows = scene.stills.map((st, i) => {
        const motion = scene.still_motions?.find((m) => m.cut === st.cut)?.motion ?? 'push';
        const filePath = findStillFile(scene.scene_n, st.cut);
        const row = {
          cut: st.cut,
          motion,
          clip_url: filePath,
          regrade: mapGrade(scene.grade),
          transition: 'cut',
        };
        if (splitPoints) {
          row.start_sec = i === 0 ? 0 : splitPoints[i - 1];
          row.end_sec = i < splitPoints.length ? splitPoints[i] : scene.duration_sec;
        }
        return row;
      });

      const missing = stillRows.filter((s) => !s.clip_url);
      if (missing.length === stillRows.length) {
        console.warn(
          `  ${label} SKIPPED — no still image(s) found in ${stillsDir} (expected S${n}-${scene.stills.map((s) => s.cut).join('/')}.[jpeg|jpg|png])`,
        );
        continue;
      }
      if (missing.length) {
        console.warn(
          `  ${label} missing cut(s): ${missing.map((s) => s.cut).join(', ')} — rendering with the rest`,
        );
      }

      const fromSec = tcToSec(scene.from_tc);
      const clip = {
        scene_n: scene.scene_n,
        duration_sec: scene.duration_sec,
        overlays: mergeCaptions(scene.scene_n, fromSec, scene.overlays ?? []),
        from_sec: fromSec,
        // Enables render.js's auto cut-split (snaps equal-split boundaries to
        // real caption-chunk edges instead of a dumb time-based split).
        // Withheld for son-also-saves so its already-locked/delivered render
        // stays reproducible byte-for-byte if it's ever re-rendered.
        captionChunks: ENABLE_AUTO_CUT_SPLIT ? (sceneCaptions[`S${n}`] ?? null) : null,
      };

      process.stdout.write(`  ${label} [${stillRows.length} cut(s)] … `);
      const out = await buildStillsScene(
        stillRows.filter((s) => s.clip_url),
        clip,
        voPath,
        workDir,
        {
          noOverlays: false,
          maxSilentTail,
          onSceneDur: (d) => {
            sceneDurations[`S${n}`] = d;
          },
        },
      );
      scenePaths.push(out);
      console.log('done' + (voPath ? '' : ' (no VO — silent)'));
    }

    writeFileSync(sceneDurationsPath, JSON.stringify(sceneDurations, null, 2));

    if (!scenePaths.length) throw new Error('No scenes rendered');

    console.log(`\nConcatenating ${scenePaths.length} scene(s)…`);
    const listPath = join(workDir, '_concat.txt');
    const concatPath = join(workDir, 'concat.mp4');
    writeFileSync(listPath, scenePaths.map((p) => `file '${p}'`).join('\n'));
    await execAsync('ffmpeg', [
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      listPath,
      '-c',
      'copy',
      concatPath,
    ]);

    let finalPath = concatPath;
    if (watermarkPath && existsSync(watermarkPath)) {
      console.log('\nApplying watermark…');
      const wmPath = join(workDir, 'watermarked.mp4');
      await execAsync('ffmpeg', [
        '-y',
        '-i',
        finalPath,
        '-i',
        watermarkPath,
        '-filter_complex',
        '[1:v]scale=80:-1,format=rgba,colorchannelmixer=aa=0.4[wm];[0:v][wm]overlay=W-w-20:H-h-20:format=auto',
        '-c:v',
        'libx264',
        '-preset',
        'fast',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'copy',
        wmPath,
      ]);
      finalPath = wmPath;
      console.log('  Watermark applied');
    } else if (watermarkPath) {
      console.warn(`[warn] Watermark file not found: ${watermarkPath} — skipping`);
    }

    mkdirSync(outputDir, { recursive: true });
    const outPath = values.output
      ? resolve(values.output)
      : join(outputDir, sceneRange ? `scenes-${values.scenes}.mp4` : 'final.mp4');
    const { copyFileSync } = await import('fs');
    copyFileSync(finalPath, outPath);
    console.log(`\n✓ Rendered: ${outPath}`);
  } finally {
    if (keepTmp) {
      console.log(`\nTemp dir kept: ${workDir}`);
    } else {
      rmSync(workDir, { recursive: true, force: true });
    }
  }
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
