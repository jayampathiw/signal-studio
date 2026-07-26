// Shared render helpers for the long-form stills + Ken Burns pipeline.
// DB-agnostic — every function here takes plain paths/objects, no Supabase
// calls — so both the Supabase-backed assembler (assemble-longform.mjs) and
// the local/file-driven assembler (assemble-local.mjs) can share this code
// without either depending on the other's data source.
//
// Extracted verbatim (behavior-preserving) from assemble-longform.mjs.

import { createWriteStream, writeFileSync, existsSync, copyFileSync } from 'fs';
import { join, extname } from 'path';
import { pipeline } from 'stream/promises';
import { execFile, execSync } from 'child_process';
import { promisify } from 'util';
import { buildMotionFilter, W, H, FPS } from './motion.js';
import { SERIF_FONT } from './fonts.js';
import { measureTextWidth } from './text-metrics.js';

const execAsync = promisify(execFile);
export const AR = 44100;

// Default render format — landscape 16:9 at the pipeline's original
// resolution. Every builder below accepts an optional `format` override
// (e.g. `{ width: 1080, height: 1920, fps: FPS }` for Shorts); omitting it
// reproduces today's output exactly.
const DEFAULT_FORMAT = { width: W, height: H, fps: FPS };

// Accepts either an http(s) URL (the Supabase-backed pipeline's R2 URLs) or a
// local file path (the file-driven local assembler's still/VO paths) — same
// call site works for both, so buildStillsScene/buildCut don't need to know
// which pipeline is calling them.
export async function download(url, dest) {
  if (/^https?:\/\//i.test(url)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} downloading ${url}`);
    await pipeline(res.body, createWriteStream(dest));
  } else {
    copyFileSync(url, dest);
  }
}

export function urlExt(url, fallback = '.png') {
  try { const e = extname(new URL(url).pathname); return e || fallback; }
  catch {
    // Not a URL — likely a local file path; try a plain extname before giving up.
    const e = extname(url);
    return e || fallback;
  }
}

export function probeDuration(filePath) {
  try {
    return Number(execSync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${filePath}"`,
      { encoding: 'utf-8' },
    ).trim());
  } catch { return 0; }
}

// ── Text card builder ─────────────────────────────────────────────────────────

