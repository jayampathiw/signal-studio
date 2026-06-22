import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Render one scene to an MP4 clip.
 * Static images get a Ken Burns (zoompan) animation; video clips pass through.
 *
 * @param {import('@signal-studio/types/timeline').TimelineScene} scene
 * @param {string} outputPath
 * @returns {Promise<string>}
 */
export async function buildSceneClip(scene, outputPath) {
  if (scene.source.type === 'video') {
    return trimClip(scene.source.localPath, scene.durationSecs, outputPath);
  }
  return applyKenBurns(scene.source.localPath, scene.durationSecs, outputPath);
}

async function applyKenBurns(imagePath, durationSecs, outputPath) {
  // TODO: migrate zoompan filter from reels-pipeline/src/renderers/reel.js
  // Randomises zoom direction per scene; result is 1080×1920 H.264
  const fps = 25;
  const totalFrames = durationSecs * fps;
  const zoompan = `zoompan=z='min(zoom+0.0015,1.5)':d=${totalFrames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=${fps}`;

  await execFileAsync('ffmpeg', [
    '-y', '-loop', '1', '-i', imagePath,
    '-vf', zoompan,
    '-t', String(durationSecs),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    outputPath,
  ]);
  return outputPath;
}

async function trimClip(clipPath, durationSecs, outputPath) {
  await execFileAsync('ffmpeg', [
    '-y', '-i', clipPath,
    '-t', String(durationSecs),
    '-c', 'copy',
    outputPath,
  ]);
  return outputPath;
}
