// Long-form v2 assembler — image-first pipeline.
// Each scene = content_stills cuts animated via Ken Burns + VO + overlays.
// Falls back to the v1 content_clips path when no content_stills rows exist.
//
// Usage:
//   node apps/video/scripts/longform/assemble-longform.mjs --project 29
//   node apps/video/scripts/longform/assemble-longform.mjs --project 29 --scenes 1-13 --no-audio-mix
//   node apps/video/scripts/longform/assemble-longform.mjs --project 29 --keep-tmp

import { parseArgs } from 'util';
import { createWriteStream, mkdirSync, rmSync, writeFileSync, existsSync } from 'fs';
import { join, extname, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import { pipeline } from 'stream/promises';
import { execFile, execSync } from 'child_process';
import { promisify } from 'util';
import { getServiceClient } from '@signal-studio/database';
import { uploadToR2 } from '@signal-studio/media/storage';
import { env } from '@signal-studio/config';
import { buildMotionFilter, buildDrawtext, W, H, FPS } from '../../src/longform/motion.js';
import { SERIF_FONT } from '../../src/longform/fonts.js';
import { buildAudioMix, loadManifest } from '../../src/longform/audio-mix.js';

const execAsync = promisify(execFile);
const AR = 44100;
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../');

const { values } = parseArgs({
  options: {
    project:        { type: 'string' },
    scenes:         { type: 'string' },    // e.g. "1-13" for partial render
    // Audio mix and overlays default OFF — opt in with --audio-mix / --overlays
    'no-audio-mix': { type: 'boolean', default: true },
    'no-overlays':  { type: 'boolean', default: true },
    'audio-mix':    { type: 'boolean', default: false }, // opt-in: enable 4-layer audio mix
    'overlays':     { type: 'boolean', default: false }, // opt-in: enable stamp overlays
    'keep-tmp':     { type: 'boolean', default: false },
    output:         { type: 'string' },    // override final output path
  },
  strict: false,
});

if (!values.project) { console.error('--project <id> required'); process.exit(2); }
const projectId = Number(values.project);
// --audio-mix overrides the default no-mix; --no-audio-mix overrides --audio-mix
const noAudioMix = values['audio-mix'] ? false : values['no-audio-mix'];
const noOverlays = values['overlays'] ? false : values['no-overlays'];
const keepTmp = values['keep-tmp'];

// Scene range filter: --scenes 1-13 or --scenes 5
function parseSceneRange(str) {
  if (!str) return null;
  const m = str.match(/^(\d+)(?:-(\d+))?$/);
  if (!m) return null;
  const from = Number(m[1]);
  const to = m[2] ? Number(m[2]) : from;
  return { from, to };
}
const sceneRange = parseSceneRange(values.scenes);

// ── Helpers ──────────────────────────────────────────────────────────────────

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} downloading ${url}`);
  await pipeline(res.body, createWriteStream(dest));
}

function urlExt(url, fallback = '.png') {
  try { const e = extname(new URL(url).pathname); return e || fallback; }
  catch { return fallback; }
}

function probeDuration(filePath) {
  try {
    return Number(execSync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${filePath}"`,
      { encoding: 'utf-8' },
    ).trim());
  } catch { return 0; }
}

// ── Text card builder ─────────────────────────────────────────────────────────

