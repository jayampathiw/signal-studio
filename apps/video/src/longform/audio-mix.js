// F5: 4-layer audio mix — VO + music beds + ambience + SFX
// Layers:
//   1. VO       — extracted from the concat video (already VO-only)
//   2. Music    — beds from audio_plan, looped/trimmed per segment, 2s acrossfade joins
//   3. Ambience — stadium_hum looped for full video at -36dB (persistent texture)
//   4. SFX      — one-shots delayed to absolute offsets from scene starts
// Ducking: music sidechaincompressed by the VO signal (~6dB dip under speech)
// Master: two-pass loudnorm at -14 LUFS / -1.0 dBTP

import { execFile, execSync } from 'child_process';
import { createWriteStream, existsSync, readFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { pipeline } from 'stream/promises';
import { fileURLToPath } from 'url';
import { promisify } from 'util';

const execAsync = promisify(execFile);
const AR = 44100;
const AC = 2;
const SFX_GAIN_DB = -14;
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../');
const MANIFEST_PATH = resolve(REPO_ROOT, 'content/audio-kit/manifest.json');

// ── Helpers ──────────────────────────────────────────────────────────────────

async function dl(url, dest) {
  if (existsSync(dest)) return; // simple per-run cache
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} downloading ${url}`);
  await pipeline(res.body, createWriteStream(dest));
}

function ff(...args) {
  return execAsync('ffmpeg', args);
}

function probeDuration(path) {
  try {
    return Number(
      execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${path}"`, {
        encoding: 'utf-8',
      }).trim(),
    );
  } catch {
    return 0;
  }
}

// ── Load manifest ─────────────────────────────────────────────────────────────

export function loadManifest() {
  if (!existsSync(MANIFEST_PATH)) {
    throw new Error(
      'Audio kit manifest not found. ' +
        'Run: node apps/video/scripts/longform/import-audio-kit.mjs (F1-8)',
    );
  }
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
}

// ── Download kit files needed for this project ────────────────────────────────

async function downloadKit(manifest, keys, workDir) {
  const paths = {};
  for (const key of new Set(keys)) {
    if (!manifest[key]) throw new Error(`Audio kit key "${key}" not in manifest`);
    const dest = join(workDir, `kit_${key}.mp3`);
    await dl(manifest[key].url, dest);
    paths[key] = dest;
  }
  return paths;
}

// ── Stem builders ─────────────────────────────────────────────────────────────

