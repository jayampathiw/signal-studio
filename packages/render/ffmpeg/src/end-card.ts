// P3.2 — moved from apps/video/scripts/longform/assemble-short-rewrite.mjs's
// buildEndCardV2 (behavior-preserving mechanical port). `shorts-916`'s
// two-line navy end card: title larger/cream, subtitle smaller/amber, both
// shrink-to-fit the same way buildTextCard's own single line does.

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

import { BEBAS_FONT, SERIF_FONT } from './fonts.ts';
import { measureTextWidth } from './text-metrics.ts';
import { AR } from './stills-render.ts';

const execFileAsync = promisify(execFile);

const CREAM = '0xf2ece1';
const AMBER = '0xe8a559';
const NAVY_BG = '0x0f1f33';

const DEFAULT_FORMAT = { width: 1080, height: 1920, fps: 25 };

function esc(t: string): string {
  return t.replace(/\\/g, '\\\\').replace(/'/g, "'\\''");
}

export async function buildEndCardV2(
  title: string,
  subtitle: string,
  durationSec: number,
  out: string,
  format = DEFAULT_FORMAT,
): Promise<void> {
  const { width: fW, height: fH, fps: fFPS } = format;
  const maxWidth = fW * 0.88;

  const titleBase = 120;
  const titleW = measureTextWidth(BEBAS_FONT, titleBase, title);
  const titleSize =
    titleW > maxWidth ? Math.max(48, Math.floor((titleBase * maxWidth) / titleW)) : titleBase;

  const subBase = 44;
  const subW = measureTextWidth(SERIF_FONT, subBase, subtitle);
  const subSize = subW > maxWidth ? Math.max(24, Math.floor((subBase * maxWidth) / subW)) : subBase;

  const dt1 = `drawtext=text='${esc(title)}':fontfile='${BEBAS_FONT}':fontcolor=${CREAM}:fontsize=${titleSize}:x=(w-text_w)/2:y=h*0.44`;
  const dt2 = `drawtext=text='${esc(subtitle)}':fontfile='${SERIF_FONT}':fontcolor=${AMBER}:fontsize=${subSize}:x=(w-text_w)/2:y=h*0.44+${titleSize}+40`;

  await execFileAsync('ffmpeg', [
    '-y',
    '-f',
    'lavfi',
    '-i',
    `color=c=${NAVY_BG.replace('0x', '#')}:s=${fW}x${fH}:r=${fFPS}:d=${durationSec}`,
    '-f',
    'lavfi',
    '-i',
    `anullsrc=r=${AR}:cl=stereo`,
    '-vf',
    `${dt1},${dt2},format=yuv420p`,
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

// Scene-level wrapper matching stills-render.ts's buildStillsScene/
// buildTextCard convention — builds the card, then muxes narrationPath on
// top when present (`apad`, not `-shortest` — same reasoning stills-
// render.ts's own header documents: truncating video to VO length drifts
// every later scene's absolute start time). Unlike the original script,
// buildEndCardV2 above always renders its own silent `anullsrc` track (the
// original produced a card with NO audio stream at all when a scene had no
// VO, which only worked because every real end-card-v2 scene in production
// content happens to carry VO — this is a deliberate robustness fix, not a
// silent behavior change, so a VO-less end card still concatenates cleanly).
export async function buildEndCardScene(
  sceneId: string,
  title: string,
  subtitle: string,
  durationSec: number,
  narrationPath: string | undefined,
  workDir: string,
  format = DEFAULT_FORMAT,
): Promise<string> {
  const cardPath = path.join(workDir, `${sceneId}_card.mp4`);
  await buildEndCardV2(title, subtitle, durationSec, cardPath, format);

  if (!narrationPath || !existsSync(narrationPath)) return cardPath;

  const sceneOut = path.join(workDir, `${sceneId}.mp4`);
  await execFileAsync('ffmpeg', [
    '-y',
    '-i',
    cardPath,
    '-i',
    narrationPath,
    '-map',
    '0:v',
    '-map',
    '1:a',
    '-t',
    String(durationSec),
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
  return sceneOut;
}
