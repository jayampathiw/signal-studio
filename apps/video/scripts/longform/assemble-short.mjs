// Shorts (9:16) assembler — cuts a vertical clip from an existing long-form
// project's already-rendered assets (stills + VO + captions.json), reusing
// the same render.js scene builders as assemble-local.mjs. No new footage,
// no new TTS — a Short is a re-cut of scenes that already exist.
//
// Deliberately NOT a refactor of assemble-local.mjs's scene loop: that script
// renders the 5 shipped long-form videos and its output is locked, so this
// duplicates the small amount of file-finding/caption-merging glue rather
// than risk touching it. The actual render engine (buildStillsScene /
// buildMotionFilter) IS shared — see docs/shorts-916-implementation-plan.md.
//
// Usage:
//   node apps/video/scripts/longform/assemble-short.mjs \
//     --config content/shorts/silenced/silenced-s1-tah-miss-EN.json
//
// Config shape (lives next to the short's own src/ output dir):
//   {
//     "source": "content/longform/silenced-goalkeeper",
//     "scenes": [14, 15, 16],
//     "hook": "Germany hadn't lost a World Cup shootout in 50 years... until this.",
//     "hook_amber": "until this",
//     "crop": { "15": 0.35 },
//     "outro": "The full story is on the channel.",
//     "music": "tension",
//     "output": "silenced-s1-tah-miss-EN.mp4"
//   }
// Optional fields:
//   "outro"             — closing text card after the last scene (cliffhanger
//                          close). String, or { "text": "...", "duration_sec": 2 }.
//   "music"              — audio-kit bed key (e.g. "tension"), mixed under VO.
//                          "music_gain_db" overrides the default bed level.
//   "still_override"     — { "45-A": "path/to/vertical-only-asset.jpg" } — use
//                          a specific image for one scene+cut instead of the
//                          source project's own stills/ (for Shorts-only
//                          vertical exceptions that never touch the 16:9 asset).
//   "mute"                — [1, 7] — render these scenes with no VO at all
//                          (visual-only beats); use with "duration_override".
//   "vo_override"         — { "20": "path/to/rewritten-line.wav" } — use a
//                          specific WAV instead of the source project's own
//                          VO for one scene (e.g. a line re-recorded to drop
//                          calendar-relative language for a Short). Running
//                          captions are auto-skipped for any such scene
//                          (old timestamps don't match new audio/words).
//   "no_captions"         — [20] — explicitly skip running captions for a
//                          scene even without vo_override.
//   "duration_override"  — { "1": 4 } — force a scene's duration in seconds,
//                          overriding the source shotlist's planned length
//                          (mainly for muted/visual-only scenes, which
//                          otherwise default to their full long-form length).

import { execFile } from 'child_process';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, copyFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { parseArgs } from 'util';
import { promisify } from 'util';

import { buildSimpleMusicBed } from '../../src/longform/audio-mix.js';
import { splitOversizedCaptions } from '../../src/longform/captions.js';
import { BEBAS_FONT } from '../../src/longform/fonts.js';
import { FPS, TEXT_GEOMETRY } from '../../src/longform/motion.js';
import { parseShotlistV2, tcToSec } from '../../src/longform/parse-shotlist-v2.js';
import { buildStillsScene, buildTextCard, probeDuration } from '../../src/longform/render.js';
import { measureTextWidth } from '../../src/longform/text-metrics.js';

const execAsync = promisify(execFile);
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../');
const STILL_EXTS = ['.jpeg', '.jpg', '.png'];

// Shorts render portrait — the whole point of this script. Landscape stills
// get center-cropped (or per-scene offset-cropped via config.crop) to fill it.
const SHORT_FORMAT = { width: 1080, height: 1920, fps: FPS };
const MAX_RECOMMENDED_SEC = 60;

// Long-form scenes are directed with deliberate silent holds after VO ends
// (a scripted pacing choice — see render.js's buildStillsScene) so scene N+1
// doesn't cut in until its planned duration is up, even once its narration
// has finished. That reads as an intentional beat in a 9-minute documentary;
// in a 30-second Short it just reads as dead air between cuts. Shorts always
// cut the instant VO ends (plus a small buffer so the last word isn't
// clipped) — this only applies here, assemble-local.mjs's long-form path is
// untouched (its own maxSilentTail stays opt-in/null, old behavior).
const SHORT_MAX_SILENT_TAIL = 0.3;
const DEFAULT_OUTRO_DUR_SEC = 2;

