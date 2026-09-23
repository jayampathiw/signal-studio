// P3.1 — the `ffmpeg` render engine's real `render(timeline)`. Replaces the
// pre-P3.1 index.js/kenburns.js stub (zoompan-based, TODO-flagged, never
// wired to a real caller) with a genuine implementation for the
// `stills-kenburns` template: a scene is either a text card (no `cuts`) or
// a Ken Burns still-cut sequence (`cuts` present) — see timeline.v1.ts's
// own P3.1 schema additions for why those fields exist. Other templates
// (`clips-overlay`, `compilation`) render via `render-remotion`, not this
// engine — `resolveComposition`-style dispatch lives on the *template*
// side (P2.1's render.ts), not here; this engine only ever receives
// `stills-kenburns` timelines.

import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

import { registerEngine } from '@signal-studio/render-core/engine';
import type { TimelineT } from '@signal-studio/core/schemas';

import { buildAudioMix } from './audio-mix.ts';
import { buildStillsScene, buildTextCard } from './stills-render.ts';

const execFileAsync = promisify(execFile);

const ffmpegEngine = {
  name: 'ffmpeg',

  async render(timeline: TimelineT, opts: { outputDir: string }): Promise<string> {
    mkdirSync(opts.outputDir, { recursive: true });
    const workDir = path.join(opts.outputDir, `_work_${timeline.contentId}`);
    mkdirSync(workDir, { recursive: true });

    try {
      const scenePaths: string[] = [];
      for (const scene of timeline.scenes) {
        if (scene.cuts?.length) {
          const out = await buildStillsScene(
            scene.id,
            scene.cuts,
            scene.kenBurnsOverlays ?? [],
            scene.narrationPath,
            workDir,
          );
          scenePaths.push(out);
        } else {
          const out = path.join(workDir, `${scene.id}.mp4`);
          await buildTextCard(scene.captionText ?? '', scene.durationSecs, out, scene.bgImagePath);
          scenePaths.push(out);
        }
      }
      if (!scenePaths.length) throw new Error('render-ffmpeg: timeline has no scenes');

      const concatPath = path.join(workDir, 'concat.mp4');
      if (scenePaths.length === 1) {
        await execFileAsync('ffmpeg', ['-y', '-i', scenePaths[0], '-c', 'copy', concatPath]);
      } else {
        const { writeFileSync } = await import('node:fs');
        const listPath = path.join(workDir, '_concat.txt');
        writeFileSync(listPath, scenePaths.map((p) => `file '${p}'`).join('\n'));
        await execFileAsync('ffmpeg', [
          '-y',
          '-f',
          'concat',
          '-safe',
          '0',
          '-i',
          listPath,
          '-c',
          'copy',
          concatPath,
        ]);
      }

      let finalPath = concatPath;

      if (timeline.musicPlan?.length) {
        const mixedPath = path.join(workDir, 'mixed.mp4');
        const clips = timeline.scenes.map((s) => ({
          scene_n: Number(s.id.replace(/\D/g, '')) || 0,
          duration_sec: s.durationSecs,
          sfx: (s.sfx ?? []).map((e) => ({ key: e.key, at_sec: e.atSec, hold_sec: e.holdSec })),
        }));
        const audioPlan = timeline.musicPlan.map((seg) => ({
          from_sec: seg.fromSec,
          to_sec: seg.toSec,
          track: seg.track,
          gain_db: seg.gainDb,
        }));
        await buildAudioMix({ concatPath, clips, audioPlan, outputPath: mixedPath, workDir });
        finalPath = mixedPath;
      }

      if (timeline.watermark?.path && existsSync(timeline.watermark.path)) {
        const wmPath = path.join(workDir, 'watermarked.mp4');
        const opacity = timeline.watermark.opacity ?? 0.4;
        await execFileAsync('ffmpeg', [
          '-y',
          '-i',
          finalPath,
          '-i',
          timeline.watermark.path,
          '-filter_complex',
          `[1:v]scale=80:-1,format=rgba,colorchannelmixer=aa=${opacity}[wm];[0:v][wm]overlay=W-w-20:H-h-20:format=auto`,
          '-c:v',
          'libx264',
          '-preset',
          'fast',
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'copy',
          wmPath,
        ]);
        finalPath = wmPath;
      }

      const outputPath = path.join(opts.outputDir, `${timeline.contentId}.mp4`);
      await execFileAsync('ffmpeg', ['-y', '-i', finalPath, '-c', 'copy', outputPath]);
      return outputPath;
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  },
};

registerEngine(ffmpegEngine);
export default ffmpegEngine;
