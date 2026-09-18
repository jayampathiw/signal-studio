import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import sharp from 'sharp';

const execFileAsync = promisify(execFile);

// Difference hash (dHash), not DCT-based pHash — simpler to implement
// correctly and just as effective for "did this frame change materially"
// at the tolerances this tool uses. Resize to 9x8 grayscale, compare each
// pixel to its right neighbour: 64 bits.
async function dHash(pngBuffer) {
  const { data } = await sharp(pngBuffer)
    .resize(9, 8, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let bits = '';
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const left = data[row * 9 + col];
      const right = data[row * 9 + col + 1];
      bits += left < right ? '1' : '0';
    }
  }
  return bits;
}

export function hammingDistance(a, b) {
  if (a.length !== b.length) throw new Error('hash length mismatch');
  let dist = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) dist++;
  return dist;
}

// Extracts `count` evenly spaced frames (avoiding the very first/last instant)
// and returns their dHash strings.
export async function sampleFrameHashes(mp4Path, durationSecs, count = 10) {
  const dir = await mkdtemp(join(tmpdir(), 'golden-frames-'));
  try {
    const hashes = [];
    for (let i = 0; i < count; i++) {
      const t = (durationSecs * (i + 0.5)) / count;
      const framePath = join(dir, `frame-${i}.png`);
      await execFileAsync('ffmpeg', [
        '-y',
        '-ss',
        t.toFixed(3),
        '-i',
        mp4Path,
        '-frames:v',
        '1',
        '-loglevel',
        'error',
        framePath,
      ]);
      hashes.push(await dHash(await readFile(framePath)));
    }
    return hashes;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
