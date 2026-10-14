import { execFile } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import type { QaBlackSegment, QaMeasurement } from '@signal-studio/core/stages/qa';

const execFileAsync = promisify(execFile);

/**
 * Real ffprobe/ffmpeg measurement for the `qa` stage — same technique
 * `scripts/golden/measure.mjs` already uses (duration/resolution/fps via
 * ffprobe, integrated LUFS/true peak via a `loudnorm` analysis-only pass),
 * reimplemented here rather than imported: `scripts/` isn't a workspace
 * package (no `package.json`), so it isn't dockerized alongside
 * `apps/worker` the way every other real dependency this app uses is.
 */
export async function measureVideo(mp4Path: string): Promise<QaMeasurement> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration:stream=codec_type,width,height,avg_frame_rate',
    '-of',
    'json',
    mp4Path,
  ]);
  const parsed = JSON.parse(stdout) as {
    format: { duration: string };
    streams: Array<{
      codec_type: string;
      width?: number;
      height?: number;
      avg_frame_rate?: string;
    }>;
  };
  const videoStream = parsed.streams.find((s) => s.codec_type === 'video');
  if (!videoStream) throw new Error(`measureVideo: no video stream found in ${mp4Path}`);
  const [num, den] = (videoStream.avg_frame_rate ?? '0/1').split('/').map(Number);

  const { stderr } = await execFileAsync('ffmpeg', [
    '-i',
    mp4Path,
    '-af',
    'loudnorm=print_format=json',
    '-f',
    'null',
    '-',
  ]).catch((err: { stderr: string }) => err);
  const match = stderr.match(/\{[^{}]*"input_i"[^{}]*\}/);
  if (!match)
    throw new Error(`measureVideo: loudnorm JSON not found in ffmpeg output for ${mp4Path}`);
  const loudness = JSON.parse(match[0]) as { input_i: string; input_tp: string };

  return {
    durationSec: Number(parsed.format.duration),
    width: videoStream.width ?? 0,
    height: videoStream.height ?? 0,
    fps: den ? num / den : num,
    integratedLufs: Number(loudness.input_i),
    truePeakDb: Number(loudness.input_tp),
  };
}

/** Real ffmpeg `blackdetect` pass — flags fully/near-fully black stretches. */
export async function detectBlackFrames(mp4Path: string): Promise<QaBlackSegment[]> {
  const { stderr } = await execFileAsync('ffmpeg', [
    '-i',
    mp4Path,
    '-vf',
    'blackdetect=d=0.1:pic_th=0.98:pix_th=0.10',
    '-f',
    'null',
    '-',
  ]).catch((err: { stderr: string }) => err);

  const segments: QaBlackSegment[] = [];
  for (const line of stderr.split('\n')) {
    const m = line.match(/black_start:([\d.]+) black_end:([\d.]+)/);
    if (m) segments.push({ startSec: Number(m[1]), endSec: Number(m[2]) });
  }
  return segments;
}

/** Extracts `count` evenly spaced frames as base64-encoded PNGs. */
export async function extractSampleFrames(mp4Path: string, count: number): Promise<string[]> {
  const { durationSec } = await measureVideo(mp4Path);

  const frames: string[] = [];
  for (let i = 0; i < count; i++) {
    const t = (durationSec * (i + 0.5)) / count;
    const outPath = path.join(os.tmpdir(), `qa-frame-${Date.now()}-${i}.png`);
    await execFileAsync('ffmpeg', [
      '-y',
      '-ss',
      String(t),
      '-i',
      mp4Path,
      '-frames:v',
      '1',
      outPath,
    ]);
    frames.push((await readFile(outPath)).toString('base64'));
    await rm(outPath, { force: true });
  }
  return frames;
}
