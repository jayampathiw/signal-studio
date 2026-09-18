// Extracts sample frames from a video URL using ffmpeg.
// Downloads the clip to a temp file, extracts N evenly-spaced frames as JPEGs,
// returns their paths. Caller is responsible for cleanup.
//
// Phase 5 look-gate uses these frames: the interactive Claude Code session reads
// them with the Read (image) tool since the reseller proxy can't do vision.

import { execFile } from 'child_process';
import { createWriteStream } from 'fs';
import { mkdtemp, mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { pipeline } from 'stream/promises';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Download a URL to a temp file. Returns the local path.
 * @param {string} url
 * @param {string} destPath
 */
async function downloadTo(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${url} → HTTP ${res.status}`);
  const dest = createWriteStream(destPath);
  // Node 18+ fetch returns a Web ReadableStream; pipeline needs a Node stream.
  await pipeline(res.body, dest);
}

/**
 * Extract N evenly-spaced frames from a video, returned as JPEG paths.
 *
 * @param {{ clipUrl: string, sceneN: number, frameCount?: number, outDir?: string }} opts
 * @returns {Promise<{ framePaths: string[], clipPath: string, tempDir: string }>}
 */
export async function extractFrames({ clipUrl, sceneN, frameCount = 3, outDir }) {
  // Probe the duration first so we can place frames evenly.
  const dir = outDir ?? (await mkdtemp(join(tmpdir(), `ss-clip-${sceneN}-`)));
  await mkdir(dir, { recursive: true });

  const clipPath = join(dir, `scene_${sceneN}.mp4`);
  await downloadTo(clipUrl, clipPath);

  // Get duration via ffprobe.
  let duration = 5;
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      clipPath,
    ]);
    duration = parseFloat(stdout.trim()) || 5;
  } catch {
    /* fall back to 5s */
  }

  // Frame timestamps: evenly spaced at 10%, 50%, 90% (or more if frameCount > 3)
  const framePaths = [];
  for (let i = 0; i < frameCount; i++) {
    const frac = frameCount === 1 ? 0.5 : (i / (frameCount - 1)) * 0.8 + 0.1;
    const ts = (duration * frac).toFixed(2);
    const framePath = join(dir, `frame_${String(i + 1).padStart(2, '0')}.jpg`);
    await execFileAsync('ffmpeg', [
      '-y',
      '-ss',
      ts,
      '-i',
      clipPath,
      '-vframes',
      '1',
      '-q:v',
      '3',
      '-vf',
      'scale=960:-2', // scale to 960px wide, keep AR
      framePath,
    ]);
    framePaths.push(framePath);
  }

  return { framePaths, clipPath, tempDir: dir };
}

export default { extractFrames };
