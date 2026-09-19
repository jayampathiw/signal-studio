import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import type { Job, StageDefinition } from '../runner/index.ts';

const execFileAsync = promisify(execFile);

export class MissingAssetsError extends Error {
  missing: Array<{ shotId: string; file: string }>;

  constructor(missing: Array<{ shotId: string; file: string }>) {
    super(`Missing raw clip(s): ${missing.map((m) => `${m.shotId} (${m.file})`).join(', ')}`);
    this.name = 'MissingAssetsError';
    this.missing = missing;
  }
}

export type AssetsStageOptions = {
  targetWidth?: number;
  targetHeight?: number;
  targetFps?: number;
};

type AssetsShot = { id: string; clip?: string; audio?: { strip_native_audio?: boolean } };

/**
 * P2.3 — the `assets` stage, generalised from P0.8-03's `prep.ts` (verified
 * working there against real clips): probes, normalises (scale/pad/fps/
 * pix_fmt/codec), and generates a 3-frame QA contact sheet per shot's clip.
 * Idempotent per shot via a content fingerprint sidecar file, same technique
 * as the pilot script — `inputsHash()` (used by `StageRunner` to skip the
 * whole stage) only fingerprints the manifest's clip refs + strip flags
 * (synchronous, no disk I/O), while this per-shot sidecar handles a partial
 * rerun after a mid-stage failure.
 *
 * Expects `job.workDir` (a local directory laid out like the pilot's:
 * `<workDir>/clips/raw/<clip>` in, `<workDir>/clips/<clip>` +
 * `<workDir>/qa/<shotId>.png` out) — how that directory gets populated
 * (local `ss run-local`, or clips downloaded from job asset uploads in the
 * DB-backed `ss run-job`, P2.5) is a runtime concern this stage doesn't
 * need to know about.
 *
 * **Known gap, flagged rather than silently worked around**: the plan's own
 * P2.3 bullet says a missing clip should send the job to `awaiting_assets`,
 * but P1.2's job state machine (`packages/core/src/state/index.ts`) only
 * allows `awaiting_assets` as a transition *from* `created` — not from
 * `running`, which is where this stage executes. A stage running mid-job
 * can't legally trigger that transition today. This throws a distinct
 * `MissingAssetsError` (carrying the missing shot/file list) instead of a
 * generic failure, so whichever caller wires this stage into `ss run-job`
 * can decide how to surface it — including whether P1.2's transition table
 * needs an added `running → awaiting_assets` edge, which isn't this stage's
 * call to make unilaterally.
 */
export function createAssetsStage(opts: AssetsStageOptions = {}): StageDefinition {
  const targetW = opts.targetWidth ?? 1080;
  const targetH = opts.targetHeight ?? 1920;
  const targetFps = opts.targetFps ?? 30;

  return {
    name: 'assets',
    inputsHash(job) {
      const fingerprint = getShots(job).map((s) => ({
        clip: s.clip,
        strip: s.audio?.strip_native_audio ?? false,
      }));
      return createHash('sha256').update(JSON.stringify(fingerprint)).digest('hex').slice(0, 16);
    },
    async run(ctx) {
      const workDir = getWorkDir(ctx.job);
      const shots = getShots(ctx.job);
      const rawDir = path.join(workDir, 'clips', 'raw');
      const clipsDir = path.join(workDir, 'clips');
      const qaDir = path.join(workDir, 'qa');
      await mkdir(clipsDir, { recursive: true });
      await mkdir(qaDir, { recursive: true });

      const missing = shots
        .map((s) => ({ shotId: s.id, file: path.join(rawDir, requireClip(s)) }))
        .filter(({ file }) => !existsSync(file));
      if (missing.length > 0) throw new MissingAssetsError(missing);

      const durations: Record<string, number> = {};

      for (const shot of shots) {
        if (ctx.cancelled()) break;
        const clip = requireClip(shot);
        const rawFile = path.join(rawDir, clip);
        const outFile = path.join(clipsDir, clip);
        const qaFile = path.join(qaDir, `${shot.id}.png`);
        const hashFile = path.join(clipsDir, `.${shot.id}.hash`);
        const stripAudio = shot.audio?.strip_native_audio ?? false;

        const fingerprint = `${await fileFingerprint(rawFile)}:${stripAudio}`;
        let cached = false;
        try {
          const prev = await readFile(hashFile, 'utf8');
          if (prev === fingerprint && existsSync(outFile)) cached = true;
        } catch {
          cached = false;
        }

        if (!cached) {
          await normaliseClip(rawFile, outFile, stripAudio, { targetW, targetH, targetFps });
          await writeFile(hashFile, fingerprint);
        }

        const durationS = await ffprobeDuration(outFile);
        durations[shot.id] = durationS;

        if (!cached || !existsSync(qaFile)) {
          await contactSheet(outFile, durationS, qaFile, targetFps);
        }
      }

      return { outputs: { durations } };
    },
  };
}

function getWorkDir(job: Job): string {
  const workDir = (job as { workDir?: unknown }).workDir;
  if (typeof workDir !== 'string') {
    throw new Error(
      'assets stage: job.workDir is required (a local directory with clips/raw/<clip> inputs)',
    );
  }
  return workDir;
}

function getShots(job: Job): AssetsShot[] {
  const shots = (job.manifest as { shots?: unknown }).shots;
  if (!Array.isArray(shots)) throw new Error('assets stage: job.manifest.shots must be an array');
  return shots as AssetsShot[];
}

function requireClip(shot: AssetsShot): string {
  if (!shot.clip) {
    throw new Error(`assets stage: shot "${shot.id}" has no clip — nothing to normalise`);
  }
  return shot.clip;
}

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

async function normaliseClip(
  rawFile: string,
  outFile: string,
  stripAudio: boolean,
  target: { targetW: number; targetH: number; targetFps: number },
) {
  const { targetW, targetH, targetFps } = target;
  const vf = `scale=${targetW}:${targetH}:force_original_aspect_ratio=decrease,pad=${targetW}:${targetH}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${targetFps}`;
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

async function contactSheet(
  clipFile: string,
  durationS: number,
  qaFile: string,
  targetFps: number,
) {
  const mid = durationS / 2;
  // The 1/targetFps term (dropped by accident in an earlier draft of this
  // adaptation, then caught by a test using short synthetic clips) leaves
  // one frame's worth of margin before the container's reported duration —
  // without it, a near-end trim window can land entirely past the last
  // actual video frame's PTS and silently produce a zero-frame (empty)
  // output. Real production clips are long enough that this rarely bites,
  // but short/edge-duration ones hit it reliably.
  const nearEnd = Math.max(0, durationS - 1 / targetFps - 0.05);
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
