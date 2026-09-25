import type { Logger } from '../logger.ts';

/**
 * P2.5/P4.1 — `ss worker`: registers a pg-boss handler for the job queue
 * and blocks, running each dispatched job through the same `runJob()`
 * `run-job.ts` exposes for the one-off `ss run-job --id` case.
 *
 * **P4.1 hardening (this pass), per the plan's own bullets:**
 * - `boss.createQueue()` is called on every startup with `retryLimit`/
 *   `retryDelay`/`retryBackoff`/`expireInHours` (defaults 2/60s/true/6h,
 *   matching the plan's own "retry limit 2, backoff 60s → 600s;
 *   expireInHours: 6") — pg-boss v10's real backoff formula is
 *   `retryDelay * 2^retryCount` plus up-to-2x jitter, so with these
 *   defaults the two retries land roughly in the 60–600s range the plan
 *   describes, not an exact schedule (pg-boss has no such literal knob).
 *   `createQueue()` is idempotent (`create_queue()` upserts) — safe to call
 *   every process start, not just the first.
 * - `batchSize: 1` on `work()` is v10's real replacement for the pre-v10
 *   `teamSize` option the plan names (removed upstream) — one job fetched
 *   and processed at a time, matching the plan's intent exactly.
 * - Heartbeat: `deps.heartbeat(jobId)` fires once immediately when a job is
 *   picked up, then every `heartbeatIntervalMs` (default 30s) while
 *   `runJob()` is in flight — matching `jobs.heartbeat_at`'s own purpose
 *   (P4.1's new migration). A heartbeat failure is logged, not fatal — a
 *   transient DB blip touching a liveness column shouldn't abort real work
 *   already in progress.
 * - Reaper: a separate periodic scan (default every 60s) calls
 *   `deps.reapStaleRunning(staleBefore)` — any job still `running` whose
 *   heartbeat is older than `reapStaleAfterMs` (default 10 min, per the
 *   plan) gets marked `failed` by that repo call itself (see
 *   `JobsRepo.reapStaleRunning`'s own header for why). Runs independently
 *   of whether this process is also the one actively working a job — a
 *   worker that died mid-job leaves no *other* worker to reap it otherwise
 *   in a single-worker deployment (P4.2 is one VPS, one worker, to start).
 * - Graceful shutdown: `SIGTERM`/`SIGINT` stop the reaper and call
 *   `boss.stop({graceful: true, timeout: shutdownTimeoutMs})` — pg-boss's
 *   own documented graceful-stop behavior is to stop fetching new work and
 *   wait for whatever's already active to finish (or the timeout, whichever
 *   is first) before resolving. That's the real, honest shape of "finish
 *   the current job" this stack can offer — there is no mid-stage
 *   checkpoint/resume beyond what `StageRunner`'s own skip logic already
 *   provides (P4.1 also fixed a real durability gap in that skip logic
 *   separately, see `packages/core`'s `verifySkip`). A job that was still
 *   `queued` (never dispatched to this process) is untouched by shutdown —
 *   pg-boss never handed it out, so it's still exactly `queued` in the
 *   real sense, not something this command needs to "mark queued" itself.
 *
 * **Real, DB-backed verification of this pass**: run against a real local
 * Postgres (`docker run postgres:16`) with real pg-boss `createQueue`/
 * `send`/`work`/`stop` calls — not faked, see this file's own test suite
 * for the parts that are (`handleJob`'s heartbeat wrapping, the reaper's
 * own query logic) plus the real end-to-end script run separately against
 * a live container and the real Supabase `jobs.heartbeat_at` column.
 *
 * **P4.3 addition**: an optional Healthchecks.io "I'm alive" ping,
 * `deps.pingHealthcheck`, fired on the same interval as the reaper (they
 * share `reapIntervalMs` — both are "is this loop still turning over"
 * checks, no reason for two separate timers). `undefined` when
 * `HEALTHCHECKS_PING_URL` isn't set (`deps.ts`'s own real wiring) — this
 * file never constructs a URL or talks HTTP itself, it only calls whatever
 * `deps` hands it, so a worker with no Healthchecks account configured
 * behaves exactly as before, not with a silently-failing ping loop.
 */

export type WorkerOptions = {
  queue: string;
  connectionString: string;
  retryLimit?: number;
  retryDelaySeconds?: number;
  retryBackoff?: boolean;
  expireInHours?: number;
  heartbeatIntervalMs?: number;
  reapIntervalMs?: number;
  reapStaleAfterMs?: number;
  shutdownTimeoutMs?: number;
};

export type BossQueue = {
  createQueue: (name: string, options?: Record<string, unknown>) => Promise<void>;
  // pg-boss v10 batches: a handler receives an array of jobs, not one.
  work: (
    queue: string,
    options: { batchSize: number },
    handler: (jobs: Array<{ data: { jobId: string } }>) => Promise<void>,
  ) => Promise<unknown>;
  start: () => Promise<unknown>;
  stop: (options?: { graceful?: boolean; timeout?: number }) => Promise<void>;
};

