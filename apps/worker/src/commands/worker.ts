import type { Logger } from '../logger.ts';

/**
 * P2.5 — `ss worker` stub: registers a pg-boss handler for the job queue and
 * blocks, running each dispatched job through the same `runJob()` this
 * file's sibling `run-job.ts` exposes for the one-off `ss run-job --id`
 * case. **Full hardening (retries, concurrency limits, graceful shutdown,
 * dead-letter handling, metrics) is explicitly P4's job, not this pass's** —
 * per the plan's own P2.5 bullet ("full hardening in P4"). This is
 * deliberately the minimum that proves the wiring: pg-boss delivers a
 * `{ jobId }` payload, the handler calls the real `runJob()`, done/failed is
 * reported back to pg-boss so it can retry or dead-letter per its own
 * config.
 *
 * **Not run against a real Postgres in this pass** — this sandbox has no
 * live queue to connect to and verifying `pg-boss` itself works is out of
 * scope (it's a well-established library, not new code). `handleJob()` below
 * (the actual per-message logic) is unit-tested directly with a fake
 * `runJob`; the `PgBoss` wiring itself is exercised only by inspection.
 */

export type WorkerOptions = {
  queue: string;
  connectionString: string;
};

export type WorkerDeps = {
  runJob: (jobId: string) => Promise<void>;
  createBoss: (connectionString: string) => Promise<{
    // pg-boss v10 batches: a handler receives an array of jobs, not one.
    work: (
      queue: string,
      handler: (jobs: Array<{ data: { jobId: string } }>) => Promise<void>,
    ) => Promise<unknown>;
    start: () => Promise<unknown>;
  }>;
};

export async function handleJob(
  payload: { jobId: string },
  runJob: WorkerDeps['runJob'],
  logger: Logger,
): Promise<void> {
  logger.info('picked up job from queue', { jobId: payload.jobId });
  try {
    await runJob(payload.jobId);
    logger.info('job completed', { jobId: payload.jobId });
  } catch (err) {
    logger.error('job failed', {
      jobId: payload.jobId,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err; // let pg-boss's own retry/dead-letter policy decide what happens next
  }
}

export async function workerCommand(
  opts: WorkerOptions,
  deps: WorkerDeps,
  logger: Logger,
): Promise<void> {
  const boss = await deps.createBoss(opts.connectionString);
  await boss.start();
  await boss.work(opts.queue, async (jobs) => {
    for (const job of jobs) {
      await handleJob(job.data, deps.runJob, logger);
    }
  });
  logger.info('worker listening', { queue: opts.queue });
  // Intentionally never resolves — pg-boss's `.work()` runs the handler for
  // the lifetime of the process; P4 owns graceful shutdown (SIGTERM
  // draining, etc.).
  await new Promise(() => {});
}
