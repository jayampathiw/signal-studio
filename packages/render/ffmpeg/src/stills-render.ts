// P3.1 — adapted from apps/video/src/longform/render.js's buildTextCard/
// buildCut/buildStillsScene/buildWithXfade. Behavior-preserving where the
// original logic is purely about producing pixels (motion filters, concat,
// VO attach) — but the VO-length reconciliation and auto-cut-split math
// that render.js did *at render time* (against a live-probed VO file) has
// moved to `packages/templates/stills-kenburns/compile.ts`, which now
// bakes final per-cut `durationSecs` into the Timeline before this engine
// ever runs. That keeps this file a pure "render exactly what the Timeline
// says" engine, consistent with every other template's render step in this
// codebase — render.js's original imperative VO-probe-then-decide loop
// doesn't fit a declarative Timeline; see compile.ts for where that logic
// now lives.

import { execFile, execSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

import type {
  KenBurnsCutT as KenBurnsCut,
  KenBurnsOverlayT as KenBurnsOverlay,
} from '@signal-studio/core/schemas';

import { buildMotionFilter, type Overlay } from './motion.ts';
import { SERIF_FONT } from './fonts.ts';
import { measureTextWidth } from './text-metrics.ts';

const execFileAsync = promisify(execFile);
export const AR = 44100;

const DEFAULT_FORMAT = { width: 1920, height: 1080, fps: 25 };

export function probeDuration(filePath: string): number {
  try {
    return Number(
      execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${filePath}"`, {
        encoding: 'utf-8',
      }).trim(),
    );
  } catch {
    return 0;
  }
}

// ── Text card ────────────────────────────────────────────────────────────────

