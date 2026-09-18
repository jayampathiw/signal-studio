import { spawn } from 'child_process';
import { mkdirSync, existsSync, createWriteStream, copyFileSync, writeFileSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

import axios from 'axios';

const __dirname = dirname(fileURLToPath(import.meta.url));
// 4 levels up from apps/video/src/renderers/ reaches the monorepo root
const ROOT = resolve(__dirname, '../../../..');
const TTS_SCRIPT = resolve(__dirname, 'tts.py');
const FONT = resolve(ROOT, 'assets/fonts/Anton-Regular.ttf');
const LOGOS_DIR = resolve(ROOT, 'assets/logos');
const MUSIC_DIR = resolve(ROOT, 'assets/music');
const OUTPUT_DIR = resolve(ROOT, 'output/reels');

const TAIL = 2; // extra seconds after voice ends for CTA display

function run(cmd, args, label) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    p.stdout.on('data', (d) => process.stdout.write(`[${label}] ${d}`));
    p.stderr.on('data', (d) => process.stderr.write(`[${label}] ${d}`));
    p.on('close', (code) =>
      code === 0 ? res() : rej(new Error(`${label} exited with code ${code}`)),
    );
    p.on('error', rej);
  });
}

function ffprobeDuration(filePath) {
  return new Promise((res, rej) => {
    const p = spawn('ffprobe', [
      '-i',
      filePath,
      '-show_entries',
      'format=duration',
      '-v',
      'quiet',
      '-of',
      'csv=p=0',
    ]);
    let out = '';
    p.stdout.on('data', (d) => {
      out += d;
    });
    p.on('close', () => res(parseFloat(out.trim()) || 0));
    p.on('error', rej);
  });
}

async function downloadFile(url, destPath, attempt = 1) {
  const { unlinkSync } = await import('fs');
  try {
    const writer = createWriteStream(destPath);
    const res = await axios.get(url, { responseType: 'stream', timeout: 120_000 });
    await new Promise((resolveDl, reject) => {
      res.data.pipe(writer);
      writer.on('finish', resolveDl);
      writer.on('error', reject);
      res.data.on('error', reject);
    });
  } catch (err) {
    try {
      unlinkSync(destPath);
    } catch (_) {}
    if (attempt < 3) {
      const delay = attempt * 3000;
      console.warn(
        `[reel] download attempt ${attempt} failed (${err.code || err.message}) — retrying in ${delay / 1000}s`,
      );
      await new Promise((r) => setTimeout(r, delay));
      return downloadFile(url, destPath, attempt + 1);
    }
    throw err;
  }
}

function assertAsset(path, label) {
  if (!existsSync(path)) {
    throw new Error(`Missing ${label}: ${path}\nPlace the file at this path and re-run.`);
  }
}

