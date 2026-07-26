// "Full rewrite" Shorts assembler — builds a Short entirely from a bespoke
// scene list (own VO script, own images, own timing), NOT pulled from a
// source project's shotlist/captions.json like assemble-short.mjs. Built for
// the Wave 1 "full rewrite" override (2026-07-26): script reuse + generic
// imagery across the reused-VO Shorts was judged not good enough, so these
// clips get dedicated VO + dedicated per-scene timing instead of re-cutting
// existing long-form scenes.
//
// v2 adds: layered scene-aware sound design (hum/bed/heartbeat that turn on
// partway through, cut hard for a silence beat, then resume with a
// word-synced musical hit) and a two-line navy end card — both driven by
// audio-kit manifest keys, positioned using each scene's ACTUAL rendered
// duration (VO reconciliation means scenes rarely land exactly on their
// target_duration_sec, so layer timing is computed after rendering, not
// from the config's targets).
//
// Config shape — see content/shorts/silenced/silenced-s1-tah-miss-EN-v2.json
// for a full worked example (hook scene, sentence-spillover scenes, a
// mid-scene pause+hit scene, and a v2-style end card).

import { parseArgs } from 'util';
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFile, execSync } from 'child_process';
import { promisify } from 'util';
import { synthesise } from '@signal-studio/media/tts';
import { generateWordTimestamps } from '@signal-studio/media/subtitles';
import { buildStillsScene, probeDuration } from '../../src/longform/render.js';
import { loadManifest } from '../../src/longform/audio-mix.js';
import { chunkCaptions } from '../../src/longform/captions.js';
import { FPS } from '../../src/longform/motion.js';
import { SERIF_FONT, BEBAS_FONT } from '../../src/longform/fonts.js';
import { measureTextWidth } from '../../src/longform/text-metrics.js';

const execAsync = promisify(execFile);
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../');
const SHORT_FORMAT = { width: 1080, height: 1920, fps: FPS };
const AR = 44100;
const AC = 2;
const CREAM = '0xf2ece1';
const AMBER = '0xe8a559';
const NAVY_BG = '0x0f1f33';

const { values } = parseArgs({
  options: {
    config: { type: 'string' },
    output: { type: 'string' },
    voice:  { type: 'string' },
    'keep-tmp': { type: 'boolean' },
  },
  strict: false,
});

if (!values.config) { console.error('--config <path> required'); process.exit(2); }
const configPath = resolve(REPO_ROOT, values.config);
const config = JSON.parse(readFileSync(configPath, 'utf-8'));
const voice = values.voice ?? config.voice ?? 'am_adam';

