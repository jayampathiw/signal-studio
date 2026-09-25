import { serve } from '@hono/node-server';
import { createEngineClient } from '@signal-studio/db/client';
import { ApiKeysRepo, JobsRepo, JobStagesRepo, ProjectsRepo } from '@signal-studio/db/repos';

import { createApp } from './app.ts';
import { createGithubDispatcher, createQueueDispatcher, type Dispatcher } from './dispatcher.ts';
import { createLogger } from './logger.ts';
import { createErrorReporter } from './sentry.ts';
import { createStorageProviderFor } from './storage.ts';

const client = createEngineClient();
const jobsRepo = new JobsRepo(client);
const logger = createLogger({
  level: (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error' | undefined) ?? 'info',
  json: process.env.LOG_JSON !== 'false',
});

/**
 * P4.1 — `DISPATCH_MODE` selects which real dispatcher the API uses.
 * `github` (the default, unchanged from P2.7) triggers `run-job.yml` via
 * GitHub's `workflow_dispatch` — the plan's own T-G bullet keeps this as
 * the CI/emergency path even once `queue` exists, not something `queue`
 * replaces. `queue` sends straight to pg-boss (`ss worker`'s own real
 * queue, P4.1) — the real production path once P4.2's VPS worker exists.
 * `DISPATCH_QUEUE_CONNECTION_STRING` must point at the **same** Postgres
 * `ss worker --connection-string` uses, and `DISPATCH_QUEUE_NAME` must
 * match its `--queue` value, or a dispatched job is sent into a queue
 * nothing is listening on.
 */
async function createDispatcher(): Promise<Dispatcher> {
  const mode = process.env.DISPATCH_MODE ?? 'github';

  if (mode === 'queue') {
    const connectionString = process.env.DISPATCH_QUEUE_CONNECTION_STRING;
    if (!connectionString) {
      throw new Error('DISPATCH_MODE=queue requires DISPATCH_QUEUE_CONNECTION_STRING');
    }
    const PgBoss = (await import('pg-boss')).default;
    const boss = new PgBoss(connectionString);
    await boss.start();
    return createQueueDispatcher({
      queue: process.env.DISPATCH_QUEUE_NAME ?? 'render-jobs',
      jobsRepo,
      send: (queue, data) => boss.send(queue, data),
    });
  }

  return createGithubDispatcher({
    owner: process.env.GITHUB_REPO_OWNER ?? 'jayampathiw',
    repo: process.env.GITHUB_REPO_NAME ?? 'signal-studio',
    workflowFile: 'run-job.yml',
    ref: process.env.GITHUB_REF ?? 'refactor',
    token: process.env.GITHUB_PAT ?? '',
    jobsRepo,
  });
}

const app = createApp({
  jobsRepo,
  projectsRepo: new ProjectsRepo(client),
  apiKeysRepo: new ApiKeysRepo(client),
  createStorage: createStorageProviderFor,
  dispatcher: await createDispatcher(),
  createJobStagesRepo: (orgId: string) => new JobStagesRepo(client, orgId),
  logger,
  reportError: createErrorReporter(process.env.SENTRY_DSN),
});

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, (info) => {
  logger.info(`signal-studio API listening on :${info.port}`);
});
