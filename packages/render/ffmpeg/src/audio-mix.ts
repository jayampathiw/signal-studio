// P3.1 — moved from apps/video/src/longform/audio-mix.js, retyped
// (behavior-preserving mechanical port; ffmpeg filter graphs unchanged).
// 4-layer audio mix — VO + music beds + ambience + SFX.
// Layers:
//   1. VO       — extracted from the concat video (already VO-only)
//   2. Music    — beds from a music plan, looped/trimmed per segment, 2s acrossfade joins
//   3. Ambience — stadium_hum looped for full video at -36dB (persistent texture)
//   4. SFX      — one-shots delayed to absolute offsets from scene starts
// Ducking: music sidechaincompressed by the VO signal (~15-18dB dip under speech)
// Master: two-pass loudnorm at -14 LUFS / -1.0 dBTP

import { execFile, execSync } from 'node:child_process';
import { createWriteStream, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const AR = 44100;
const AC = 2;
const SFX_GAIN_DB = -14;

// audio-kit moved to the signal-studio-workspace repo (P0.4) — point
// AUDIO_KIT_DIR at a local checkout of projects/underdog-archive/audio-kit
// there. No in-repo fallback path here (unlike the pre-P3.1 apps/video
// version) — that fallback pointed at content/audio-kit, which no longer
// exists in this repo at all (moved out at P0.4); AUDIO_KIT_DIR is
// required now.
function audioKitDir(): string {
  if (!process.env.AUDIO_KIT_DIR) {
    throw new Error(
      'AUDIO_KIT_DIR is not set — point it at a local checkout of ' +
        'signal-studio-workspace/projects/underdog-archive/audio-kit',
    );
  }
  return path.resolve(process.env.AUDIO_KIT_DIR);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function dl(url: string, dest: string): Promise<void> {
  if (existsSync(dest)) return; // simple per-run cache
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} downloading ${url}`);
  if (!res.body) throw new Error(`empty response body downloading ${url}`);
  await pipeline(res.body, createWriteStream(dest));
}

function ff(...args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync('ffmpeg', args);
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

// ── Load manifest ─────────────────────────────────────────────────────────────

export type AudioKitManifest = Record<string, { url: string }>;

export function loadManifest(): AudioKitManifest {
  const manifestPath = path.resolve(audioKitDir(), 'manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error(
      `Audio kit manifest not found at ${manifestPath}. ` +
        'Set AUDIO_KIT_DIR to a local checkout of signal-studio-workspace/projects/underdog-archive/audio-kit.',
    );
  }
  return JSON.parse(readFileSync(manifestPath, 'utf-8'));
}

// ── Download kit files needed for this project ────────────────────────────────

async function downloadKit(
  manifest: AudioKitManifest,
  keys: string[],
  workDir: string,
): Promise<Record<string, string>> {
  const paths: Record<string, string> = {};
  for (const key of new Set(keys)) {
    if (!manifest[key]) throw new Error(`Audio kit key "${key}" not in manifest`);
    const dest = path.join(workDir, `kit_${key}.mp3`);
    await dl(manifest[key].url, dest);
    paths[key] = dest;
  }
  return paths;
}

// ── Stem builders ─────────────────────────────────────────────────────────────

async function loopTrimTo(
  srcPath: string,
  durationSec: number,
  gainDb: number,
  out: string,
): Promise<void> {
  await ff(
    '-y',
    '-stream_loop',
    '-1',
    '-i',
    srcPath,
    '-t',
    String(durationSec),
    '-af',
    `volume=${gainDb}dB,aresample=${AR},aformat=channel_layouts=stereo`,
    '-ar',
    String(AR),
    '-ac',
    String(AC),
    '-c:a',
    'pcm_s16le',
    out,
  );
}

async function acrossfade(
  aPath: string,
  bPath: string,
  fadeSec: number,
  out: string,
): Promise<void> {
  await ff(
    '-y',
    '-i',
    aPath,
    '-i',
    bPath,
    '-filter_complex',
    `[0:a][1:a]acrossfade=d=${fadeSec}:o=1[out]`,
    '-map',
    '[out]',
    '-ar',
    String(AR),
    '-ac',
    String(AC),
    '-c:a',
    'pcm_s16le',
    out,
  );
}

export type MusicPlanSegment = {
  from_sec: number;
  to_sec: number;
  track: string;
  gain_db?: number;
};

async function buildMusicStem(
  audioPlan: MusicPlanSegment[],
  kitPaths: Record<string, string>,
  totalDur: number,
  workDir: string,
): Promise<string> {
  const FADE = 2;

  const segPaths: string[] = [];
  for (let i = 0; i < audioPlan.length; i++) {
    const seg = audioPlan[i];
    const dur = seg.to_sec - seg.from_sec;
    const segOut = path.join(workDir, `music_seg_${i}.wav`);

    if (seg.track === 'silence') {
      await ff(
        '-y',
        '-f',
        'lavfi',
        '-i',
        `anullsrc=r=${AR}:cl=stereo`,
        '-t',
        String(dur),
        '-ar',
        String(AR),
        '-ac',
        String(AC),
        '-c:a',
        'pcm_s16le',
        segOut,
      );
    } else {
      const track = seg.track === 'hum_only' ? 'stadium_hum' : seg.track;
      if (!kitPaths[track]) throw new Error(`Music bed "${track}" not in kit`);
      await loopTrimTo(kitPaths[track], dur, seg.gain_db ?? -23, segOut);
    }
    segPaths.push(segOut);
  }

  let current = segPaths[0];
  for (let i = 1; i < segPaths.length; i++) {
    const joined = path.join(workDir, `music_join_${i}.wav`);
    await acrossfade(current, segPaths[i], FADE, joined);
    current = joined;
  }

  const actualDur = probeDuration(current);
  const musicOut = path.join(workDir, 'music_stem.wav');
  if (Math.abs(actualDur - totalDur) > 1) {
    await ff(
      '-y',
      '-i',
      current,
      '-af',
      `apad=whole_dur=${totalDur},atrim=0:${totalDur}`,
      '-ar',
      String(AR),
      '-ac',
      String(AC),
      '-c:a',
      'pcm_s16le',
      musicOut,
    );
  } else {
    await ff('-y', '-i', current, '-t', String(totalDur), '-c:a', 'pcm_s16le', musicOut);
  }

  return musicOut;
}

async function buildAmbienceStem(
  kitPaths: Record<string, string>,
  totalDur: number,
  workDir: string,
): Promise<string> {
  const out = path.join(workDir, 'ambience_stem.wav');
  if (!kitPaths.stadium_hum) throw new Error('stadium_hum not in kit');
  await loopTrimTo(kitPaths.stadium_hum, totalDur, -36, out);
  return out;
}

export type MixClip = {
  scene_n: number;
  duration_sec: number;
  sfx?: Array<{ key: string; at_sec?: number; hold_sec?: number | null }>;
};

async function buildSfxStem(
  clips: MixClip[],
  kitPaths: Record<string, string>,
  totalDur: number,
  workDir: string,
): Promise<string | null> {
  const sceneStart: Record<number, number> = {};
  let cursor = 0;
  for (const c of clips) {
    sceneStart[c.scene_n] = cursor;
    cursor += c.duration_sec ?? 0;
  }

  const events: Array<{ key: string; absMs: number }> = [];
  for (const clip of clips) {
    if (!Array.isArray(clip.sfx) || !clip.sfx.length) continue;
    const base = sceneStart[clip.scene_n] ?? 0;
    for (const fx of clip.sfx) {
      if (!fx.key || fx.key === 'silence') continue;
      if (!kitPaths[fx.key]) {
        console.error(`  [warn] SFX key "${fx.key}" not in kit — skipped`);
        continue;
      }
      events.push({ key: fx.key, absMs: Math.round((base + (fx.at_sec ?? 0)) * 1000) });
    }
  }

  if (!events.length) return null;

  const inputs = events.flatMap((e) => ['-i', kitPaths[e.key]]);
  const delays = events.map(
    (_, i) => `[${i}:a]adelay=${events[i].absMs}|${events[i].absMs},volume=${SFX_GAIN_DB}dB[d${i}]`,
  );
  const mixed =
    events.map((_, i) => `[d${i}]`).join('') + `amix=inputs=${events.length}:normalize=0[sfx]`;

  const sfxOut = path.join(workDir, 'sfx_stem.wav');
  await ff(
    '-y',
    ...inputs,
    '-filter_complex',
    [...delays, mixed].join(';'),
    '-map',
    '[sfx]',
    '-t',
    String(totalDur),
    '-ar',
    String(AR),
    '-ac',
    String(AC),
    '-c:a',
    'pcm_s16le',
    sfxOut,
  );

  return sfxOut;
}

async function applySilenceGates(
  clips: MixClip[],
  inputPath: string,
  workDir: string,
  suffix: string,
): Promise<string> {
  const sceneStart: Record<number, number> = {};
  let cursor = 0;
  for (const c of clips) {
    sceneStart[c.scene_n] = cursor;
    cursor += c.duration_sec ?? 0;
  }

  const gates: Array<{ from: number; to: number }> = [];
  for (const clip of clips) {
    if (!Array.isArray(clip.sfx)) continue;
    const base = sceneStart[clip.scene_n] ?? 0;
    for (const fx of clip.sfx) {
      if (fx.key !== 'silence') continue;
      const dur = fx.hold_sec ?? 2;
      gates.push({ from: base, to: base + dur });
    }
  }

  if (!gates.length) return inputPath;

  const expr = gates.map((g) => `between(t,${g.from},${g.to})`).join('+');
  const gated = path.join(workDir, `gated_${suffix}.wav`);
  await ff(
    '-y',
    '-i',
    inputPath,
    '-af',
    `volume='if(${expr},0,1)':eval=frame`,
    '-ar',
    String(AR),
    '-ac',
    String(AC),
    '-c:a',
    'pcm_s16le',
    gated,
  );
  return gated;
}

async function duckMusic(musicPath: string, voPath: string, workDir: string): Promise<string> {
  const out = path.join(workDir, 'music_ducked.wav');
  await ff(
    '-y',
    '-i',
    musicPath,
    '-i',
    voPath,
    '-filter_complex',
    '[0:a][1:a]sidechaincompress=threshold=0.013:ratio=10:attack=5:release=300:knee=8[out]',
    '-map',
    '[out]',
    '-ar',
    String(AR),
    '-ac',
    String(AC),
    '-c:a',
    'pcm_s16le',
    out,
  );
  return out;
}

async function applyLoudnorm(
  inputPath: string,
  workDir: string,
): Promise<{ path: string; stats: Record<string, string> }> {
  let stderr = '';
  try {
    const { stderr: s } = await execFileAsync('ffmpeg', [
      '-i',
      inputPath,
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
  if (!jsonMatch) throw new Error('loudnorm pass 1 did not produce measurable JSON');
  const stats = JSON.parse(jsonMatch[0]);

  const out = path.join(workDir, 'master_loudnorm.wav');
  await ff(
    '-y',
    '-i',
    inputPath,
    '-af',
    [
      'loudnorm=I=-14:TP=-1.0:LRA=11:linear=true',
      `measured_I=${stats.input_i}`,
      `measured_TP=${stats.input_tp}`,
      `measured_LRA=${stats.input_lra}`,
      `measured_thresh=${stats.input_thresh}`,
      `offset=${stats.target_offset}`,
      'print_format=json',
    ].join(':'),
    '-ar',
    String(AR),
    '-ac',
    String(AC),
    '-c:a',
    'pcm_s16le',
    out,
  );

  return { path: out, stats };
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function buildAudioMix(opts: {
  concatPath: string;
  clips: MixClip[];
  audioPlan: MusicPlanSegment[];
  outputPath: string;
  workDir: string;
}): Promise<{ loudnormStats: Record<string, string> }> {
  const { concatPath, clips, audioPlan, outputPath, workDir } = opts;
  const manifest = loadManifest();

  const neededKeys = new Set<string>(['stadium_hum']);
  for (const seg of audioPlan) {
    const track = seg.track === 'hum_only' ? 'stadium_hum' : seg.track;
    if (track && track !== 'silence') neededKeys.add(track);
  }
  for (const clip of clips) {
    for (const fx of clip.sfx ?? []) {
      if (fx.key && fx.key !== 'silence') neededKeys.add(fx.key);
    }
  }

  const kitPaths = await downloadKit(manifest, [...neededKeys], workDir);
  const totalDur = probeDuration(concatPath);

  const voPath = path.join(workDir, 'vo_stem.wav');
  await ff(
    '-y',
    '-i',
    concatPath,
    '-vn',
    '-ar',
    String(AR),
    '-ac',
    String(AC),
    '-c:a',
    'pcm_s16le',
    voPath,
  );

  const rawMusicPath = await buildMusicStem(audioPlan, kitPaths, totalDur, workDir);
  const musicGated = await applySilenceGates(clips, rawMusicPath, workDir, 'music');

  const rawAmbiencePath = await buildAmbienceStem(kitPaths, totalDur, workDir);
  const ambienceGated = await applySilenceGates(clips, rawAmbiencePath, workDir, 'ambience');

  const sfxPath = await buildSfxStem(clips, kitPaths, totalDur, workDir);

  const duckedMusicPath = await duckMusic(musicGated, voPath, workDir);

  const stemInputs = [duckedMusicPath, ambienceGated, voPath];
  if (sfxPath) stemInputs.push(sfxPath);

  const inputs = stemInputs.flatMap((p) => ['-i', p]);
  const mixFilter =
    stemInputs.map((_, i) => `[${i}:a]`).join('') +
    `amix=inputs=${stemInputs.length}:normalize=0[premix]`;
  const preMixPath = path.join(workDir, 'premix.wav');
  await ff(
    '-y',
    ...inputs,
    '-filter_complex',
    mixFilter,
    '-map',
    '[premix]',
    '-ar',
    String(AR),
    '-ac',
    String(AC),
    '-c:a',
    'pcm_s16le',
    preMixPath,
  );

  const { path: masterPath, stats } = await applyLoudnorm(preMixPath, workDir);

  await ff(
    '-y',
    '-i',
    concatPath,
    '-i',
    masterPath,
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
  );

  return { loudnormStats: stats };
}