function titleCase(text) {
  return text.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildHookOverlay(text, amberWord, atSec, durationSec) {
  return { format: 'tiered', text, amber_word: amberWord ?? null, at_sec: atSec, duration_sec: durationSec, zone: 'upper center', fade_in: 0 };
}

async function synthScene(text, outPath) {
  await synthesise(text, outPath, { voice });
  return outPath;
}

// Scene D's "He strikes it— [pause] —over the bar." — two TTS calls
// concatenated with real silence (not whatever pause Kokoro happens to leave
// on an em dash), so the hold length is a directed beat. Also returns the
// exact offset of part 2's LAST word (the word the musical hit must land
// on — "bar", not just "the start of part 2") via a dedicated Whisper pass
// on part 2 alone, so the hit sync isn't a guess.
async function synthPausedScene(parts, pauseSec, outPath, workDir, idx) {
  const partPaths = [];
  for (let i = 0; i < parts.length; i++) {
    const p = join(workDir, `part_${idx}_${i}.wav`);
    await synthesise(parts[i], p, { voice });
    partPaths.push(p);
  }
  const part1Dur = probeDuration(partPaths[0]);
  // The file-concat demuxer (`-f concat -c copy`) mishandles separately-
  // written WAV files here — each file's own RIFF header gets treated as
  // stream data mid-concat, so the "silent" middle segment isn't actually
  // silent in the output (verified via volumedetect: -24dB during the pause
  // instead of near-floor). The `concat` FILTER (sample-accurate, decodes
  // and re-encodes) doesn't have this problem — used instead, at the cost of
  // one extra decode/encode pass.
  const silencePath = join(workDir, `silence_${idx}.wav`);
  await execAsync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono', '-t', String(pauseSec), '-c:a', 'pcm_s16le', silencePath]);

  await execAsync('ffmpeg', [
    '-y',
    '-i', partPaths[0], '-i', silencePath, '-i', partPaths[1],
    '-filter_complex', '[0:a][1:a][2:a]concat=n=3:v=0:a=1[out]',
    '-map', '[out]', '-c:a', 'pcm_s16le',
    outPath,
  ]);

  const part2Words = await generateWordTimestamps(partPaths[1], join(workDir, `part2_words_${idx}.json`), titleCase(parts[1]));
  const lastWord = part2Words[part2Words.length - 1];
  const part2StartInFull = part1Dur + pauseSec;
  const hitOffsetInScene = lastWord ? part2StartInFull + lastWord.start : part2StartInFull;

  return { path: outPath, pauseStartInScene: part1Dur, pauseEndInScene: part1Dur + pauseSec, hitOffsetInScene };
}

// Two-line navy end card (v2 spec: title larger/cream, platform-neutral CTA
// smaller/amber — no "link in bio" baked in, since that's wrong for 2 of 3
// platforms). Built with the same shrink-to-fit width guard buildTextCard
// uses, just for two independently-sized lines instead of one.
async function buildEndCardV2(title, subtitle, durationSec, outPath, format) {
  const { width: fW, height: fH, fps: fFPS } = format;
  const esc = (t) => t.replace(/\\/g, '\\\\').replace(/'/g, "'\\''");
  const maxWidth = fW * 0.88;

  const titleBase = 120;
  const titleW = measureTextWidth(BEBAS_FONT, titleBase, title);
  const titleSize = titleW > maxWidth ? Math.max(48, Math.floor(titleBase * maxWidth / titleW)) : titleBase;

  const subBase = 44;
  const subW = measureTextWidth(SERIF_FONT, subBase, subtitle);
  const subSize = subW > maxWidth ? Math.max(24, Math.floor(subBase * maxWidth / subW)) : subBase;

  const dt1 = `drawtext=text='${esc(title)}':fontfile='${BEBAS_FONT}':fontcolor=${CREAM}:fontsize=${titleSize}:x=(w-text_w)/2:y=h*0.44`;
  const dt2 = `drawtext=text='${esc(subtitle)}':fontfile='${SERIF_FONT}':fontcolor=${AMBER}:fontsize=${subSize}:x=(w-text_w)/2:y=h*0.44+${titleSize}+40`;

  await execAsync('ffmpeg', [
    '-y',
    '-f', 'lavfi', '-i', `color=c=${NAVY_BG.replace('0x', '#')}:s=${fW}x${fH}:r=${fFPS}:d=${durationSec}`,
    '-vf', `${dt1},${dt2},format=yuv420p`,
    '-t', String(durationSec),
    '-c:v', 'libx264', '-preset', 'fast', '-pix_fmt', 'yuv420p',
    outPath,
  ]);
}

// ── Layered sound design ──────────────────────────────────────────────────
//
// Each layer is rendered as its own silence-padded track spanning the WHOLE
// video (so they can just be amix'd together), built from real audio-kit
// files looped/trimmed into their active window with gain + fade in/out —
// same primitives audio-mix.js uses, just assembled per-layer here since
// this mix has scene-aware on/off points audio-mix.js's single-bed helper
// doesn't support.

function pad(n) { return n.toFixed(3); }

async function buildLayerTrack({ key, manifest, totalDur, startSec, endSec, gainDb, fadeInSec = 0, fadeOutSec = 0, workDir, tag }) {
  const activeDur = endSec - startSec;
  if (activeDur <= 0) return null;
  if (!manifest[key]) throw new Error(`Audio kit key "${key}" not in manifest`);
  const active = join(workDir, `layer_${tag}_active.wav`);
  await execAsync('ffmpeg', [
    '-y', '-stream_loop', '-1', '-i', manifest[key].url,
    '-t', String(activeDur),
    '-af', [
      `volume=${gainDb}dB`,
      fadeInSec > 0 ? `afade=t=in:st=0:d=${fadeInSec}` : null,
      fadeOutSec > 0 ? `afade=t=out:st=${pad(Math.max(0, activeDur - fadeOutSec))}:d=${fadeOutSec}` : null,
      `aresample=${AR}`, 'aformat=channel_layouts=stereo',
    ].filter(Boolean).join(','),
    '-ar', String(AR), '-ac', String(AC), '-c:a', 'pcm_s16le',
    active,
  ]);

  const out = join(workDir, `layer_${tag}.wav`);
  await execAsync('ffmpeg', [
    '-y', '-i', active,
    '-af', `adelay=${Math.round(startSec * 1000)}|${Math.round(startSec * 1000)},apad,atrim=0:${pad(totalDur)}`,
    '-ar', String(AR), '-ac', String(AC), '-c:a', 'pcm_s16le',
    out,
  ]);
  return out;
}

async function buildOneShotTrack({ key, manifest, totalDur, atSec, gainDb, workDir, tag }) {
  const out = join(workDir, `layer_${tag}.wav`);
  await execAsync('ffmpeg', [
    '-y', '-i', manifest[key].url,
    '-af', `volume=${gainDb}dB,adelay=${Math.round(atSec * 1000)}|${Math.round(atSec * 1000)},apad,atrim=0:${pad(totalDur)}`,
    '-ar', String(AR), '-ac', String(AC), '-c:a', 'pcm_s16le',
    out,
  ]);
  return out;
}

// Mixes all sound-design layers with the video's existing VO track,
// sidechain-ducks the combined bed under VO, loudnorms to -14 LUFS, muxes
// back in. Same duck/loudnorm math as audio-mix.js's buildSimpleMusicBed —
// duplicated locally since those helpers aren't exported.
async function applySoundDesign({ videoPath, soundDesign, sceneMeta, totalDur, outputPath, workDir }) {
  const manifest = loadManifest();
  const layers = [];

  if (soundDesign.hum) {
    const h = soundDesign.hum;
    layers.push(await buildLayerTrack({ key: h.key, manifest, totalDur, startSec: 0, endSec: totalDur, gainDb: h.gain_db ?? -34, workDir, tag: 'hum' }));
  }

  if (soundDesign.bed) {
    const b = soundDesign.bed;
    const startSec = sceneMeta[b.start_scene].startSec;
    const endSec = sceneMeta[b.end_scene].pauseStartInScene != null
      ? sceneMeta[b.end_scene].startSec + sceneMeta[b.end_scene].pauseStartInScene
      : sceneMeta[b.end_scene].startSec;
    layers.push(await buildLayerTrack({
      key: b.key, manifest, totalDur, startSec, endSec,
      gainDb: b.gain_db ?? -20, fadeInSec: b.fade_in_sec ?? 1, workDir, tag: 'bed_rise',
    }));

    if (b.resume_gain_db != null) {
      const resumeStart = sceneMeta[b.end_scene].hitOffsetInScene != null
        ? sceneMeta[b.end_scene].startSec + sceneMeta[b.end_scene].hitOffsetInScene
        : endSec;
      layers.push(await buildLayerTrack({
        key: b.key, manifest, totalDur, startSec: resumeStart, endSec: totalDur,
        gainDb: b.resume_gain_db, fadeInSec: b.resume_fade_in_sec ?? 1.5,
        fadeOutSec: 0.3, workDir, tag: 'bed_resolve',
      }));
    }
  }

  if (soundDesign.heartbeat) {
    const hb = soundDesign.heartbeat;
    const startSec = sceneMeta[hb.start_scene].startSec + (hb.start_offset_sec ?? 0);
    const endSec = sceneMeta[hb.end_scene].pauseStartInScene != null
      ? sceneMeta[hb.end_scene].startSec + sceneMeta[hb.end_scene].pauseStartInScene
      : sceneMeta[hb.end_scene].startSec;
    layers.push(await buildLayerTrack({
      key: hb.key, manifest, totalDur, startSec, endSec,
      gainDb: hb.gain_db ?? -20, fadeInSec: hb.fade_in_sec ?? 1.5, workDir, tag: 'heartbeat',
    }));
  }

  if (soundDesign.hit) {
    const hit = soundDesign.hit;
    const hitScene = sceneMeta.find((s) => s.hitOffsetInScene != null);
    if (hitScene) {
      layers.push(await buildOneShotTrack({
        key: hit.key, manifest, totalDur, atSec: hitScene.startSec + hitScene.hitOffsetInScene,
        gainDb: hit.gain_db ?? -6, workDir, tag: 'hit',
      }));
    }
  }

  const validLayers = layers.filter(Boolean);
  const bedMix = join(workDir, 'bed_mix.wav');
  if (validLayers.length === 1) {
    await execAsync('ffmpeg', ['-y', '-i', validLayers[0], '-c', 'copy', bedMix]);
  } else {
    const inputs = validLayers.flatMap((p) => ['-i', p]);
    const inLabels = validLayers.map((_, i) => `[${i}:a]`).join('');
    await execAsync('ffmpeg', ['-y', ...inputs, '-filter_complex', `${inLabels}amix=inputs=${validLayers.length}:normalize=0[out]`, '-map', '[out]', '-ar', String(AR), '-ac', String(AC), '-c:a', 'pcm_s16le', bedMix]);
  }

  const voPath = join(workDir, 'vo_full.wav');
  await execAsync('ffmpeg', ['-y', '-i', videoPath, '-vn', '-ar', String(AR), '-ac', String(AC), '-c:a', 'pcm_s16le', voPath]);

  const bedDucked = join(workDir, 'bed_ducked.wav');
  await execAsync('ffmpeg', [
    '-y', '-i', bedMix, '-i', voPath,
    '-filter_complex', '[0:a][1:a]sidechaincompress=threshold=0.013:ratio=4:attack=5:release=200:knee=8[out]',
    '-map', '[out]', '-ar', String(AR), '-ac', String(AC), '-c:a', 'pcm_s16le',
    bedDucked,
  ]);

  const premix = join(workDir, 'premix.wav');
  await execAsync('ffmpeg', [
    '-y', '-i', bedDucked, '-i', voPath,
    '-filter_complex', '[0:a][1:a]amix=inputs=2:normalize=0[premix]',
    '-map', '[premix]', '-ar', String(AR), '-ac', String(AC), '-c:a', 'pcm_s16le',
    premix,
  ]);

  // Two-pass loudnorm, -14 LUFS integrated (matches the channel's long-form spec).
  let stderr = '';
  try {
    const { stderr: s } = await execAsync('ffmpeg', ['-i', premix, '-af', 'loudnorm=I=-14:TP=-1.0:LRA=11:print_format=json', '-f', 'null', '/dev/null']);
    stderr = s;
  } catch (e) { stderr = e.stderr ?? ''; }
  const jsonMatch = stderr.match(/\{[\s\S]*"input_i"[\s\S]*\}/);
  const stats = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
  const master = join(workDir, 'master.wav');
  if (stats) {
    await execAsync('ffmpeg', ['-y', '-i', premix, '-af', [
      'loudnorm=I=-14:TP=-1.0:LRA=11:linear=true',
      `measured_I=${stats.input_i}`, `measured_TP=${stats.input_tp}`,
      `measured_LRA=${stats.input_lra}`, `measured_thresh=${stats.input_thresh}`,
      `offset=${stats.target_offset}`,
    ].join(':'), '-ar', String(AR), '-ac', String(AC), '-c:a', 'pcm_s16le', master]);
  } else {
    await execAsync('ffmpeg', ['-y', '-i', premix, '-c', 'copy', master]);
  }

  await execAsync('ffmpeg', ['-y', '-i', videoPath, '-i', master, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', String(AR), outputPath]);
}

async function main() {
  const workDir = `/tmp/short-rewrite-v2-${Date.now()}`;
  mkdirSync(workDir, { recursive: true });
  console.log(`Working dir: ${workDir}`);

  const scenePaths = [];
  const sceneMeta = []; // { startSec, duration, pauseStartInScene?, pauseEndInScene?, hitOffsetInScene? }
  let cursor = 0;

  for (let i = 0; i < config.scenes.length; i++) {
    const scene = config.scenes[i];
    const n = String(i + 1).padStart(2, '0');

    if (scene.end_card_v2) {
      process.stdout.write(`Scene ${n} [end card v2] "${scene.title}" / "${scene.subtitle}" … `);
      let dur = scene.target_duration_sec;
      let voPath = null;
      if (scene.vo) {
        voPath = join(workDir, `vo_card_${n}.wav`);
        await synthScene(scene.vo, voPath);
        dur = Math.max(scene.target_duration_sec, probeDuration(voPath) + 0.4);
      }
      const cardPath = join(workDir, `card_${n}.mp4`);
      await buildEndCardV2(scene.title, scene.subtitle, dur, cardPath, SHORT_FORMAT);
      let finalCardPath = cardPath;
      if (voPath) {
        const withVo = join(workDir, `card_${n}_vo.mp4`);
        await execAsync('ffmpeg', ['-y', '-i', cardPath, '-i', voPath, '-map', '0:v', '-map', '1:a', '-t', String(dur), '-c:v', 'copy', '-af', 'apad', '-c:a', 'aac', '-ar', String(AR), '-ac', '2', withVo]);
        finalCardPath = withVo;
      }
      scenePaths.push(finalCardPath);
      sceneMeta.push({ startSec: cursor, duration: dur });
      cursor += dur;
      console.log(`done (${dur.toFixed(2)}s)`);
      continue;
    }

    process.stdout.write(`Scene ${n} … `);
    let voPath, fullText, pauseStartInScene, hitOffsetInScene;
    if (scene.vo_parts) {
      fullText = scene.vo_parts.join(' ');
      const res = await synthPausedScene(scene.vo_parts, scene.pause_sec ?? 1, join(workDir, `vo_${n}.wav`), workDir, n);
      voPath = res.path;
      pauseStartInScene = res.pauseStartInScene;
      hitOffsetInScene = res.hitOffsetInScene;
    } else {
      fullText = scene.vo;
      voPath = join(workDir, `vo_${n}.wav`);
      await synthScene(scene.vo, voPath);
    }

    let overlays = [];
    if (scene.hook) {
      overlays = [buildHookOverlay(fullText, scene.hook.amber_word, 0, Math.min(3, scene.target_duration_sec))];
    } else {
      const words = await generateWordTimestamps(voPath, join(workDir, `words_${n}.json`), titleCase(fullText));
      const chunks = chunkCaptions(fullText, words);
      overlays = chunks.map((c) => ({
        format: 'tiered',
        tier: 2,
        at_sec: Number(c.start.toFixed(3)),
        duration_sec: Number((c.end - c.start).toFixed(3)),
        words: c.words.map((w) => ({ text: w.text, offset_start: Number((w.start - c.start).toFixed(3)), offset_end: Number((w.end - c.start).toFixed(3)) })),
      }));
    }

    const clip = { scene_n: i + 1, duration_sec: scene.target_duration_sec, overlays, from_sec: 0 };
    const stills = [{ cut: 'A', clip_url: resolve(REPO_ROOT, scene.image), motion: scene.motion ?? 'push', regrade: scene.regrade ?? null, crop_x: scene.crop_x ?? 0.5 }];
    const out = await buildStillsScene(stills, clip, voPath, workDir, { format: SHORT_FORMAT });
    const dur = probeDuration(out);
    scenePaths.push(out);
    sceneMeta.push({ startSec: cursor, duration: dur, pauseStartInScene, pauseEndInScene: pauseStartInScene != null ? pauseStartInScene + (scene.pause_sec ?? 1) : undefined, hitOffsetInScene });
    cursor += dur;
    console.log(`done (${dur.toFixed(2)}s)`);
  }

  const totalDur = cursor;
  console.log(`\nTotal (pre-mux): ${totalDur.toFixed(2)}s`);

  console.log(`Concatenating ${scenePaths.length} scene(s)…`);
  const listPath = join(workDir, '_concat.txt');
  const concatPath = join(workDir, 'concat.mp4');
  writeFileSync(listPath, scenePaths.map((p) => `file '${p}'`).join('\n'));
  await execAsync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', concatPath]);

  let finalPath = concatPath;
  const watermarkPath = resolve(REPO_ROOT, 'assets/logos/underdog_archive_standalone_icon.png');
  if (existsSync(watermarkPath)) {
    console.log('Applying watermark…');
    const wmPath = join(workDir, 'watermarked.mp4');
    await execAsync('ffmpeg', [
      '-y', '-i', finalPath, '-i', watermarkPath,
      '-filter_complex', '[1:v]scale=80:-1,format=rgba,colorchannelmixer=aa=0.4[wm];[0:v][wm]overlay=W-w-20:H-h-20:format=auto',
      '-c:v', 'libx264', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-c:a', 'copy',
      wmPath,
    ]);
    finalPath = wmPath;
  }

  if (config.sound_design) {
    console.log('Applying layered sound design…');
    const mixedPath = join(workDir, 'mixed.mp4');
    await applySoundDesign({ videoPath: finalPath, soundDesign: config.sound_design, sceneMeta, totalDur, outputPath: mixedPath, workDir });
    finalPath = mixedPath;
  }

  const outPath = values.output ? resolve(REPO_ROOT, values.output) : join(dirname(configPath), '..', 'src', config.output);
  mkdirSync(dirname(outPath), { recursive: true });
  await execAsync('ffmpeg', ['-y', '-i', finalPath, '-c', 'copy', outPath]);
  console.log(`\nWrote ${outPath}`);

  if (!values['keep-tmp']) rmSync(workDir, { recursive: true, force: true });
}

main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
