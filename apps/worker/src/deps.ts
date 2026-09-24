import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createEngineClient } from '@signal-studio/db/client';
import { ArtifactsRepo, JobsRepo, JobStagesRepo, ProjectsRepo } from '@signal-studio/db/repos';
import { createAnthropicProvider } from '@signal-studio/providers/llm-anthropic';
import { createKokoroJsProvider } from '@signal-studio/providers/tts-kokoro-js';
import { getEngine } from '@signal-studio/render-core/engine';
import { compile as compileClipsOverlay } from '@signal-studio/template-clips-overlay/compile';
// Side-effect import: registers the 'remotion' engine with render-core.
import '@signal-studio/render-remotion';

import type { MarkFailedDeps } from './commands/mark-failed.ts';
import type { RunJobDeps } from './commands/run-job.ts';
import type { RunLocalDeps } from './commands/run-local.ts';
import type { UploadDeps } from './commands/upload.ts';
import type { WorkerDeps } from './commands/worker.ts';
import { createPublishProviderFor } from './publish.ts';
import { detectBlackFrames, measureVideo } from './qa-measure.ts';
import { createVisionCheck } from './qa-vision.ts';
import { createStorageProviderFor } from './storage.ts';

/**
 * Real (non-test) dependency wiring for each command — kept in one file so
 * `cli.ts` stays a thin argv/dispatch layer and every command's own file
 * stays testable against fakes without importing any of this (importing
 * `@signal-studio/render-remotion` alone pulls in Remotion's bundler/
 * headless-Chrome toolchain — not something a command's own unit tests
 * should need just to load the module).
 */

function realTts() {
  return createKokoroJsProvider().synthesise;
}

function realRender() {
  return getEngine('remotion').render;
}

export function realRunLocalDeps(): RunLocalDeps {
  return { synthesise: realTts(), compileClipsOverlay, render: realRender() };
}

// P2's T-L gate ("ss run-local on examples/clips-overlay with fakes <
// 3 min"): the `assets` stage still runs for real (ffmpeg is fast against a
// tiny synthetic clip), but TTS synthesis and the Remotion render — the two
// genuinely slow, model/browser-loading steps — are swapped for instant
// stand-ins. This is for checking the pipeline's own wiring quickly during
// development, not for judging real output quality.
export function fakeRunLocalDeps(): RunLocalDeps {
  return {
    async synthesise({ text }) {
      const wavPath = path.join(
        os.tmpdir(),
        `fake-tts-${createHash('sha256').update(text).digest('hex').slice(0, 12)}.wav`,
      );
      await writeFile(wavPath, Buffer.alloc(44)); // a WAV header's worth of silence
      return { wavPath, durationSec: 2 };
    },
    compileClipsOverlay,
    async render(timeline, opts) {
      await mkdir(opts.outputDir, { recursive: true });
      const outputPath = path.join(opts.outputDir, `${timeline.contentId}.mp4`);
      await writeFile(outputPath, `fake render of ${timeline.scenes.length} scene(s)`);
      return outputPath;
    },
  };
}

export function realRunJobDeps(): RunJobDeps {
  const client = createEngineClient();
  return {
    jobsRepo: new JobsRepo(client),
    projectsRepo: new ProjectsRepo(client),
    createArtifactsRepo: (orgId: string) => new ArtifactsRepo(client, orgId),
    createStageStore: (orgId: string) => new JobStagesRepo(client, orgId),
    createStorage: createStorageProviderFor,
    synthesise: realTts(),
    compileClipsOverlay,
    render: realRender(),
    createPublishProviderFor,
    measureVideo,
    detectBlackFrames,
    // `createAnthropicProvider()` validates `ANTHROPIC_KEY` at construction
    // time — deferred inside this closure so it's only ever called (and
    // only ever needs that env var) for a job whose project actually has
    // `qa.visionCheck` set; every other job never touches this at all.
    visionCheck: (localPath: string) => createVisionCheck(createAnthropicProvider())(localPath),
  };
}

export function realUploadDeps(): UploadDeps {
  const client = createEngineClient();
  return {
    jobsRepo: new JobsRepo(client),
    projectsRepo: new ProjectsRepo(client),
    createArtifactsRepo: (orgId: string) => new ArtifactsRepo(client, orgId),
    createStorage: createStorageProviderFor,
  };
}

export function realMarkFailedDeps(): MarkFailedDeps {
  const client = createEngineClient();
  return {
    jobsRepo: new JobsRepo(client),
    createArtifactsRepo: (orgId: string) => new ArtifactsRepo(client, orgId),
  };
}

export function realWorkerDeps(runJob: (jobId: string) => Promise<void>): WorkerDeps {
  return {
    runJob,
    async createBoss(connectionString: string) {
      const PgBoss = (await import('pg-boss')).default;
      return new PgBoss(connectionString);
    },
  };
}
