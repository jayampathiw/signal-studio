// Long-form v2 assembler — image-first pipeline.
// Each scene = content_stills cuts animated via Ken Burns + VO + overlays.
// Falls back to the v1 content_clips path when no content_stills rows exist.
//
// Usage:
//   node apps/video/scripts/longform/assemble-longform.mjs --project 29
//   node apps/video/scripts/longform/assemble-longform.mjs --project 29 --scenes 1-13 --no-audio-mix
//   node apps/video/scripts/longform/assemble-longform.mjs --project 29 --keep-tmp

import { parseArgs } from 'util';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getServiceClient } from '@signal-studio/database';
import { uploadToR2 } from '@signal-studio/media/storage';
import { env } from '@signal-studio/config';
import { W, H, FPS } from '../../src/longform/motion.js';
import { buildAudioMix, loadManifest } from '../../src/longform/audio-mix.js';
import { getChannel } from '../../src/config/channels.js';
import {
  AR, download, buildTextCard, buildStillsScene, buildLegacyStill, buildLegacyClip,
} from '../../src/longform/render.js';

const execAsync = promisify(execFile);
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

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const db = getServiceClient();

  // Load project row — audio_plan + channel_key (for watermark lookup)
  const { data: projectRow, error: projErr } = await db.from('content_items')
    .select('audio_plan, status, channel_key').eq('id', projectId).single();
  if (projErr) throw new Error(`DB project fetch: ${projErr.message}`);
  const audioPlan = projectRow?.audio_plan ?? [];

  // Resolve watermark from channel config
  let channelWatermarkFile = null;
  if (projectRow?.channel_key) {
    try {
      const ch = getChannel(projectRow.channel_key);
      channelWatermarkFile = ch?.watermarkFile ?? null;
    } catch { /* unknown channel_key — skip watermark */ }
  }

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
        const out = await buildStillsScene(sceneStills, clip, voPath, workDir, { noOverlays });
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
    const wmSrc = channelWatermarkFile
      ? resolve(REPO_ROOT, 'assets/logos', channelWatermarkFile)
      : null;
    if (wmSrc && existsSync(wmSrc)) {
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
    } else if (wmSrc) {
      console.warn(`[warn] Watermark file not found: ${wmSrc} — skipping`);
    } else {
      console.log('[skip] No watermark configured for this channel');
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