// Must match motion.js's TEXT_GEOMETRY.portrait.heroFontsize — hook lines
// render through the same hero-card drawtext primitive as the shotlist's
// own Tier 1 beats, just pre-wrapped into multiple lines here since hook
// sentences (~50-70 chars) are far longer than a Tier 1 beat ("GOAL
// DISALLOWED") and don't fit on one line at a readable size in a 1080px
// frame — buildHeroCard has no multi-line support of its own.
const HOOK_FONTSIZE = 72;
const HOOK_LINE_HEIGHT = Math.round(HOOK_FONTSIZE * 1.2);
const HOOK_Y_START = Math.round(SHORT_FORMAT.height * 0.07);
const HOOK_MAX_WIDTH = SHORT_FORMAT.width * 0.88;

// Greedy word-wrap using real glyph advance widths (not a char-count guess) —
// reuses the same fontkit measurement buildHeroCard itself relies on to lay
// out contiguous colored segments, so line breaks land exactly where the
// rendered text will actually wrap.
function wrapHookText(text, fontsize, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let current = [];
  for (const word of words) {
    const trial = [...current, word].join(' ');
    if (measureTextWidth(BEBAS_FONT, fontsize, trial) > maxWidth && current.length) {
      lines.push(current.join(' '));
      current = [word];
    } else {
      current.push(word);
    }
  }
  if (current.length) lines.push(current.join(' '));
  return lines;
}

// Builds one hero-card overlay per wrapped line, all sharing the same
// at_sec/duration_sec window. amber_word only lights up on whichever line
// fully contains it — if a config's amber phrase straddles a wrap boundary,
// it silently renders as plain cream text on both lines instead of crashing.
function buildHookOverlays(hookText, amberWord, atSec, durationSec) {
  const lines = wrapHookText(hookText, HOOK_FONTSIZE, HOOK_MAX_WIDTH);
  return lines.map((line, i) => ({
    format: 'tiered',
    text: line,
    amber_word: amberWord && line.includes(amberWord) ? amberWord : null,
    at_sec: atSec,
    duration_sec: durationSec,
    zone: 'upper center',
    y: String(HOOK_Y_START + i * HOOK_LINE_HEIGHT),
    // Wave 1 shot lists: "Hook text lands in the first 1 second — no fade-ins."
    fade_in: 0,
  }));
}

// Same convention as assemble-local.mjs: scenes whose still already has the
// caption text baked in, so a running-caption overlay would double-print it.
const NO_CAPTION_SCENES_BY_PROJECT = {
  'silenced-goalkeeper': new Set([51]),
  'fifth-match': new Set([22]),
  'channel-trailer': new Set([9, 11]),
};

const { values } = parseArgs({
  options: {
    config: { type: 'string' },
    output: { type: 'string' }, // override output path (default: <config dir>/src/<config.output>)
    'keep-tmp': { type: 'boolean', default: false },
    watermark: { type: 'string' }, // override watermark file under assets/logos/; 'none' to disable
  },
  strict: false,
});

if (!values.config) {
  console.error(
    '--config <short-config.json> required, e.g. content/shorts/silenced/silenced-s1-tah-miss-EN.json',
  );
  process.exit(2);
}
const configPath = resolve(REPO_ROOT, values.config);
if (!existsSync(configPath)) throw new Error(`Short config not found: ${configPath}`);
const config = JSON.parse(readFileSync(configPath, 'utf-8'));
for (const field of ['source', 'scenes', 'output']) {
  if (!config[field]) throw new Error(`Short config missing required field: ${field}`);
}

const sourceDir = resolve(REPO_ROOT, config.source);
const sourceSlug = basename(sourceDir);
const shotlistPath = join(sourceDir, 'shotlist-v2.md');
const stillsDir = join(sourceDir, 'stills');
const voDir = join(sourceDir, 'vo');
const captionsPath = join(sourceDir, 'captions.json');
const keepTmp = values['keep-tmp'];

const watermarkFile =
  values.watermark === 'none' ? null : (values.watermark ?? 'underdog_archive_standalone_icon.png');
const watermarkPath = watermarkFile ? resolve(REPO_ROOT, 'assets/logos', watermarkFile) : null;

const sceneCaptions = existsSync(captionsPath)
  ? JSON.parse(readFileSync(captionsPath, 'utf-8'))
  : {};
const NO_CAPTION_SCENES = NO_CAPTION_SCENES_BY_PROJECT[sourceSlug] ?? new Set();

