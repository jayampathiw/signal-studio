import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { Pack } from '../src/manifest.ts';

const execFileAsync = promisify(execFile);

const TARGET_W = 1080;
const TARGET_H = 1920;
const TARGET_FPS = 30;

async function ffprobeDuration(file: string): Promise<number> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    file,
  ]);
  return parseFloat(stdout.trim());
}

async function fileFingerprint(file: string): Promise<string> {
  const s = await stat(file);
  return createHash('sha256').update(`${s.size}:${s.mtimeMs}`).digest('hex').slice(0, 16);
}

async function normaliseClip(rawFile: string, outFile: string, stripAudio: boolean) {
  const vf = `scale=${TARGET_W}:${TARGET_H}:force_original_aspect_ratio=decrease,pad=${TARGET_W}:${TARGET_H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${TARGET_FPS}`;
  const args = [
    '-y',
    '-i',
    rawFile,
    '-vf',
    vf,
    '-pix_fmt',
    'yuv420p',
    '-c:v',
    'libx264',
    '-crf',
    '18',
  ];
  if (stripAudio) {
    args.push('-an');
  } else {
    args.push('-c:a', 'aac', '-ar', '48000', '-ac', '2');
  }
  args.push(outFile);
  await execFileAsync('ffmpeg', args);
}

async function contactSheet(clipFile: string, durationS: number, qaFile: string) {
  const mid = durationS / 2;
  const nearEnd = Math.max(0, durationS - 1 / TARGET_FPS - 0.05);
  const filter =
    `[0:v]trim=start=0:end=0.04,setpts=PTS-STARTPTS,scale=320:-1[a];` +
    `[0:v]trim=start=${mid}:end=${mid + 0.04},setpts=PTS-STARTPTS,scale=320:-1[b];` +
    `[0:v]trim=start=${nearEnd}:end=${nearEnd + 0.04},setpts=PTS-STARTPTS,scale=320:-1[c];` +
    `[a][b][c]hstack=inputs=3[out]`;
  await execFileAsync('ffmpeg', [
    '-y',
    '-i',
    clipFile,
    '-filter_complex',
    filter,
    '-map',
    '[out]',
    '-frames:v',
    '1',
    qaFile,
  ]);
}

async function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: npm run prep <pack-dir>');
    process.exit(1);
  }

  const packPath = path.join(dir, 'pack.json');
  const raw = JSON.parse(await readFile(packPath, 'utf8'));
  const parsed = Pack.parse(raw);

  const rawDir = path.join(dir, 'clips', 'raw');
  const clipsDir = path.join(dir, 'clips');
  const qaDir = path.join(dir, 'qa');
  await mkdir(clipsDir, { recursive: true });
  await mkdir(qaDir, { recursive: true });

  // Fail loudly up front if any referenced clip is missing — don't partially process.
  const missing = parsed.shots
    .map((s) => ({ id: s.id, file: path.join(rawDir, s.clip_file) }))
    .filter(({ file }) => !existsSync(file));
  if (missing.length) {
    console.error('Missing raw clip(s):');
    for (const m of missing) console.error(`  - ${m.id}: ${m.file}`);
    process.exit(1);
  }

  for (let i = 0; i < parsed.shots.length; i++) {
    const shot = parsed.shots[i];
    const rawFile = path.join(rawDir, shot.clip_file);
    const outFile = path.join(clipsDir, shot.clip_file);
    const qaFile = path.join(qaDir, `${shot.id}.png`);
    const hashFile = path.join(clipsDir, `.${shot.id}.hash`);
    const stripAudio = shot.audio.strip_native_audio;

    const fingerprint = `${await fileFingerprint(rawFile)}:${stripAudio}`;

    let cached = false;
    try {
      const prev = await readFile(hashFile, 'utf8');
      if (prev === fingerprint && existsSync(outFile)) cached = true;
    } catch {
      cached = false;
    }

    if (cached) {
      console.log(`  ${shot.id}: skipped (unchanged)`);
    } else {
      console.log(`  ${shot.id}: normalising (strip_audio=${stripAudio})...`);
      await normaliseClip(rawFile, outFile, stripAudio);
      await writeFile(hashFile, fingerprint);
    }

    const durationS = await ffprobeDuration(outFile);

    if (!cached || !existsSync(qaFile)) {
      await contactSheet(outFile, durationS, qaFile);
    }

    raw.shots[i] = { ...raw.shots[i], duration_s: durationS };
  }

  await writeFile(packPath, JSON.stringify(raw, null, 2) + '\n');

  console.log(`\nPrepped ${parsed.shots.length} clip(s) into ${clipsDir}`);
  console.log(`QA contact sheets in ${qaDir}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
});
