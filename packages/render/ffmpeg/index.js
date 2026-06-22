import { registerEngine } from '@signal-studio/render-core/engine';
import { buildSceneClip } from './kenburns.js';
import { concatClips } from './concat.js';
import { join } from 'path';
import { mkdirSync } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/** @type {import('@signal-studio/render-core/engine').RenderEngine} */
const ffmpegEngine = {
  name: 'ffmpeg',

  async render(timeline, { outputDir }) {
    mkdirSync(outputDir, { recursive: true });

    // 1. Build one clip per scene (Ken Burns on images, pass-through on video clips)
    const clipPaths = await Promise.all(
      timeline.scenes.map((scene, i) =>
        buildSceneClip(scene, join(outputDir, `scene_${i}.mp4`))
      )
    );

    // 2. Concat all scene clips
    const rawConcatPath = join(outputDir, 'concat.mp4');
    await concatClips(clipPaths, rawConcatPath);

    // 3. Apply watermark, CTA, music mix → final output
    const outputPath = join(outputDir, `${timeline.contentId}.mp4`);
    await composeFinal(timeline, rawConcatPath, outputPath);

    return outputPath;
  },
};

registerEngine(ffmpegEngine);
export default ffmpegEngine;

async function composeFinal(timeline, inputPath, outputPath) {
  // TODO: migrate full FFmpeg compose chain from reels-pipeline/src/renderers/reel.js
  // Covers: subtitle burn-in, watermark overlay, CTA text, music mix with fade-out
  const args = ['-i', inputPath, '-c', 'copy', outputPath];
  await execFileAsync('ffmpeg', ['-y', ...args]);
}
