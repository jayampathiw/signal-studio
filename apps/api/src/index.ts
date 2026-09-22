import { serve } from '@hono/node-server';
import { createEngineClient } from '@signal-studio/db/client';
import { ApiKeysRepo, JobsRepo, ProjectsRepo } from '@signal-studio/db/repos';

import { createApp } from './app.ts';
import { createGithubDispatcher } from './dispatcher.ts';
import { createStorageProviderFor } from './storage.ts';

const client = createEngineClient();
const jobsRepo = new JobsRepo(client);

const app = createApp({
  jobsRepo,
  projectsRepo: new ProjectsRepo(client),
  apiKeysRepo: new ApiKeysRepo(client),
  createStorage: createStorageProviderFor,
  dispatcher: createGithubDispatcher({
    owner: process.env.GITHUB_REPO_OWNER ?? 'jayampathiw',
    repo: process.env.GITHUB_REPO_NAME ?? 'signal-studio',
    workflowFile: 'run-job.yml',
    ref: process.env.GITHUB_REF ?? 'refactor',
    token: process.env.GITHUB_PAT ?? '',
    jobsRepo,
  }),
});

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, (info) => {
  // Startup banner, not an error path — CLAUDE.md's console rule is about
  // production request-handling code, not a one-line "the server is up" log.
  console.error(`signal-studio API listening on :${info.port}`);
});