// Loop/trim a source file to exactly durationSec, applying a volume gain.
async function loopTrimTo(srcPath, durationSec, gainDb, out) {
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

// Join two WAV files with an acrossfade of fadeSec. Output duration = a+b-fadeSec.
async function acrossfade(aPath, bPath, fadeSec, out) {
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

// Build the music stem from audio_plan segments.
// `hum_only` → use stadium_hum at the specified gain (quiet/sparse)
// `silence`  → generate silence for that segment (hard gap)
async function buildMusicStem(audioPlan, kitPaths, totalDur, workDir) {
  const FADE = 2; // seconds between segments

  const segPaths = [];
  for (let i = 0; i < audioPlan.length; i++) {
    const seg = audioPlan[i];
    const dur = seg.to_sec - seg.from_sec;
    const segOut = join(workDir, `music_seg_${i}.wav`);

    if (seg.track === 'silence') {
      // Hard gap — pure silence
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

  // Join segments iteratively with acrossfade
  let current = segPaths[0];
  for (let i = 1; i < segPaths.length; i++) {
    const joined = join(workDir, `music_join_${i}.wav`);
    await acrossfade(current, segPaths[i], FADE, joined);
    current = joined;
  }

  // Pad or trim to total duration (acrossfades may leave the stem slightly short)
  const actualDur = probeDuration(current);
  const musicOut = join(workDir, 'music_stem.wav');
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

// Ambience stem: stadium_hum looped at -36dB for the full video (always-on texture).
async function buildAmbienceStem(kitPaths, totalDur, workDir) {
  const out = join(workDir, 'ambience_stem.wav');
  if (!kitPaths.stadium_hum) throw new Error('stadium_hum not in kit');
  await loopTrimTo(kitPaths.stadium_hum, totalDur, -36, out);
  return out;
}

// SFX stem: each non-silence SFX from content_clips is delayed to its absolute offset.
// `clips` is [{scene_n, duration_sec, sfx: [{key, at_sec?, hold_sec?}]}]
// Returns null if no SFX are applicable.
async function buildSfxStem(clips, kitPaths, totalDur, workDir) {
  // Build cumulative start times
  const sceneStart = {};
  let cursor = 0;
  for (const c of clips) {
    sceneStart[c.scene_n] = cursor;
    cursor += c.duration_sec ?? 0;
  }

  // Collect playable SFX events (exclude silence directives)
  const events = [];
  for (const clip of clips) {
    if (!Array.isArray(clip.sfx) || !clip.sfx.length) continue;
    const base = sceneStart[clip.scene_n] ?? 0;
    for (const fx of clip.sfx) {
      if (!fx.key || fx.key === 'silence') continue;
      if (!kitPaths[fx.key]) {
        console.warn(`  [warn] SFX key "${fx.key}" not in kit — skipped`);
        continue;
      }
      events.push({ key: fx.key, absMs: Math.round((base + (fx.at_sec ?? 0)) * 1000) });
    }
  }

  if (!events.length) return null;

  // adelay: mix all one-shots into one stem using amix + adelay
  // SFX_GAIN_DB: one-shot kit assets (crowd roar, whistle, musical hits, …) are
  // stock sources normalized close to 0dBFS on their own — with no attenuation
  // here they came in far louder than the (already quiet, ducked) music/VO,
  // burying narration under every cue. Flat -14dB brings them in line with
  // the rest of the mix; loudnorm's TP ceiling still catches any transient peak.
  const inputs = events.flatMap((e) => ['-i', kitPaths[e.key]]);
  const delays = events.map(
    (_, i) => `[${i}:a]adelay=${events[i].absMs}|${events[i].absMs},volume=${SFX_GAIN_DB}dB[d${i}]`,
  );
  const mixed =
    events.map((_, i) => `[d${i}]`).join('') + `amix=inputs=${events.length}:normalize=0[sfx]`;

  const sfxOut = join(workDir, 'sfx_stem.wav');
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

// Apply silence gates from 'silence' SFX events to a WAV file.
// Uses volume= filter with enable=between(t,...) expressions.
async function applySilenceGates(clips, inputPath, workDir, suffix) {
  const sceneStart = {};
  let cursor = 0;
  for (const c of clips) {
    sceneStart[c.scene_n] = cursor;
    cursor += c.duration_sec ?? 0;
  }

  const gates = [];
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

  // Build volume= expressions: volume=0 during silence windows
  const expr = gates.map((g) => `between(t,${g.from},${g.to})`).join('+');
  const gated = join(workDir, `gated_${suffix}.wav`);
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

// Duck music using the VO as a sidechain compressor.
// When VO is above threshold, music ducks ~15-18dB — deep enough that
// narration is never competing with the bed (a 4:1/~6dB dip left the bed
// audibly fighting the VO whenever a scene's gain_db ran anywhere near -20).
async function duckMusic(musicPath, voPath, workDir) {
  const out = join(workDir, 'music_ducked.wav');
  await ff(
    '-y',
    '-i',
    musicPath, // 0: music (the signal to compress)
    '-i',
    voPath, // 1: VO (the sidechain)
    '-filter_complex',
    // threshold ~-38dBFS, ratio=10 → ~15-18dB dip under normal VO levels
    // attack=5ms (fast enough to catch speech onset), release=300ms (natural decay, avoids audible pumping)
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

// Two-pass loudnorm at I=-14 LUFS, TP=-1.0 dBTP, LRA=11.
async function applyLoudnorm(inputPath, workDir) {
  // Pass 1 — measure
  let stderr = '';
  try {
    const { stderr: s } = await execAsync('ffmpeg', [
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
    // ffmpeg exits non-zero for -f null; stderr still has the data
    stderr = e.stderr ?? '';
  }

  const jsonMatch = stderr.match(/\{[\s\S]*"input_i"[\s\S]*\}/);
  if (!jsonMatch) throw new Error('loudnorm pass 1 did not produce measurable JSON');
  const stats = JSON.parse(jsonMatch[0]);

  // Pass 2 — apply
  const out = join(workDir, 'master_loudnorm.wav');
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

/**
 * Single-bed music mix — one continuous audio-kit bed track under the video's
 * existing VO, sidechain-ducked, loudnorm'd, muxed back in. Built for Shorts
 * (assemble-short.mjs): a Short is one continuous clip, not a multi-act
 * documentary, so it doesn't need buildAudioMix's per-segment audioPlan,
 * ambience layer, or SFX-event system — just "music bed under VO" per the
 * Wave 1 shot lists' standing reminder. Reuses this file's existing
 * loop/duck/loudnorm building blocks rather than a separate implementation.
 *
 * @param {object} opts
 * @param {string} opts.videoPath  — video whose existing audio track IS the VO
 * @param {string} opts.bedKey     — audio-kit manifest key, e.g. 'tension'
 * @param {number} [opts.gainDb]   — bed level before ducking (default -20dB)
 * @param {string} opts.outputPath
 * @param {string} opts.workDir
 * @returns {{ loudnormStats: object }}
 */
export async function buildSimpleMusicBed({
  videoPath,
  bedKey,
  gainDb = -20,
  outputPath,
  workDir,
}) {
  const manifest = loadManifest();
  if (!manifest[bedKey]) throw new Error(`Audio kit key "${bedKey}" not in manifest`);

  const totalDur = probeDuration(videoPath);

  const bedSrc = join(workDir, `kit_${bedKey}.mp3`);
  await dl(manifest[bedKey].url, bedSrc);

  const voPath = join(workDir, 'vo_stem.wav');
  await ff(
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
  );

  const bedTrimmed = join(workDir, 'bed_trimmed.wav');
  await loopTrimTo(bedSrc, totalDur, gainDb, bedTrimmed);

  const bedDucked = await duckMusic(bedTrimmed, voPath, workDir);

  const premix = join(workDir, 'premix_simple.wav');
  await ff(
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
  );

  const { path: masterPath, stats } = await applyLoudnorm(premix, workDir);

  await ff(
    '-y',
    '-i',
    videoPath,
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

/**
 * Build the full 4-layer audio mix and mux it back with the video.
 *
 * @param {object} opts
 * @param {string}   opts.concatPath   — path to the concat video (VO already embedded)
 * @param {Array}    opts.clips        — [{scene_n, duration_sec, sfx}] in scene order
 * @param {Array}    opts.audioPlan    — [{from_sec, to_sec, track, gain_db}]
 * @param {string}   opts.outputPath   — where to write the final mixed MP4
 * @param {string}   opts.workDir      — temp directory
 * @returns {{ loudnormStats: object }} — measured loudness values
 */
export async function buildAudioMix({ concatPath, clips, audioPlan, outputPath, workDir }) {
  const manifest = loadManifest();

  // Collect all kit keys needed for this project
  const neededKeys = new Set(['stadium_hum']);
  for (const seg of audioPlan) {
    const track = seg.track === 'hum_only' ? 'stadium_hum' : seg.track;
    if (track && track !== 'silence') neededKeys.add(track);
  }
  for (const clip of clips) {
    for (const fx of clip.sfx ?? []) {
      if (fx.key && fx.key !== 'silence') neededKeys.add(fx.key);
    }
  }

  console.log(`  Downloading ${neededKeys.size} kit files…`);
  const kitPaths = await downloadKit(manifest, [...neededKeys], workDir);

  // Total duration from clips (may differ slightly from concat probe — use probe as truth)
  const totalDur = probeDuration(concatPath);
  console.log(`  Total duration: ${totalDur.toFixed(1)}s`);

  // 1. Extract VO
  console.log('  [1/6] Extracting VO…');
  const voPath = join(workDir, 'vo_stem.wav');
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

  // 2. Music stem
  console.log('  [2/6] Building music stem…');
  const rawMusicPath = await buildMusicStem(audioPlan, kitPaths, totalDur, workDir);
  const musicGated = await applySilenceGates(clips, rawMusicPath, workDir, 'music');

  // 3. Ambience stem
  console.log('  [3/6] Building ambience stem…');
  const rawAmbiencePath = await buildAmbienceStem(kitPaths, totalDur, workDir);
  const ambienceGated = await applySilenceGates(clips, rawAmbiencePath, workDir, 'ambience');

  // 4. SFX stem
  console.log('  [4/6] Building SFX stem…');
  const sfxPath = await buildSfxStem(clips, kitPaths, totalDur, workDir);

  // 5. Duck music by VO sidechain
  console.log('  [5/6] Ducking music under VO…');
  const duckedMusicPath = await duckMusic(musicGated, voPath, workDir);

  // 6. Mix all stems + loudnorm
  console.log('  [6/6] Final mix + loudnorm…');
  const stemInputs = [duckedMusicPath, ambienceGated, voPath];
  if (sfxPath) stemInputs.push(sfxPath);

  const inputs = stemInputs.flatMap((p) => ['-i', p]);
  const mixFilter =
    stemInputs.map((_, i) => `[${i}:a]`).join('') +
    `amix=inputs=${stemInputs.length}:normalize=0[premix]`;
  const preMixPath = join(workDir, 'premix.wav');
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

  // Mux: replace concat's audio with the mixed master
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

  console.log(`  Mix complete → ${outputPath}`);
  console.log(`  Loudnorm: I=${Number(stats.input_i).toFixed(1)} LUFS → -14.0 LUFS`);

  return { loudnormStats: stats };
}
