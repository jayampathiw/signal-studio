// P3.2 — moved from apps/video/scripts/longform/assemble-short-rewrite.mjs's
// buildLayerTrack/buildOneShotTrack/applySoundDesign (behavior-preserving
// mechanical port of the ffmpeg filter graphs). `shorts-916`'s layered
// sound design (hum/bed/heartbeat/hit, each turning on/off at specific
// points) — a parallel mixing path to audio-mix.ts's buildAudioMix
// (stills-kenburns's continuous music-bed schedule), not a replacement.
//
// **Architectural difference from the original script**: the original
// computed each layer's absolute start/end seconds INSIDE applySoundDesign,
// by looking up `sceneMeta` (built during rendering, from each scene's
// ACTUAL rendered duration). This module receives that math already done —
// a flat `SoundDesignLayer[]` with literal `startSec`/`endSec` — because
// `compile()` now bakes every scene's final duration into the Timeline
// before this engine ever runs (the same shift P3.1 made for VO-length
// reconciliation). See `packages/templates/shorts-916/src/compile.ts`'s own
// header for where that lookup math now lives.

import { execFile, execSync } from 'node:child_process';
import { createWriteStream, existsSync } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';

import type { SoundDesignLayerT } from '@signal-studio/core/schemas';

import { loadManifest } from './audio-mix.ts';

const execFileAsync = promisify(execFile);
const AR = 44100;
const AC = 2;

function pad(n: number): string {
  return n.toFixed(3);
}