async function buildTextCard(text, durationSec, out) {
  // Inside single-quoted FFmpeg filter options, ' must be escaped as '\'' (close, escaped, reopen).
  // Using \' instead wrongly closes the quote — the colon doesn't need escaping inside single quotes.
  const safe = text.replace(/\\/g, '\\\\').replace(/'/g, "'\\''");
  const dt = `drawtext=text='${safe}':fontfile='${SERIF_FONT}':fontcolor=white:fontsize=72:x=(w-text_w)/2:y=(h-text_h)/2`;
  await execAsync('ffmpeg', [
    '-y',
    '-f', 'lavfi', '-i', `color=c=black:s=${W}x${H}:r=${FPS}:d=${durationSec}`,
    '-f', 'lavfi', '-i', `anullsrc=r=${AR}:cl=stereo`,
    '-vf', `${dt},format=yuv420p`,
    '-t', String(durationSec),
    '-c:v', 'libx264', '-preset', 'fast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-ar', String(AR), '-ac', '2',
    out,
  ]);
}

// ── Still cut builder (single still → animated clip) ─────────────────────────

async function buildCut(imgPath, motion, durationSec, regrade, overlays, out) {
  const vf = buildMotionFilter({ motion, durationSec, regrade, overlays,
    overlays: (overlays ?? []).map((o) => ({ ...o, font_path: SERIF_FONT })),
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

async function buildStillsScene(stills, clip, voPath, workDir) {
  // F4: VO-length reconciliation
  const plannedDur = clip.duration_sec;
  let voDur = 0;
  if (voPath && existsSync(voPath)) {
    voDur = probeDuration(voPath);
  }
  const sceneDur = Math.max(plannedDur, voDur + 0.4);
  if (sceneDur > plannedDur) {
    console.log(`    [stretch] S${clip.scene_n}: ${plannedDur}s → ${sceneDur.toFixed(2)}s (VO ${voDur.toFixed(2)}s)`);
  }

  const scale = sceneDur / plannedDur;
  const overlays = (noOverlays || !Array.isArray(clip.overlays)) ? [] : clip.overlays;
  const n = String(clip.scene_n).padStart(2, '0');

  // Build each cut
  const cutPaths = [];
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

    // Overlays that fall within this cut's time window
    const cutRelStart = i === 0 ? 0 : (stills[i - 1].end_sec ?? 0) - (stills[0].start_sec ?? 0);
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
    await buildCut(imgPath, still.motion ?? 'push', cutDur, still.regrade ?? null, cutOverlays, cutPath);
    cutPaths.push({ path: cutPath, transition: still.transition ?? 'cut' });
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

  // Attach VO
  const sceneOut = join(workDir, `scene_${n}.mp4`);
  if (voPath && existsSync(voPath)) {
    await execAsync('ffmpeg', [
      '-y',
      '-i', sceneSilentPath,
      '-i', voPath,
      '-map', '0:v', '-map', '1:a',
      '-t', String(sceneDur),
      '-c:v', 'copy',
      '-c:a', 'aac', '-ar', String(AR), '-ac', '2',
      '-shortest',
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
  const inputs = cutPaths.flatMap((c, i) => ['-i', c.path]);
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

async function buildLegacyStill(clip, voPath, workDir) {
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
      '-c:v', 'copy', '-c:a', 'aac', '-ar', String(AR), '-ac', '2',
      '-shortest', sceneOut,
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

async function buildLegacyClip(clip, voPath, workDir) {
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
      '-c:v', 'copy', '-c:a', 'aac', '-ar', String(AR), '-ac', '2',
      '-shortest', sceneOut,
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

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const db = getServiceClient();

  // Load audio_plan from project row
  const { data: projectRow, error: projErr } = await db.from('content_items')
    .select('audio_plan, status').eq('id', projectId).single();
  if (projErr) throw new Error(`DB project fetch: ${projErr.message}`);
  const audioPlan = projectRow?.audio_plan ?? [];

  // Load scenes (content_clips, always the scene-level backbone)
  let clipsQuery = db.from('content_clips')
    .select('id, scene_n, kind, clip_url, vo_url, duration_sec, text_overlay, overlays, sfx, image_source')
    .eq('project_id', projectId)
    .in('status', ['generated', 'passed'])
    .order('scene_n');

  if (sceneRange) {
    clipsQuery = clipsQuery.gte('scene_n', sceneRange.from).lte('scene_n', sceneRange.to);
  }

  const { data: clips, error } = await clipsQuery;
  if (error) throw new Error(`DB clips fetch: ${error.message}`);
  if (!clips?.length) throw new Error('No generated/passed clips for project ' + projectId);

  // Load all content_stills for this project (indexed by scene_n)
  const { data: allStills, error: sErr } = await db
    .from('content_stills')
    .select('id, scene_n, cut, motion, start_sec, end_sec, clip_url, reuse_of, regrade, transition, status')
    .eq('project_id', projectId)
    .in('status', ['generated', 'passed'])
    .order('scene_n')
    .order('cut');
  if (sErr) throw new Error(`DB stills fetch: ${sErr.message}`);

  const stillsByScene = {};
  for (const s of allStills ?? []) {
    if (!stillsByScene[s.scene_n]) stillsByScene[s.scene_n] = [];
    stillsByScene[s.scene_n].push(s);
  }

  // Resolve reuse_of references
  const reuseCache = {};
  for (const stills of Object.values(stillsByScene)) {
    for (const s of stills) {
      if (s.image_source === 'reuse' && s.reuse_of && !s.clip_url) {
        if (!reuseCache[s.reuse_of]) {
          const { data: src } = await db.from('content_stills')
            .select('clip_url').eq('project_id', projectId)
            .like('id', `%${s.reuse_of}%`).maybeSingle();
          reuseCache[s.reuse_of] = src?.clip_url ?? null;
        }
        s.clip_url = reuseCache[s.reuse_of];
      }
    }
  }

  const totalSec = clips.reduce((sum, c) => sum + (c.duration_sec ?? 0), 0);
  const rangeLabel = sceneRange ? ` scenes ${sceneRange.from}-${sceneRange.to}` : '';
  console.log(`Project ${projectId}${rangeLabel} — ${clips.length} scenes, ~${Math.round(totalSec)}s total`);
  console.log(`Resolution: ${W}x${H} @ ${FPS}fps\n`);

  const workDir = join(tmpdir(), `longform-v2-${projectId}-${Date.now()}`);
  mkdirSync(workDir, { recursive: true });
  console.log(`Working dir: ${workDir}\n`);

  try {
    const scenePaths = [];

    for (const clip of clips) {
      const n = String(clip.scene_n).padStart(2, '0');
      const label = `S${n} [${(clip.kind ?? '?').padEnd(11)}]`;

      // ── Download VO if available ──────────────────────────────────────────
      let voPath = null;
      if (clip.vo_url) {
        voPath = join(workDir, `vo_${n}.wav`);
        try { await download(clip.vo_url, voPath); }
        catch (e) { console.warn(`  [warn] ${label} VO download failed: ${e.message}`); voPath = null; }
      }

      // ── Text card / editor build ──────────────────────────────────────────
      if (clip.kind === 'text_card' || clip.kind === 'editor_build') {
        const text = clip.text_overlay ?? 'SILENCED';
        process.stdout.write(`  ${label} "${text.slice(0, 40)}" … `);
        const out = join(workDir, `scene_${n}.mp4`);
        await buildTextCard(text, clip.duration_sec, out);
        scenePaths.push(out);
        console.log('done');
        continue;
      }

      // ── v2 path: content_stills rows exist for this scene ─────────────────
      const sceneStills = stillsByScene[clip.scene_n];
      if (sceneStills?.length) {
        process.stdout.write(`  ${label} ${sceneStills.length} cut(s) … `);
        const out = await buildStillsScene(sceneStills, clip, voPath, workDir);
        scenePaths.push(out);
        console.log('done');
        continue;
      }

      // ── Legacy v1 fallback ────────────────────────────────────────────────
      if (clip.kind === 'still' && clip.clip_url) {
        process.stdout.write(`  ${label} [legacy still] … `);
        const out = await buildLegacyStill(clip, voPath, workDir);
        scenePaths.push(out);
        console.log('done');
        continue;
      }

      if ((clip.kind === 'clip') && clip.clip_url) {
        process.stdout.write(`  ${label} [legacy clip] … `);
        const out = await buildLegacyClip(clip, voPath, workDir);
        scenePaths.push(out);
        console.log('done');
        continue;
      }

      console.warn(`  ${label} SKIPPED — no stills and no clip_url`);
    }

    if (!scenePaths.length) throw new Error('No scenes rendered');

    // ── Concat all scenes ─────────────────────────────────────────────────────
    console.log(`\nConcatenating ${scenePaths.length} scenes…`);
    const listPath = join(workDir, '_concat.txt');
    const concatPath = join(workDir, `concat_${projectId}.mp4`);
    writeFileSync(listPath, scenePaths.map((p) => `file '${p}'`).join('\n'));
    await execAsync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', concatPath]);

    let finalPath = concatPath;

    // ── Audio mix (F5) ────────────────────────────────────────────────────────
    if (!noAudioMix) {
      if (!audioPlan?.segments?.length) {
        console.warn('[warn] No audio_plan on project — skipping audio mix (use --no-audio-mix to suppress)');
      } else {
        console.log('\nBuilding 4-layer audio mix…');
        const mixedPath = join(workDir, `mixed_${projectId}.mp4`);
        // Pass sfx from clips array (content_clips has the sfx column)
        const clipsForMix = clips.map((c) => ({
          scene_n: c.scene_n,
          duration_sec: c.duration_sec,
          sfx: Array.isArray(c.sfx) ? c.sfx : [],
        }));
        const { loudnormStats } = await buildAudioMix({
          concatPath,
          clips: clipsForMix,
          audioPlan: audioPlan.segments,
          outputPath: mixedPath,
          workDir,
        });
        finalPath = mixedPath;
        console.log(`  Loudnorm measured: I=${Number(loudnormStats.input_i).toFixed(1)} → -14.0 LUFS, TP=${Number(loudnormStats.input_tp).toFixed(1)} → -1.0 dBTP`);
      }
    } else {
      console.log('[skip] Audio mix disabled (--no-audio-mix)');
    }

    // ── Watermark overlay ─────────────────────────────────────────────────────
    const wmSrc = resolve(REPO_ROOT, 'assets/logos/underdog_archive_standalone_icon.png');
    if (existsSync(wmSrc)) {
      console.log('\nApplying watermark…');
      const wmPath = join(workDir, `wm_${projectId}.mp4`);
      // Scale icon to 80px wide, 40% opacity, bottom-right with 20px padding
      await execAsync('ffmpeg', [
        '-y',
        '-i', finalPath,
        '-i', wmSrc,
        '-filter_complex',
        '[1:v]scale=80:-1,format=rgba,colorchannelmixer=aa=0.4[wm];[0:v][wm]overlay=W-w-20:H-h-20:format=auto',
        '-c:v', 'libx264', '-preset', 'fast', '-pix_fmt', 'yuv420p',
        '-c:a', 'copy',
        wmPath,
      ]);
      finalPath = wmPath;
      console.log('  Watermark applied');
    } else {
      console.warn(`[warn] Watermark not found at ${wmSrc} — skipping`);
    }

    // ── Upload to R2 ──────────────────────────────────────────────────────────
    if (!sceneRange) {
      const userOut = values.output;
      if (userOut) {
        const { copyFileSync } = await import('fs');
        copyFileSync(finalPath, userOut);
        console.log(`\nSaved locally: ${userOut}`);
      } else {
        console.log('Uploading to R2…');
        const r2Key = `longform/${projectId}/final.mp4`;
        const videoUrl = await uploadToR2(finalPath, { key: r2Key });
        const { error: updErr } = await db.from('content_items')
          .update({ rendered_video_url: videoUrl, status: 'rendered' }).eq('id', projectId);
        if (updErr) throw new Error(`DB update: ${updErr.message}`);
        console.log(`\n✓ Assembly complete`);
        console.log(`  URL: ${videoUrl}`);
        console.log(JSON.stringify({ id: projectId, rendered_video_url: videoUrl }));
      }
    } else {
      // Partial render — keep file local for review
      const outPath = values.output ?? join(REPO_ROOT, `temp/longform/${projectId}-scenes-${values.scenes}.mp4`);
      mkdirSync(dirname(outPath), { recursive: true });
      const { copyFileSync } = await import('fs');
      copyFileSync(finalPath, outPath);
      console.log(`\n✓ Partial render: ${outPath}`);
    }

  } finally {
    if (keepTmp) {
      console.log(`\nTemp dir kept: ${workDir}`);
    } else {
      rmSync(workDir, { recursive: true, force: true });
    }
  }
}

main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