function pad2(n) {
  return String(n).padStart(2, '0');
}

function mergeCaptions(sceneN, fromSec) {
  if (NO_CAPTION_SCENES.has(sceneN)) return [];
  const chunks = sceneCaptions[`S${pad2(sceneN)}`];
  if (!chunks?.length) return [];
  const overlays = chunks.map((c) => ({
    format: 'tiered',
    tier: 2,
    kind: 'caption',
    at_sec: fromSec + c.at_sec,
    duration_sec: c.duration_sec,
    words: c.words.map((w) => ({
      text: w.text,
      offset_start: w.offset_start,
      offset_end: w.offset_end,
    })),
  }));
  // These chunks were sized for the source project's LANDSCAPE render —
  // split (never shrink) any that overflow the narrower portrait frame at
  // the fixed Shorts caption size, so size stays constant chunk-to-chunk.
  const maxCaptionWidth = SHORT_FORMAT.width * 0.92;
  return splitOversizedCaptions(
    overlays,
    (text) => measureTextWidth(BEBAS_FONT, TEXT_GEOMETRY.portrait.captionFontsize, text),
    maxCaptionWidth,
  );
}

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
  if (!existsSync(shotlistPath)) throw new Error(`Source shotlist not found: ${shotlistPath}`);
  const { scenes: allScenes } = parseShotlistV2(shotlistPath);

  // Preserve config.scenes' own order (not sorted) — lets a short reorder
  // beats relative to the source project's own chronology if needed.
  const scenes = config.scenes.map((n) => {
    const scene = allScenes.find((s) => s.scene_n === n);
    if (!scene) throw new Error(`Scene S${pad2(n)} not found in ${shotlistPath}`);
    if (!scene.stills?.length)
      throw new Error(
        `Scene S${pad2(n)} has no stills — text/title cards aren't supported as Short source scenes`,
      );
    return scene;
  });

  console.log(
    `"${config.output}" ← ${sourceSlug} scenes ${config.scenes.join(',')} (${SHORT_FORMAT.width}x${SHORT_FORMAT.height})\n`,
  );

  const workDir = join(tmpdir(), `short-${Date.now()}`);
  mkdirSync(workDir, { recursive: true });
  console.log(`Working dir: ${workDir}\n`);

  try {
    const scenePaths = [];

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const n = pad2(scene.scene_n);
      const label = `S${n}`;
      // mute takes priority over vo_override — "no VO at all" for this scene
      // is an intentional visual-only beat (e.g. a cold-open tease), not
      // something a vo_override should be able to override back on.
      const isMuted = config.mute?.includes(scene.scene_n);
      const voOverride = config.vo_override?.[String(scene.scene_n)];
      const voPath = isMuted
        ? null
        : voOverride
          ? resolve(REPO_ROOT, voOverride)
          : findVoFile(scene.scene_n);
      const cropX = config.crop?.[String(scene.scene_n)] ?? 0.5;

      const stillRows = scene.stills.map((st) => {
        const motion = scene.still_motions?.find((m) => m.cut === st.cut)?.motion ?? 'push';
        // Shorts-only vertical exception assets (e.g. a 3-figure lineage
        // shot that has no workable 9:16 crop of the 16:9 original) — kept
        // out of the source project's own stills/ dir since they're only
        // valid for this Short, not the long-form video's 16:9 render.
        const stillOverride = config.still_override?.[`${scene.scene_n}-${st.cut}`];
        return {
          cut: st.cut,
          motion,
          clip_url: stillOverride
            ? resolve(REPO_ROOT, stillOverride)
            : findStillFile(scene.scene_n, st.cut),
          regrade: mapGrade(scene.grade),
          transition: 'cut',
          crop_x: cropX,
        };
      });

      const missing = stillRows.filter((s) => !s.clip_url);
      if (missing.length === stillRows.length) {
        throw new Error(
          `${label}: no still image(s) found in ${stillsDir} (expected S${n}-${scene.stills.map((s) => s.cut).join('/')}.[jpeg|jpg|png])`,
        );
      }
      if (missing.length) {
        console.warn(
          `  ${label} missing cut(s): ${missing.map((s) => s.cut).join(', ')} — rendering with the rest`,
        );
      }

      const fromSec = tcToSec(scene.from_tc);
      // captions.json's word timestamps are aligned to the source project's
      // ORIGINAL VO — a vo_override changes the audio (and often the words),
      // so the old timestamps would show mismatched running captions. Skip
      // merging them for any scene using vo_override unless explicitly
      // re-included via config.no_captions being false for it (it never is
      // today — no re-alignment tooling exists yet, see Wave 1 shot lists'
      // own re-sync note on this exact case).
      const skipCaptions =
        config.no_captions?.includes(scene.scene_n) ||
        Boolean(config.vo_override?.[String(scene.scene_n)]);
      let overlays = skipCaptions ? [] : mergeCaptions(scene.scene_n, fromSec);

      // Hook line renders as a Tier-1 hero card over the opening ~3s of the
      // FIRST scene only — this is the Short's whole premise, per
      // docs/shorts-916-implementation-plan.md D2. Placed upper-center so it
      // never collides with the running caption band (which sits lower in
      // portrait — see motion.js's TEXT_GEOMETRY.portrait.captionY).
      // at_sec must be on the same absolute original-video timeline captions
      // use (buildStillsScene subtracts clip.from_sec back out) — fromSec,
      // not 0, is "the start of this scene" in that timeline.
      if (i === 0 && config.hook) {
        overlays = [...buildHookOverlays(config.hook, config.hook_amber, fromSec, 3), ...overlays];
      }

      // duration_override lets a muted/visual-only scene use a short
      // deliberate hold instead of its full long-form planned duration —
      // buildStillsScene's own tightening logic only shortens toward VO
      // length, so a VO-less scene with no override would otherwise run its
      // full original scene length (e.g. 12s for a "trim to ~4s" cold-open).
      const durationOverride = config.duration_override?.[String(scene.scene_n)];
      const clip = {
        scene_n: scene.scene_n,
        duration_sec: durationOverride ?? scene.duration_sec,
        overlays,
        from_sec: fromSec,
      };

      process.stdout.write(`  ${label} [${stillRows.length} cut(s), crop_x=${cropX}] … `);
      const out = await buildStillsScene(
        stillRows.filter((s) => s.clip_url),
        clip,
        voPath,
        workDir,
        { noOverlays: false, format: SHORT_FORMAT, maxSilentTail: SHORT_MAX_SILENT_TAIL },
      );
      scenePaths.push(out);
      console.log('done' + (voPath ? '' : ' (no VO — silent)'));
    }

    // Cliffhanger outro — a plain black text card ("The full story is on the
    // channel.") appended after the last pulled scene, per the Wave 1 shot
    // lists' cliffhanger-close direction: cut before showing the long-form's
    // own payoff/resolution, so the Short creates a reason to go watch it.
    if (config.outro) {
      const outroText = typeof config.outro === 'string' ? config.outro : config.outro.text;
      const outroDur =
        typeof config.outro === 'object'
          ? (config.outro.duration_sec ?? DEFAULT_OUTRO_DUR_SEC)
          : DEFAULT_OUTRO_DUR_SEC;
      process.stdout.write(`  [outro] "${outroText}" (${outroDur}s) … `);
      const outroPath = join(workDir, 'outro.mp4');
      await buildTextCard(outroText, outroDur, outroPath, null, SHORT_FORMAT);
      scenePaths.push(outroPath);
      console.log('done');
    }

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

    // Music bed under VO — Wave 1 shot lists' standing reminder. Skipped
    // entirely (no config.music) rather than defaulting to a guessed track —
    // bed choice is a creative call per clip, not a safe default.
    if (config.music) {
      console.log(`\nMixing music bed ("${config.music}")…`);
      const mixedPath = join(workDir, 'mixed.mp4');
      await buildSimpleMusicBed({
        videoPath: finalPath,
        bedKey: config.music,
        gainDb: config.music_gain_db,
        outputPath: mixedPath,
        workDir,
      });
      finalPath = mixedPath;
      console.log('  Music mixed + loudnorm applied');
    }

    const outPath = values.output
      ? resolve(REPO_ROOT, values.output)
      : join(dirname(configPath), 'src', config.output);
    mkdirSync(dirname(outPath), { recursive: true });
    copyFileSync(finalPath, outPath);

    const finalDur = probeDuration(outPath);
    console.log(`\n✓ Rendered: ${outPath}  (${finalDur.toFixed(1)}s)`);
    if (finalDur > MAX_RECOMMENDED_SEC) {
      console.warn(
        `[warn] ${finalDur.toFixed(1)}s exceeds the ${MAX_RECOMMENDED_SEC}s Shorts target — consider trimming scenes`,
      );
    }
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