async function dl(url: string, dest: string): Promise<void> {
  if (existsSync(dest)) return;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} downloading ${url}`);
  if (!res.body) throw new Error(`empty response body downloading ${url}`);
  await pipeline(res.body, createWriteStream(dest));
}

async function resolveKitSource(key: string, workDir: string): Promise<string> {
  const manifest = loadManifest();
  if (!manifest[key]) throw new Error(`Audio kit key "${key}" not in manifest`);
  const dest = path.join(workDir, `kit_${key}.mp3`);
  await dl(manifest[key].url, dest);
  return dest;
}

async function buildLayerTrack(
  layer: SoundDesignLayerT,
  totalDur: number,
  workDir: string,
  tag: string,
): Promise<string | null> {
  const startSec = layer.startSec;
  const endSec = layer.endSec ?? totalDur;
  const activeDur = endSec - startSec;
  if (activeDur <= 0) return null;

  const src = await resolveKitSource(layer.key, workDir);
  const active = path.join(workDir, `layer_${tag}_active.wav`);
  const fadeInSec = layer.fadeInSec ?? 0;
  const fadeOutSec = layer.fadeOutSec ?? 0;
  await execFileAsync('ffmpeg', [
    '-y',
    '-stream_loop',
    '-1',
    '-i',
    src,
    '-t',
    String(activeDur),
    '-af',
    [
      `volume=${layer.gainDb}dB`,
      fadeInSec > 0 ? `afade=t=in:st=0:d=${fadeInSec}` : null,
      fadeOutSec > 0
        ? `afade=t=out:st=${pad(Math.max(0, activeDur - fadeOutSec))}:d=${fadeOutSec}`
        : null,
      `aresample=${AR}`,
      'aformat=channel_layouts=stereo',
    ]
      .filter(Boolean)
      .join(','),
    '-ar',
    String(AR),
    '-ac',
    String(AC),
    '-c:a',
    'pcm_s16le',
    active,
  ]);

  const out = path.join(workDir, `layer_${tag}.wav`);
  await execFileAsync('ffmpeg', [
    '-y',
    '-i',
    active,
    '-af',
    `adelay=${Math.round(startSec * 1000)}|${Math.round(startSec * 1000)},apad,atrim=0:${pad(totalDur)}`,
    '-ar',
    String(AR),
    '-ac',
    String(AC),
    '-c:a',
    'pcm_s16le',
    out,
  ]);
  return out;
}

async function buildOneShotTrack(
  layer: SoundDesignLayerT,
  totalDur: number,
  workDir: string,
  tag: string,
): Promise<string> {
  const src = await resolveKitSource(layer.key, workDir);
  const out = path.join(workDir, `layer_${tag}.wav`);
  await execFileAsync('ffmpeg', [
    '-y',
    '-i',
    src,
    '-af',
    `volume=${layer.gainDb}dB,adelay=${Math.round(layer.startSec * 1000)}|${Math.round(layer.startSec * 1000)},apad,atrim=0:${pad(totalDur)}`,
    '-ar',
    String(AR),
    '-ac',
    String(AC),
    '-c:a',
    'pcm_s16le',
    out,
  ]);
  return out;
}

function probeDuration(filePath: string): number {
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

// Mixes all sound-design layers with the video's existing VO track,
// sidechain-ducks the combined bed under VO, two-pass loudnorms to -14
// LUFS/-1.0 dBTP (same target stills-kenburns's buildAudioMix uses), muxes
// back into the video. Ported unchanged from applySoundDesign's own mix
// math, including the -2.0 dBTP pre-encode alimiter safety net (see that
// function's original header for why: linear-mode loudnorm has no lookahead
// limiter and can overshoot its own TP target, and AAC re-encoding adds
// further inter-sample peak overshoot on top of that).
export async function applySoundDesign(opts: {
  videoPath: string;
  layers: SoundDesignLayerT[];
  outputPath: string;
  workDir: string;
}): Promise<void> {
  const { videoPath, layers, outputPath, workDir } = opts;
  const totalDur = probeDuration(videoPath);

  const built: string[] = [];
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    const tag = `${layer.kind}_${i}_${layer.key}`;
    const trackPath =
      layer.kind === 'oneshot'
        ? await buildOneShotTrack(layer, totalDur, workDir, tag)
        : await buildLayerTrack(layer, totalDur, workDir, tag);
    if (trackPath) built.push(trackPath);
  }

  const bedMix = path.join(workDir, 'bed_mix.wav');
  if (built.length === 0) {
    await execFileAsync('ffmpeg', [
      '-y',
      '-f',
      'lavfi',
      '-i',
      `anullsrc=r=${AR}:cl=stereo`,
      '-t',
      String(totalDur),
      '-c:a',
      'pcm_s16le',
      bedMix,
    ]);
  } else if (built.length === 1) {
    await execFileAsync('ffmpeg', ['-y', '-i', built[0], '-c', 'copy', bedMix]);
  } else {
    const inputs = built.flatMap((p) => ['-i', p]);
    const inLabels = built.map((_, i) => `[${i}:a]`).join('');
    await execFileAsync('ffmpeg', [
      '-y',
      ...inputs,
      '-filter_complex',
      `${inLabels}amix=inputs=${built.length}:normalize=0[out]`,
      '-map',
      '[out]',
      '-ar',
      String(AR),
      '-ac',
      String(AC),
      '-c:a',
      'pcm_s16le',
      bedMix,
    ]);
  }

  const voPath = path.join(workDir, 'vo_full.wav');
  await execFileAsync('ffmpeg', [
    '-y',
    '-i',
    videoPath,
    '-vn',
    '-ar',
    String(AR),
    '-ac',
    String(AC),
    '-c:a',
    'pcm_s16le',
    voPath,
  ]);

  const bedDucked = path.join(workDir, 'bed_ducked.wav');
  await execFileAsync('ffmpeg', [
    '-y',
    '-i',
    bedMix,
    '-i',
    voPath,
    '-filter_complex',
    '[0:a][1:a]sidechaincompress=threshold=0.013:ratio=4:attack=5:release=200:knee=8[out]',
    '-map',
    '[out]',
    '-ar',
    String(AR),
    '-ac',
    String(AC),
    '-c:a',
    'pcm_s16le',
    bedDucked,
  ]);

  const premix = path.join(workDir, 'premix.wav');
  await execFileAsync('ffmpeg', [
    '-y',
    '-i',
    bedDucked,
    '-i',
    voPath,
    '-filter_complex',
    '[0:a][1:a]amix=inputs=2:normalize=0[premix]',
    '-map',
    '[premix]',
    '-ar',
    String(AR),
    '-ac',
    String(AC),
    '-c:a',
    'pcm_s16le',
    premix,
  ]);

  let stderr = '';
  try {
    const { stderr: s } = await execFileAsync('ffmpeg', [
      '-i',
      premix,
      '-af',
      'loudnorm=I=-14:TP=-1.0:LRA=11:print_format=json',
      '-f',
      'null',
      '/dev/null',
    ]);
    stderr = s;
  } catch (e) {
    stderr = (e as { stderr?: string }).stderr ?? '';
  }
  const jsonMatch = stderr.match(/\{[\s\S]*"input_i"[\s\S]*\}/);
  const stats = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
  const master = path.join(workDir, 'master.wav');
  if (stats) {
    await execFileAsync('ffmpeg', [
      '-y',
      '-i',
      premix,
      '-af',
      [
        [
          'loudnorm=I=-14:TP=-1.0:LRA=11:linear=true',
          `measured_I=${stats.input_i}`,
          `measured_TP=${stats.input_tp}`,
          `measured_LRA=${stats.input_lra}`,
          `measured_thresh=${stats.input_thresh}`,
          `offset=${stats.target_offset}`,
        ].join(':'),
        'alimiter=limit=0.79433:level=false',
      ].join(','),
      '-ar',
      String(AR),
      '-ac',
      String(AC),
      '-c:a',
      'pcm_s16le',
      master,
    ]);
  } else {
    await execFileAsync('ffmpeg', ['-y', '-i', premix, '-c', 'copy', master]);
  }

  await execFileAsync('ffmpeg', [
    '-y',
    '-i',
    videoPath,
    '-i',
    master,
    '-map',
    '0:v',
    '-map',
    '1:a',
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-ar',
    String(AR),
    outputPath,
  ]);
}