// `bgImagePath` is optional — when given, these are pre-finished title-card
// graphics (title text, channel branding, subscribe/next-video layout all
// already baked into the image itself, generated as a complete design, not a
// photo background). So we just hold the image as-is — NOT drawtext on top,
// which would double up the title text in a mismatched font. A static hold
// (no Ken Burns push) is deliberate here: this build's crop/scale filters
// don't actually animate width/height per frame (empirically proven via a
// pixel-diff test — a dramatic crop-size change over 3s produced identical
// frames at t=0 and t=3), and zoompan is flagged unreliable at the top of
// motion.js — a plain hold sidesteps both rather than risk a silent no-op
// animation. Omitting bgImagePath renders byte-identical to before.
export async function buildTextCard(text, durationSec, out, bgImagePath, format = DEFAULT_FORMAT) {
  const { width: fW, height: fH, fps: fFPS } = format;
  if (bgImagePath) {
    const vf = `scale=${fW}:${fH}:force_original_aspect_ratio=increase,crop=${fW}:${fH},format=yuv420p`;
    await execAsync('ffmpeg', [
      '-y',
      '-loop', '1', '-i', bgImagePath,
      '-f', 'lavfi', '-i', `anullsrc=r=${AR}:cl=stereo`,
      '-vf', vf,
      '-t', String(durationSec),
      '-c:v', 'libx264', '-preset', 'fast', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-ar', String(AR), '-ac', '2',
      out,
    ]);
    return;
  }

  // Inside single-quoted FFmpeg filter options, ' must be escaped as '\'' (close, escaped, reopen).
  // Using \' instead wrongly closes the quote — the colon doesn't need escaping inside single quotes.
  const safe = text.replace(/\\/g, '\\\\').replace(/'/g, "'\\''");
  // Shrink-to-fit: a fixed fontsize=72 overflowed both edges of a 1080px
  // portrait frame for anything longer than a couple words (ffmpeg's own
  // x=(w-text_w)/2 centers correctly but doesn't stop text_w from exceeding
  // w). Pre-measure via fontkit and scale down proportionally if needed —
  // text width scales linearly with fontsize, so one measurement is enough.
  const MIN_CARD_FONTSIZE = 32;
  const BASE_CARD_FONTSIZE = 72;
  const maxTextWidth = fW * 0.92;
  const rawWidth = measureTextWidth(SERIF_FONT, BASE_CARD_FONTSIZE, text);
  const cardFontsize = rawWidth > maxTextWidth
    ? Math.max(MIN_CARD_FONTSIZE, Math.floor(BASE_CARD_FONTSIZE * maxTextWidth / rawWidth))
    : BASE_CARD_FONTSIZE;
  const dt = `drawtext=text='${safe}':fontfile='${SERIF_FONT}':fontcolor=white:fontsize=${cardFontsize}:x=(w-text_w)/2:y=(h-text_h)/2`;
  await execAsync('ffmpeg', [
    '-y',
    '-f', 'lavfi', '-i', `color=c=black:s=${fW}x${fH}:r=${fFPS}:d=${durationSec}`,
    '-f', 'lavfi', '-i', `anullsrc=r=${AR}:cl=stereo`,
    '-vf', `${dt},format=yuv420p`,
    '-t', String(durationSec),
    '-c:v', 'libx264', '-preset', 'fast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-ar', String(AR), '-ac', '2',
    out,
  ]);
}

// ── Single still cut builder ─────────────────────────────────────────────────

export async function buildCut(imgPath, motion, durationSec, regrade, overlays, out, format = DEFAULT_FORMAT, cropX = 0.5) {
  const allOverlays = (overlays ?? []).map((o) => ({ ...o, font_path: SERIF_FONT }));
  const vf = buildMotionFilter({
    motion, durationSec, regrade, overlays: allOverlays,
    width: format.width, height: format.height, fps: format.fps, cropX,
  });

  await execAsync('ffmpeg', [
    '-y',
    '-loop', '1', '-i', imgPath,
    '-f', 'lavfi', '-i', `anullsrc=r=${AR}:cl=stereo`,
    '-vf', vf,
    '-t', String(durationSec),
    '-c:v', 'libx264', '-preset', 'fast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-ar', String(AR), '-ac', '2',
    out,
  ]);
}

// ── Multi-cut scene builder (v2 path) ─────────────────────────────────────────
// `noOverlays` replaces the CLI-arg module global the original file used —
// callers thread through whatever their own --overlays/--no-overlays flag resolved to.

export async function buildStillsScene(stills, clip, voPath, workDir, { noOverlays = false, maxSilentTail = null, format = DEFAULT_FORMAT } = {}) {
  // F4: VO-length reconciliation
  const plannedDur = clip.duration_sec;
  let voDur = 0;
  if (voPath && existsSync(voPath)) {
    voDur = probeDuration(voPath);
  }
  let sceneDur = Math.max(plannedDur, voDur + 0.4);
  if (sceneDur > plannedDur) {
    console.log(`    [stretch] S${clip.scene_n}: ${plannedDur}s → ${sceneDur.toFixed(2)}s (VO ${voDur.toFixed(2)}s)`);
  } else if (maxSilentTail != null && voDur > 0) {
    // Opt-in only (maxSilentTail is null unless a caller explicitly passes it)
    // so existing projects' locked renders (son-also-saves, project 29) stay
    // byte-identical — this tightens the silent hold after VO ends down to a
    // capped tail instead of always running the full scripted scene duration.
    const capped = Math.min(plannedDur, voDur + maxSilentTail);
    if (capped < sceneDur) {
      console.log(`    [tighten] S${clip.scene_n}: ${plannedDur}s → ${capped.toFixed(2)}s (VO ${voDur.toFixed(2)}s, tail capped at ${maxSilentTail}s)`);
      sceneDur = capped;
    }
  }

  const scale = sceneDur / plannedDur;
  const overlays = (noOverlays || !Array.isArray(clip.overlays)) ? [] : clip.overlays;
  const n = String(clip.scene_n).padStart(2, '0');

  // Build each cut
  const cutPaths = [];
  let cutRelStart = 0; // running sum of previous cuts' real (post-scale) durations within this scene
  for (let i = 0; i < stills.length; i++) {
    const still = stills[i];
    const cutId = `${n}_${still.cut}`;

    // Determine cut duration from start/end_sec, scaled for VO reconciliation
    let rawStart = still.start_sec ?? null;
    let rawEnd   = still.end_sec ?? null;

    let cutDur;
    if (rawStart != null && rawEnd != null) {
      // start/end are relative to scene start
      const relStart = rawStart - (stills[0].start_sec ?? rawStart);
      const relEnd   = rawEnd   - (stills[0].start_sec ?? rawStart);
      cutDur = (relEnd - relStart) * scale;
    } else {
      // Equal split across cuts
      cutDur = sceneDur / stills.length;
    }

    // Overlays that fall within this cut's time window. cutRelStart is the
    // running total of the ACTUAL (already-scaled) durations of the cuts
    // built so far — not derived from still.start_sec/end_sec, which are
    // frequently absent (this shotlist format never sets them) and, even
    // when present, are unscaled and so drift out of sync with the real,
    // VO-stretched cut durations. Using a previous-still's raw end_sec here
    // silently evaluated to 0 for every cut past the first when unset,
    // making every cut after the first think it started at the scene's very
    // beginning — so a cut's overlay window could match a caption meant for
    // an earlier cut, showing stale/wrong text over footage that had already
    // moved on.
    const cutOverlays = overlays
      .filter((o) => o.at_sec != null)
      .map((o) => {
        // Make overlay at_sec relative to cut start
        const absAt = o.at_sec - (clip.from_sec ?? (stills[0].start_sec ?? 0));
        const relAt = absAt - cutRelStart;
        return relAt >= 0 && relAt < cutDur ? { ...o, at_sec: relAt } : null;
      })
      .filter(Boolean);

    if (!still.clip_url) {
      console.warn(`    [skip] S${n}-${still.cut}: clip_url is null (asset_reuse not resolved) — skipping cut`);
      continue;
    }
    const imgPath = join(workDir, `cut_${cutId}${urlExt(still.clip_url, '.png')}`);
    await download(still.clip_url, imgPath);

    const cutPath = join(workDir, `cut_${cutId}.mp4`);
    await buildCut(imgPath, still.motion ?? 'push', cutDur, still.regrade ?? null, cutOverlays, cutPath, format, still.crop_x ?? 0.5);
    cutPaths.push({ path: cutPath, transition: still.transition ?? 'cut' });
    cutRelStart += cutDur; // only advance for cuts actually concatenated into the scene
  }

  // Concat cuts (with optional dissolve via xfade)
  const sceneSilentPath = join(workDir, `scene_${n}_silent.mp4`);
  if (cutPaths.length === 1) {
    await execAsync('ffmpeg', ['-y', '-i', cutPaths[0].path, '-c', 'copy', sceneSilentPath]);
  } else {
    const hasDissolve = cutPaths.some((c) => c.transition === 'dissolve');
    if (hasDissolve) {
      // Use xfade filter for dissolve transitions
      await buildWithXfade(cutPaths, sceneSilentPath);
    } else {
      // Simple concat
      const listPath = join(workDir, `cuts_${n}.txt`);
      writeFileSync(listPath, cutPaths.map((c) => `file '${c.path}'`).join('\n'));
      await execAsync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', sceneSilentPath]);
    }
  }

  // Attach VO. NOT `-shortest` — that flag truncates the OUTPUT to the
  // shorter of the two input streams, so any scene whose VO is shorter than
  // its (already-reconciled) sceneDur got its video cut down to VO length
  // instead of playing its full planned duration — silently compressing the
  // whole downstream timeline scene-after-scene, throwing every subsequent
  // scene's absolute start time off by the difference (this is what made
  // captions/overlays appear to run "ahead" of the actual footage). `apad`
  // instead pads the audio with silence out to `-t sceneDur`, so the video
  // always gets its intended full length.
  const sceneOut = join(workDir, `scene_${n}.mp4`);
  if (voPath && existsSync(voPath)) {
    await execAsync('ffmpeg', [
      '-y',
      '-i', sceneSilentPath,
      '-i', voPath,
      '-map', '0:v', '-map', '1:a',
      '-t', String(sceneDur),
      '-c:v', 'copy',
      '-af', 'apad',
      '-c:a', 'aac', '-ar', String(AR), '-ac', '2',
      sceneOut,
    ]);
  } else {
    // No VO — use silence
    await execAsync('ffmpeg', [
      '-y',
      '-i', sceneSilentPath,
      '-f', 'lavfi', '-i', `anullsrc=r=${AR}:cl=stereo`,
      '-map', '0:v', '-map', '1:a',
      '-t', String(sceneDur),
      '-c:v', 'copy',
      '-c:a', 'aac', '-ar', String(AR), '-ac', '2',
      sceneOut,
    ]);
  }

  return sceneOut;
}

async function buildWithXfade(cutPaths, out) {
  // Build a filter_complex with xfade dissolve between consecutive clips
  const DISSOLVE_DUR = 0.5;
  const inputs = cutPaths.flatMap((c) => ['-i', c.path]);
  const filterParts = [];
  let prev = '[0:v]';
  let aacPrev = '[0:a]';

  for (let i = 1; i < cutPaths.length; i++) {
    const outV = i < cutPaths.length - 1 ? `[v${i}]` : '[vout]';
    const outA = i < cutPaths.length - 1 ? `[a${i}]` : '[aout]';
    const transition = cutPaths[i].transition === 'dissolve' ? 'dissolve' : 'fade';
    filterParts.push(`${prev}[${i}:v]xfade=transition=${transition}:duration=${DISSOLVE_DUR}:offset=0${outV}`);
    filterParts.push(`${aacPrev}[${i}:a]acrossfade=d=${DISSOLVE_DUR}${outA}`);
    prev = outV;
    aacPrev = outA;
  }

  await execAsync('ffmpeg', [
    '-y',
    ...inputs,
    '-filter_complex', filterParts.join(';'),
    '-map', '[vout]', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', 'fast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-ar', String(AR), '-ac', '2',
    out,
  ]);
}

// ── Legacy v1 still builder (fallback — single still, content_clips.clip_url) ─

export async function buildLegacyStill(clip, voPath, workDir) {
  const n = String(clip.scene_n).padStart(2, '0');
  const ext = urlExt(clip.clip_url ?? '', '.png');
  const imgPath = join(workDir, `img_${n}${ext}`);
  const voExistsSrc = voPath && existsSync(voPath);

  await download(clip.clip_url, imgPath);
  const voDur = voExistsSrc ? probeDuration(voPath) : 0;
  const sceneDur = Math.max(clip.duration_sec, voDur + 0.4);
  const vf = buildMotionFilter({ motion: 'push', durationSec: sceneDur });

  const silentPath = join(workDir, `scene_${n}_silent.mp4`);
  await execAsync('ffmpeg', [
    '-y', '-loop', '1', '-i', imgPath,
    '-vf', vf,
    '-t', String(sceneDur),
    '-c:v', 'libx264', '-preset', 'fast', '-pix_fmt', 'yuv420p',
    silentPath,
  ]);

  const sceneOut = join(workDir, `scene_${n}.mp4`);
  if (voExistsSrc) {
    await execAsync('ffmpeg', [
      '-y', '-i', silentPath, '-i', voPath,
      '-map', '0:v', '-map', '1:a',
      '-t', String(sceneDur),
      '-c:v', 'copy', '-af', 'apad', '-c:a', 'aac', '-ar', String(AR), '-ac', '2',
      sceneOut,
    ]);
  } else {
    await execAsync('ffmpeg', [
      '-y', '-i', silentPath,
      '-f', 'lavfi', '-i', `anullsrc=r=${AR}:cl=stereo`,
      '-map', '0:v', '-map', '1:a',
      '-t', String(sceneDur),
      '-c:v', 'copy', '-c:a', 'aac', '-ar', String(AR), '-ac', '2',
      sceneOut,
    ]);
  }
  return sceneOut;
}

// ── Legacy v1 clip builder ────────────────────────────────────────────────────

export async function buildLegacyClip(clip, voPath, workDir) {
  const n = String(clip.scene_n).padStart(2, '0');
  const vidPath = join(workDir, `vid_${n}.mp4`);
  await download(clip.clip_url, vidPath);
  const voExistsSrc = voPath && existsSync(voPath);
  const voDur = voExistsSrc ? probeDuration(voPath) : 0;
  const sceneDur = Math.max(clip.duration_sec, voDur + 0.4);
  const scale = `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,format=yuv420p`;
  const silentPath = join(workDir, `scene_${n}_silent.mp4`);
  await execAsync('ffmpeg', [
    '-y', '-i', vidPath,
    '-vf', scale, '-t', String(sceneDur),
    '-c:v', 'libx264', '-preset', 'fast', '-pix_fmt', 'yuv420p',
    silentPath,
  ]);
  const sceneOut = join(workDir, `scene_${n}.mp4`);
  if (voExistsSrc) {
    await execAsync('ffmpeg', [
      '-y', '-i', silentPath, '-i', voPath,
      '-map', '0:v', '-map', '1:a',
      '-t', String(sceneDur),
      '-c:v', 'copy', '-af', 'apad', '-c:a', 'aac', '-ar', String(AR), '-ac', '2',
      sceneOut,
    ]);
  } else {
    await execAsync('ffmpeg', [
      '-y', '-i', silentPath,
      '-f', 'lavfi', '-i', `anullsrc=r=${AR}:cl=stereo`,
      '-map', '0:v', '-map', '1:a',
      '-t', String(sceneDur),
      '-c:v', 'copy', '-c:a', 'aac', '-ar', String(AR), '-ac', '2',
      sceneOut,
    ]);
  }
  return sceneOut;
}
