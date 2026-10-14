#!/usr/bin/env node
// P0.1 — writes golden.json for an MP4: duration, resolution, fps, integrated
// LUFS + true peak, scene-cut timestamps, and a dHash per 10 evenly spaced
// frames. This is a MEASUREMENT of the file as it exists today, never a
// normalization — loudnorm runs in analysis-only mode (single pass,
// print_format=json, no audio actually re-encoded).
import { execFile } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';

import { sampleFrameHashes } from './lib/phash.mjs';

const execFileAsync = promisify(execFile);

async function probeFormat(mp4Path) {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration:stream=codec_type,width,height,avg_frame_rate',
    '-of',
    'json',
    mp4Path,
  ]);
  const parsed = JSON.parse(stdout);
  const videoStream = parsed.streams.find((s) => s.codec_type === 'video');
  const [num, den] = videoStream.avg_frame_rate.split('/').map(Number);
  return {
    duration: Number(parsed.format.duration),
    width: videoStream.width,
    height: videoStream.height,
    fps: den ? num / den : num,
  };
}

async function measureLoudness(mp4Path) {
  // loudnorm's analysis pass writes its JSON report to stderr, not stdout.
  const { stderr } = await execFileAsync('ffmpeg', [
    '-i',
    mp4Path,
    '-af',
    'loudnorm=print_format=json',
    '-f',
    'null',
    '-',
  ]).catch((err) => err); // ffmpeg exits non-zero writing to /dev/null-style sink; stderr is still populated
  const match = stderr.match(/\{[^{}]*"input_i"[^{}]*\}/);
  if (!match) throw new Error(`loudnorm JSON not found in ffmpeg output for ${mp4Path}`);
  const parsed = JSON.parse(match[0]);
  return {
    integratedLufs: Number(parsed.input_i),
    truePeak: Number(parsed.input_tp),
  };
}

async function detectSceneCuts(mp4Path, threshold = 0.4) {
  // showinfo prints one line per frame that passes the scene filter; each
  // line's pts_time is a scene-cut timestamp.
  const { stderr } = await execFileAsync('ffmpeg', [
    '-i',
    mp4Path,
    '-vf',
    `select='gt(scene,${threshold})',showinfo`,
    '-f',
    'null',
    '-',
  ]).catch((err) => err);
  const timestamps = [];
  for (const line of stderr.split('\n')) {
    const m = line.match(/pts_time:([\d.]+)/);
    if (m) timestamps.push(Number(m[1]));
  }
  return timestamps;
}

export async function measure(mp4Path) {
  const format = await probeFormat(mp4Path);
  const loudness = await measureLoudness(mp4Path);
  const sceneCuts = await detectSceneCuts(mp4Path);
  const frameHashes = await sampleFrameHashes(mp4Path, format.duration, 10);
  return {
    duration: format.duration,
    width: format.width,
    height: format.height,
    fps: format.fps,
    integratedLufs: loudness.integratedLufs,
    truePeak: loudness.truePeak,
    sceneCuts,
    frameHashes,
    measuredAt: new Date().toISOString(),
  };
}

async function main() {
  const [, , mp4Path, outPath] = process.argv;
  if (!mp4Path || !outPath) {
    console.error('Usage: node scripts/golden/measure.mjs <mp4> <golden.json output path>');
    process.exit(2);
  }
  const golden = await measure(mp4Path);
  await writeFile(outPath, JSON.stringify(golden, null, 2) + '\n');
  console.log(`Wrote ${outPath}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err instanceof Error ? (err.stack ?? err.message) : err);
    process.exit(1);
  });
}
