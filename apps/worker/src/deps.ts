import { compile as compileClipsOverlay } from '@signal-studio/template-clips-overlay/compile';
import { createEngineClient } from '@signal-studio/db/client';
import { ArtifactsRepo, JobsRepo, JobStagesRepo, ProjectsRepo } from '@signal-studio/db/repos';
import { getEngine } from '@signal-studio/render-core/engine';
import { createKokoroJsProvider } from '@signal-studio/providers/tts-kokoro-js';
// Side-effect import: registers the 'remotion' engine with render-core.
import '@signal-studio/render-remotion';

import type { RunJobDeps } from './commands/run-job.ts';
import type { RunLocalDeps } from './commands/run-local.ts';
import type { UploadDeps } from './commands/upload.ts';
import type { WorkerDeps } from './commands/worker.ts';
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

export function realWorkerDeps(runJob: (jobId: string) => Promise<void>): WorkerDeps {
  return {
    runJob,
    async createBoss(connectionString: string) {
      const PgBoss = (await import('pg-boss')).default;
      return new PgBoss(connectionString);
    },
  };
}