export type WorkerDeps = {
  runJob: (jobId: string) => Promise<void>;
  heartbeat: (jobId: string) => Promise<void>;
  reapStaleRunning: (staleBefore: Date) => Promise<Array<{ id: string }>>;
  createBoss: (connectionString: string) => Promise<BossQueue>;
  // Injectable for tests only — real code always uses the real
  // `process.once`. Defaulted inside `workerCommand`, not here, so every
  // real caller gets the real signal wiring without having to know this
  // exists.
  onSignal?: (signal: 'SIGTERM' | 'SIGINT', handler: () => void) => void;
  // P4.3 — omitted entirely (not just no-op'd) when no Healthchecks.io
  // ping URL is configured; see this file's own header.
  pingHealthcheck?: () => Promise<void>;
};

export async function handleJob(
  payload: { jobId: string },
  deps: Pick<WorkerDeps, 'runJob' | 'heartbeat'>,
  logger: Logger,
  heartbeatIntervalMs = 30_000,
): Promise<void> {
  logger.info('picked up job from queue', { jobId: payload.jobId });

  const beat = () => {
    deps.heartbeat(payload.jobId).catch((err) => {
      logger.error('heartbeat failed (job keeps running)', {
        jobId: payload.jobId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  };
  beat(); // immediately, so heartbeat_at is set the instant processing starts
  const interval = setInterval(beat, heartbeatIntervalMs);

  try {
    await deps.runJob(payload.jobId);
    logger.info('job completed', { jobId: payload.jobId });
  } catch (err) {
    logger.error('job failed', {
      jobId: payload.jobId,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err; // let pg-boss's own retry/dead-letter policy decide what happens next
  } finally {
    clearInterval(interval);
  }
}

// Exported for its own direct test coverage — the reaper's query logic
// (what counts as "stale") is the part worth testing in isolation from the
// setInterval scheduling around it.
export async function reapOnce(
  reapStaleRunning: WorkerDeps['reapStaleRunning'],
  reapStaleAfterMs: number,
  logger: Logger,
): Promise<void> {
  const staleBefore = new Date(Date.now() - reapStaleAfterMs);
  try {
    const reaped = await reapStaleRunning(staleBefore);
    for (const job of reaped) {
      logger.error('reaped stale job (no heartbeat within threshold)', {
        jobId: job.id,
        staleBefore: staleBefore.toISOString(),
      });
    }
  } catch (err) {
    logger.error('reaper tick failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// Exported for its own direct test coverage, same reasoning as `reapOnce`.
export async function pingHealthcheckOnce(
  pingHealthcheck: () => Promise<void>,
  logger: Logger,
): Promise<void> {
  try {
    await pingHealthcheck();
  } catch (err) {
    logger.error('healthcheck ping failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function workerCommand(
  opts: WorkerOptions,
  deps: WorkerDeps,
  logger: Logger,
): Promise<void> {
  const retryLimit = opts.retryLimit ?? 2;
  const retryDelay = opts.retryDelaySeconds ?? 60;
  const retryBackoff = opts.retryBackoff ?? true;
  const expireInHours = opts.expireInHours ?? 6;
  const heartbeatIntervalMs = opts.heartbeatIntervalMs ?? 30_000;
  const reapIntervalMs = opts.reapIntervalMs ?? 60_000;
  const reapStaleAfterMs = opts.reapStaleAfterMs ?? 10 * 60_000;
  const shutdownTimeoutMs = opts.shutdownTimeoutMs ?? 5 * 60_000;
  const onSignal =
    deps.onSignal ??
    ((signal: 'SIGTERM' | 'SIGINT', handler: () => void) => process.once(signal, handler));

  const boss = await deps.createBoss(opts.connectionString);
  await boss.start();
  await boss.createQueue(opts.queue, { retryLimit, retryDelay, retryBackoff, expireInHours });

  const reaperInterval = setInterval(
    () => void reapOnce(deps.reapStaleRunning, reapStaleAfterMs, logger),
    reapIntervalMs,
  );
  const healthcheckInterval = deps.pingHealthcheck
    ? setInterval(() => void pingHealthcheckOnce(deps.pingHealthcheck!, logger), reapIntervalMs)
    : undefined;

  await boss.work(opts.queue, { batchSize: 1 }, async (jobs) => {
    for (const job of jobs) {
      await handleJob(job.data, deps, logger, heartbeatIntervalMs);
    }
  });

  logger.info('worker listening', {
    queue: opts.queue,
    retryLimit,
    retryDelay,
    retryBackoff,
    expireInHours,
    heartbeatIntervalMs,
    reapIntervalMs,
    reapStaleAfterMs,
  });

  await new Promise<void>((resolve) => {
    const shutdown = (signal: 'SIGTERM' | 'SIGINT') => {
      logger.info('shutdown signal received, stopping gracefully', { signal });
      clearInterval(reaperInterval);
      if (healthcheckInterval) clearInterval(healthcheckInterval);
      boss
        .stop({ graceful: true, timeout: shutdownTimeoutMs })
        .then(() => logger.info('worker stopped gracefully'))
        .catch((err) => {
          logger.error('graceful stop failed', {
            error: err instanceof Error ? err.message : String(err),
          });
        })
        .finally(resolve);
    };
    onSignal('SIGTERM', () => shutdown('SIGTERM'));
    onSignal('SIGINT', () => shutdown('SIGINT'));
  });
}