export async function renderReel(contentItem, channel) {
  const cfg = channel.rendererConfig;
  const {
    mode,
    durationSec: targetDur,
    clipsPerReel,
    music,
    musicVolume,
    voice,
    voiceSpeed,
    captions,
    narration,
    cta,
  } = cfg;
  const watermarkPath = join(LOGOS_DIR, channel.watermarkFile);
  const musicPath = join(MUSIC_DIR, music);

  const workDir = `/tmp/reels/${contentItem.id}`;
  const outPath = join(OUTPUT_DIR, `${contentItem.id}.mp4`);
  mkdirSync(workDir, { recursive: true });
  mkdirSync(OUTPUT_DIR, { recursive: true });

  assertAsset(musicPath, `music file (assets/music/${music})`);
  assertAsset(watermarkPath, `watermark (assets/logos/${channel.watermarkFile})`);
  assertAsset(FONT, 'font (assets/fonts/Anton-Regular.ttf)');

  // ── 1. Download source clips ───────────────────────────────────────────────
  const clips = (contentItem.source_clips || []).slice(0, clipsPerReel);
  if (clips.length === 0) throw new Error(`Content item ${contentItem.id} has no source_clips`);

  const clipPaths = [];
  for (let i = 0; i < clips.length; i++) {
    const p = join(workDir, `clip_${i}.mp4`);
    if (existsSync(p)) {
      console.log(`[reel] clip ${i + 1}/${clips.length} — reusing cached`);
    } else {
      console.log(`[reel] downloading clip ${i + 1}/${clips.length}...`);
      await downloadFile(clips[i].url, p);
    }
    clipPaths.push(p);
  }

  // ── 2. Narration (if enabled) ──────────────────────────────────────────────
  let voicePath = null;
  let srtPath = null;
  let voiceDur = 0;

  if (narration) {
    if (!contentItem.narration_script) {
      throw new Error(
        `narration enabled but content item ${contentItem.id} has no narration_script`,
      );
    }
    voicePath = join(workDir, 'voice.wav');
    if (!existsSync(voicePath)) {
      console.log('[reel] TTS narration...');
      await run(
        'python3',
        [TTS_SCRIPT, contentItem.narration_script, voice, voicePath, String(voiceSpeed)],
        'tts',
      );
    } else {
      console.log('[reel] TTS narration — reusing cached');
    }
    voiceDur = await ffprobeDuration(voicePath);
    console.log(`[reel]   voice duration: ${voiceDur.toFixed(1)}s`);

    if (captions) {
      srtPath = join(workDir, 'voice.srt');
      if (!existsSync(srtPath)) {
        console.log('[reel] subtitles via whisper...');
        await run(
          'whisper',
          [
            voicePath,
            '--model',
            'tiny',
            '--language',
            'en',
            '--output_dir',
            workDir,
            '--output_format',
            'srt',
            '--word_timestamps',
            'True',
          ],
          'whisper',
        );
      } else {
        console.log('[reel] subtitles — reusing cached');
      }
    }
  }

  const totalDur = narration ? voiceDur + TAIL : targetDur;
  const perClip = totalDur / clipPaths.length;
  console.log(
    `[reel] total ${totalDur.toFixed(1)}s, ${clipPaths.length} clips × ${perClip.toFixed(1)}s each`,
  );

  // ── 3. FFmpeg composition ──────────────────────────────────────────────────
  const ffInputs = [];
  for (let i = 0; i < clipPaths.length; i++) ffInputs.push('-i', clipPaths[i]);
  const voiceIdx = clipPaths.length;
  const logoIdx = clipPaths.length + (voicePath ? 1 : 0);
  const musicIdx = logoIdx + 1;

  if (voicePath) ffInputs.push('-i', voicePath);
  ffInputs.push('-i', watermarkPath);
  ffInputs.push('-stream_loop', '-1', '-i', musicPath);

  const f = [];

  for (let i = 0; i < clipPaths.length; i++) {
    f.push(
      `[${i}:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,trim=duration=${perClip.toFixed(3)},setpts=PTS-STARTPTS[vr${i}]`,
    );
  }

  const concatInputs = Array.from({ length: clipPaths.length }, (_, i) => `[vr${i}]`).join('');
  f.push(`${concatInputs}concat=n=${clipPaths.length}:v=1:a=0[vconcat]`);

  let vCurrent = 'vconcat';

  // Watermark (bottom-right, 110px wide)
  f.push(`[${logoIdx}:v]scale=110:-1[logo]`);
  f.push(`[${vCurrent}][logo]overlay=x=W-w-32:y=H-h-32:format=auto[vwm]`);
  vCurrent = 'vwm';

  // CTA overlay — write lines to temp files to avoid FFmpeg escaping issues
  const cta1File = join(workDir, 'cta1.txt');
  const cta2File = join(workDir, 'cta2.txt');
  writeFileSync(cta1File, cta.line1);
  writeFileSync(cta2File, cta.line2);

  const ctaStyle = cfg.ctaStyle || null;
  const ctaStart = narration ? voiceDur : Math.max(0, totalDur - 4);
  const ctaEnable = `'gte(t,${ctaStart.toFixed(2)})'`;
  const hasSubscribe = ctaStyle?.subscribeLine != null;

  const line1FontColor = ctaStyle?.line1FontColor || 'white';
  const line1BorderColor = ctaStyle?.line1BorderColor || 'black@0.85';
  const line2FontColor = ctaStyle?.line2FontColor || 'white';
  const line2BorderColor = ctaStyle?.line2BorderColor || 'black@0.85';

  const fadeAlpha = (start) =>
    ctaStyle?.animation === 'fadein'
      ? `:alpha='if(lt(t,${(start + 0.7).toFixed(2)}),(t-${start.toFixed(2)})/0.7,1)'`
      : '';

  if (hasSubscribe) {
    const cta3File = join(workDir, 'cta3.txt');
    writeFileSync(cta3File, ctaStyle.subscribeLine);
    const subStart = ctaStart + 0.5;
    const subEnable = `'gte(t,${subStart.toFixed(2)})'`;
    const subFontColor = ctaStyle.subscribeLineFontColor || 'white';
    const subBorderColor = ctaStyle.subscribeLineBorderColor || 'black@0.85';

    f.push(
      `[${vCurrent}]drawtext=fontfile=${FONT}:textfile=${cta1File}:fontsize=68:fontcolor=${line1FontColor}:x=(w-tw)/2:y=(h/2)-80:borderw=3:bordercolor=${line1BorderColor}${fadeAlpha(ctaStart)}:enable=${ctaEnable}[vc1]`,
    );
    f.push(
      `[vc1]drawtext=fontfile=${FONT}:textfile=${cta2File}:fontsize=46:fontcolor=${line2FontColor}:x=(w-tw)/2:y=(h/2)+5:borderw=3:bordercolor=${line2BorderColor}${fadeAlpha(ctaStart)}:enable=${ctaEnable}[vc2]`,
    );
    f.push(
      `[vc2]drawtext=fontfile=${FONT}:textfile=${cta3File}:fontsize=40:fontcolor=${subFontColor}:x=(w-tw)/2:y=(h/2)+75:borderw=3:bordercolor=${subBorderColor}${fadeAlpha(subStart)}:enable=${subEnable}[vout]`,
    );
  } else {
    f.push(
      `[${vCurrent}]drawtext=fontfile=${FONT}:textfile=${cta1File}:fontsize=68:fontcolor=${line1FontColor}:x=(w-tw)/2:y=(h/2)-50:borderw=3:bordercolor=${line1BorderColor}${fadeAlpha(ctaStart)}:enable=${ctaEnable}[vc1]`,
    );
    f.push(
      `[vc1]drawtext=fontfile=${FONT}:textfile=${cta2File}:fontsize=46:fontcolor=${line2FontColor}:x=(w-tw)/2:y=(h/2)+30:borderw=3:bordercolor=${line2BorderColor}${fadeAlpha(ctaStart)}:enable=${ctaEnable}[vout]`,
    );
  }

  // Audio
  const fadeOutAt = Math.max(0, totalDur - 2);
  if (voicePath) {
    f.push(`[${voiceIdx}:a]apad=pad_dur=${TAIL}[vpad]`);
    f.push(
      `[${musicIdx}:a]volume=${musicVolume},afade=t=in:st=0:d=1.5,afade=t=out:st=${fadeOutAt.toFixed(2)}:d=2[music]`,
    );
    f.push(`[vpad][music]amix=inputs=2:duration=first[aout]`);
  } else {
    f.push(
      `[${musicIdx}:a]volume=${musicVolume},afade=t=in:st=0:d=1.5,afade=t=out:st=${fadeOutAt.toFixed(2)}:d=2[aout]`,
    );
  }

  console.log('[reel] FFmpeg compositing...');
  await run(
    'ffmpeg',
    [
      '-y',
      ...ffInputs,
      '-filter_complex',
      f.join(';'),
      '-map',
      '[vout]',
      '-map',
      '[aout]',
      '-t',
      String(totalDur),
      '-r',
      '30',
      '-c:v',
      'libx264',
      '-preset',
      'fast',
      '-crf',
      '22',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-movflags',
      '+faststart',
      '-pix_fmt',
      'yuv420p',
      outPath,
    ],
    'ffmpeg',
  );

  const finalDur = await ffprobeDuration(outPath);
  console.log(`[reel] Done → ${outPath} (${finalDur.toFixed(1)}s)`);

  // Copy .srt to output dir alongside the MP4 for platform upload
  let outputSrtPath = null;
  if (srtPath && existsSync(srtPath)) {
    outputSrtPath = join(OUTPUT_DIR, `${contentItem.id}.srt`);
    copyFileSync(srtPath, outputSrtPath);
    console.log(`[reel] Captions → ${outputSrtPath}`);
  }

  return { outputPath: outPath, durationSec: Math.round(finalDur), srtPath: outputSrtPath };
}