export async function buildTextCard(
  text: string,
  durationSec: number,
  out: string,
  bgImagePath?: string | null,
  format = DEFAULT_FORMAT,
): Promise<void> {
  const { width: fW, height: fH, fps: fFPS } = format;
  if (bgImagePath) {
    const vf = `scale=${fW}:${fH}:force_original_aspect_ratio=increase,crop=${fW}:${fH},format=yuv420p`;
    await execFileAsync('ffmpeg', [
      '-y',
      '-loop',
      '1',
      '-i',
      bgImagePath,
      '-f',
      'lavfi',
      '-i',
      `anullsrc=r=${AR}:cl=stereo`,
      '-vf',
      vf,
      '-t',
      String(durationSec),
      '-c:v',
      'libx264',
      '-preset',
      'fast',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-ar',
      String(AR),
      '-ac',
      '2',
      out,
    ]);
    return;
  }

  const safe = text.replace(/\\/g, '\\\\').replace(/'/g, "'\\''");
  const MIN_CARD_FONTSIZE = 32;
  const BASE_CARD_FONTSIZE = 72;
  const maxTextWidth = fW * 0.92;
  const rawWidth = measureTextWidth(SERIF_FONT, BASE_CARD_FONTSIZE, text);
  const cardFontsize =
    rawWidth > maxTextWidth
      ? Math.max(MIN_CARD_FONTSIZE, Math.floor((BASE_CARD_FONTSIZE * maxTextWidth) / rawWidth))
      : BASE_CARD_FONTSIZE;
  const dt = `drawtext=text='${safe}':fontfile='${SERIF_FONT}':fontcolor=white:fontsize=${cardFontsize}:x=(w-text_w)/2:y=(h-text_h)/2`;
  await execFileAsync('ffmpeg', [
    '-y',
    '-f',
    'lavfi',
    '-i',
    `color=c=black:s=${fW}x${fH}:r=${fFPS}:d=${durationSec}`,
    '-f',
    'lavfi',
    '-i',
    `anullsrc=r=${AR}:cl=stereo`,
    '-vf',
    `${dt},format=yuv420p`,
    '-t',
    String(durationSec),
    '-c:v',
    'libx264',
    '-preset',
    'fast',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-ar',
    String(AR),
    '-ac',
    '2',
    out,
  ]);
}

// ── Single cut ───────────────────────────────────────────────────────────────

function toEngineOverlay(ov: KenBurnsOverlay): Overlay {
  if (ov.format === 'legacy') {
    return {
      at_sec: ov.atSec ?? null,
      text: ov.text ?? '',
      style: ov.style,
      font_path: SERIF_FONT,
    };
  }
  if (ov.tier === 2 && ov.words?.length) {
    return {
      format: 'tiered',
      tier: 2,
      atSec: ov.atSec ?? 0,
      durationSec: ov.durationSec ?? 0,
      words: ov.words.map((w) => ({
        text: w.text,
        offsetStartSec: w.offsetStartSec,
        offsetEndSec: w.offsetEndSec,
      })),
    };
  }
  if (ov.tier === 2) {
    return {
      format: 'tiered',
      tier: 2,
      atSec: ov.atSec ?? 0,
      durationSec: ov.durationSec,
      text: ov.text ?? '',
      zone: ov.zone,
    };
  }
  return {
    format: 'tiered',
    tier: 1,
    atSec: ov.atSec,
    text: ov.text ?? '',
    amberWord: ov.amberWord,
    durationSec: ov.durationSec,
    zone: ov.zone,
  };
}

export async function buildCut(
  cut: KenBurnsCut,
  overlays: KenBurnsOverlay[],
  out: string,
  format = DEFAULT_FORMAT,
): Promise<void> {
  const vf = buildMotionFilter({
    motion: cut.motion,
    durationSec: cut.durationSecs,
    regrade: cut.regrade,
    overlays: overlays.map(toEngineOverlay),
    width: format.width,
    height: format.height,
    fps: format.fps,
    cropX: cut.cropX,
  });

  await execFileAsync('ffmpeg', [
    '-y',
    '-loop',
    '1',
    '-i',
    cut.imagePath,
    '-f',
    'lavfi',
    '-i',
    `anullsrc=r=${AR}:cl=stereo`,
    '-vf',
    vf,
    '-t',
    String(cut.durationSecs),
    '-c:v',
    'libx264',
    '-preset',
    'fast',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-ar',
    String(AR),
    '-ac',
    '2',
    out,
  ]);
}

async function buildWithXfade(
  cutPaths: Array<{ path: string; transition: string }>,
  out: string,
): Promise<void> {
  const DISSOLVE_DUR = 0.5;
  const inputs = cutPaths.flatMap((c) => ['-i', c.path]);
  const filterParts: string[] = [];
  let prev = '[0:v]';
  let aacPrev = '[0:a]';

  for (let i = 1; i < cutPaths.length; i++) {
    const outV = i < cutPaths.length - 1 ? `[v${i}]` : '[vout]';
    const outA = i < cutPaths.length - 1 ? `[a${i}]` : '[aout]';
    const transition = cutPaths[i].transition === 'dissolve' ? 'dissolve' : 'fade';
    filterParts.push(
      `${prev}[${i}:v]xfade=transition=${transition}:duration=${DISSOLVE_DUR}:offset=0${outV}`,
    );
    filterParts.push(`${aacPrev}[${i}:a]acrossfade=d=${DISSOLVE_DUR}${outA}`);
    prev = outV;
    aacPrev = outA;
  }

  await execFileAsync('ffmpeg', [
    '-y',
    ...inputs,
    '-filter_complex',
    filterParts.join(';'),
    '-map',
    '[vout]',
    '-map',
    '[aout]',
    '-c:v',
    'libx264',
    '-preset',
    'fast',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-ar',
    String(AR),
    '-ac',
    '2',
    out,
  ]);
}

// ── Multi-cut scene ──────────────────────────────────────────────────────────

// Builds one Ken Burns scene (1+ cuts, already at their final durationSecs —
// see this file's own header) into a single scene MP4, with `narrationPath`
// muxed in (or silence if absent). Overlay `atSec` is already scene-
// relative on the render.js convention this ports — each cut's own overlay
// window is computed here from the cumulative sum of *previous cuts'*
// durations, same "running total, not still.start_sec/end_sec" fix the
// original render.js's own header comment documents.
export async function buildStillsScene(
  sceneId: string,
  cuts: KenBurnsCut[],
  overlays: KenBurnsOverlay[],
  narrationPath: string | undefined,
  workDir: string,
  format = DEFAULT_FORMAT,
): Promise<string> {
  const cutPaths: Array<{ path: string; transition: string }> = [];
  let cutRelStart = 0;

  for (let i = 0; i < cuts.length; i++) {
    const cut = cuts[i];
    const cutOverlays = overlays.filter((o) => {
      if (o.atSec == null) return false;
      const relAt = o.atSec - cutRelStart;
      return relAt >= 0 && relAt < cut.durationSecs;
    });
    // Re-window each matched overlay's atSec to be relative to this cut's
    // own ffmpeg timeline (t resets to 0 per generated cut) — mirrors
    // render.js's own remap.
    const rewindowed = cutOverlays.map((o) => ({ ...o, atSec: (o.atSec ?? 0) - cutRelStart }));

    const cutPath = path.join(workDir, `${sceneId}_cut${i}.mp4`);
    await buildCut(cut, rewindowed, cutPath, format);
    cutPaths.push({ path: cutPath, transition: cut.transition });
    cutRelStart += cut.durationSecs;
  }

  const sceneSilentPath = path.join(workDir, `${sceneId}_silent.mp4`);
  if (cutPaths.length === 1) {
    await execFileAsync('ffmpeg', ['-y', '-i', cutPaths[0].path, '-c', 'copy', sceneSilentPath]);
  } else {
    const hasDissolve = cutPaths.some((c) => c.transition === 'dissolve');
    if (hasDissolve) {
      await buildWithXfade(cutPaths, sceneSilentPath);
    } else {
      const listPath = path.join(workDir, `${sceneId}_cuts.txt`);
      writeFileSync(listPath, cutPaths.map((c) => `file '${c.path}'`).join('\n'));
      await execFileAsync('ffmpeg', [
        '-y',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        listPath,
        '-c',
        'copy',
        sceneSilentPath,
      ]);
    }
  }

  const sceneDur = cuts.reduce((a, c) => a + c.durationSecs, 0);
  const sceneOut = path.join(workDir, `${sceneId}.mp4`);
  if (narrationPath && existsSync(narrationPath)) {
    // NOT `-shortest` — see render.js's own header for the real bug this
    // avoids (truncating video to VO length silently drifts every later
    // scene's absolute start time). `apad` pads audio with silence instead.
    await execFileAsync('ffmpeg', [
      '-y',
      '-i',
      sceneSilentPath,
      '-i',
      narrationPath,
      '-map',
      '0:v',
      '-map',
      '1:a',
      '-t',
      String(sceneDur),
      '-c:v',
      'copy',
      '-af',
      'apad',
      '-c:a',
      'aac',
      '-ar',
      String(AR),
      '-ac',
      '2',
      sceneOut,
    ]);
  } else {
    await execFileAsync('ffmpeg', [
      '-y',
      '-i',
      sceneSilentPath,
      '-f',
      'lavfi',
      '-i',
      `anullsrc=r=${AR}:cl=stereo`,
      '-map',
      '0:v',
      '-map',
      '1:a',
      '-t',
      String(sceneDur),
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      '-ar',
      String(AR),
      '-ac',
      '2',
      sceneOut,
    ]);
  }

  return sceneOut;
}
