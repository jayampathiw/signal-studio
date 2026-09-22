import { createHash } from 'node:crypto';
import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { Job, StageDefinition } from '../runner/index.ts';

/**
 * P2.5 — the `tts` stage: synthesises each shot's `voiceover_text` into a
 * WAV file under `<workDir>/vo/<shotId>.wav`. Generalised the same way the
 * `assets` stage (P2.3) was — same `job.workDir` convention, same
 * per-shot-fingerprint idempotency pattern.
 *
 * **Deliberately takes a plain `synthesise` function, not a `TtsProvider`**
 * (`@signal-studio/providers/contracts`): importing that interface would add
 * `packages/core`'s first dependency on `@signal-studio/providers` for a
 * type-only need this doesn't actually have — a bare function signature says
 * everything this stage needs from a provider, and keeps `packages/core`
 * provider-agnostic the same way `stages/assets.ts` never needed to import a
 * stock/storage provider type either. The caller (`apps/worker`'s
 * `run-local`/`run-job` commands, P2.5) binds a real `TtsProvider.synthesise`
 * (whose shape already matches this exactly) or a fake in tests.
 */

export type TtsSynthesiser = (args: {
  text: string;
  voice: string;
  speed: number;
}) => Promise<{ wavPath: string; durationSec: number }>;

export type TtsStageOptions = {
  synthesise: TtsSynthesiser;
  voice: string;
  speed: number;
};

type TtsShot = { id: string; voiceover_text?: string };

export function createTtsStage(opts: TtsStageOptions): StageDefinition {
  return {
    name: 'tts',
    inputsHash(job) {
      const fingerprint = getShots(job).map((s) => ({
        text: s.voiceover_text ?? null,
        voice: opts.voice,
        speed: opts.speed,
      }));
      return createHash('sha256').update(JSON.stringify(fingerprint)).digest('hex').slice(0, 16);
    },
    async run(ctx) {
      const workDir = getWorkDir(ctx.job);
      const shots = getShots(ctx.job);
      const voDir = path.join(workDir, 'vo');
      await mkdir(voDir, { recursive: true });

      const durations: Record<string, number> = {};

      for (const shot of shots) {
        if (ctx.cancelled()) break;
        // Not every shot has narration (e.g. a pure-visual beat) — silently
        // skipping those, same as `blbl.v1.ts`'s adapter treats a shot with
        // no `voiceover_text` as legitimately VO-less, not an error.
        if (!shot.voiceover_text) continue;

        const outFile = path.join(voDir, `${shot.id}.wav`);
        const { wavPath, durationSec } = await opts.synthesise({
          text: shot.voiceover_text,
          voice: opts.voice,
          speed: opts.speed,
        });
        await copyFile(wavPath, outFile);
        durations[shot.id] = durationSec;
      }

      return { outputs: { durations } };
    },
  };
}

function getWorkDir(job: Job): string {
  const workDir = (job as { workDir?: unknown }).workDir;
  if (typeof workDir !== 'string') {
    throw new Error(
      'tts stage: job.workDir is required (a local directory to write vo/<id>.wav into)',
    );
  }
  return workDir;
}

function getShots(job: Job): TtsShot[] {
  const shots = (job.manifest as { shots?: unknown }).shots;
  if (!Array.isArray(shots)) throw new Error('tts stage: job.manifest.shots must be an array');
  return shots as TtsShot[];
}
