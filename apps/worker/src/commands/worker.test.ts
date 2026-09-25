import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  handleJob,
  pingHealthcheckOnce,
  reapOnce,
  workerCommand,
  type BossQueue,
} from './worker.ts';
import { createLogger } from '../logger.ts';

test('handleJob: calls runJob with the payload jobId, resolves on success', async () => {
  const calls: string[] = [];
  await handleJob(
    { jobId: 'job-1' },
    { runJob: async (jobId) => void calls.push(jobId), heartbeat: async () => {} },
    createLogger({ level: 'error' }),
  );
  assert.deepEqual(calls, ['job-1']);
});

test("handleJob: rethrows runJob's error so pg-boss can retry/dead-letter", async () => {
  await assert.rejects(
    () =>
      handleJob(
        { jobId: 'job-1' },
        {
          runJob: async () => {
            throw new Error('render failed');
          },
          heartbeat: async () => {},
        },
        createLogger({ level: 'error' }),
      ),
    /render failed/,
  );
});

test('handleJob: P4.3 — reportError is called with the failure and jobId context, only on failure', async () => {
  const reported: Array<{ err: unknown; context: unknown }> = [];
  await assert.rejects(
    () =>
      handleJob(
        { jobId: 'job-1' },
        {
          runJob: async () => {
            throw new Error('render failed');
          },
          heartbeat: async () => {},
          reportError: (err, context) => reported.push({ err, context }),
        },
        createLogger({ level: 'error' }),
      ),
    /render failed/,
  );
  assert.equal(reported.length, 1);
  assert.equal((reported[0].err as Error).message, 'render failed');
  assert.deepEqual(reported[0].context, { jobId: 'job-1' });

  const reportedOnSuccess: unknown[] = [];
  await handleJob(
    { jobId: 'job-2' },
    {
      runJob: async () => {},
      heartbeat: async () => {},
      reportError: (err) => reportedOnSuccess.push(err),
    },
    createLogger({ level: 'error' }),
  );
  assert.equal(reportedOnSuccess.length, 0);
});

test('handleJob: P4.3 — reportError being omitted does not break a failing job', async () => {
  await assert.rejects(
    () =>
      handleJob(
        { jobId: 'job-1' },
        {
          runJob: async () => {
            throw new Error('render failed');
          },
          heartbeat: async () => {},
        },
        createLogger({ level: 'error' }),
      ),
    /render failed/,
  );
});

test('handleJob: P4.1 — heartbeats immediately, then on the given interval, and stops on completion', async () => {
  const heartbeats: string[] = [];
  let resolveRunJob!: () => void;
  const runJobPromise = new Promise<void>((resolve) => {
    resolveRunJob = resolve;
  });

  const handlePromise = handleJob(
    { jobId: 'job-1' },
    {
      runJob: () => runJobPromise,
      heartbeat: async (jobId) => void heartbeats.push(jobId),
    },
    createLogger({ level: 'error' }),
    10, // heartbeatIntervalMs — short, for a fast test
  );

  // Immediate heartbeat fires synchronously off the call stack (a
  // microtask), before any interval tick.
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(heartbeats.length, 1);

  await new Promise((r) => setTimeout(r, 35));
  assert.ok(heartbeats.length >= 2, `expected multiple heartbeats, got ${heartbeats.length}`);

  const countBeforeCompletion = heartbeats.length;
  resolveRunJob();
  await handlePromise;

  // No heartbeat fires after runJob() resolves — the interval was cleared.
  await new Promise((r) => setTimeout(r, 35));
  assert.equal(heartbeats.length, countBeforeCompletion);
});

test('handleJob: P4.1 — a heartbeat failure is logged, not fatal, and does not stop runJob', async () => {
  let runJobCompleted = false;
  await handleJob(
    { jobId: 'job-1' },
    {
      runJob: async () => {
        runJobCompleted = true;
      },
      heartbeat: async () => {
        throw new Error('db blip');
      },
    },
    createLogger({ level: 'error' }),
  );
  assert.equal(runJobCompleted, true);
});

test('reapOnce: P4.1 — calls reapStaleRunning with a Date threshold matching reapStaleAfterMs', async () => {
  let capturedStaleBefore: Date | undefined;
  const before = Date.now();
  await reapOnce(
    async (staleBefore) => {
      capturedStaleBefore = staleBefore;
      return [];
    },
    600_000,
    createLogger({ level: 'error' }),
  );
  const after = Date.now();

  assert.ok(capturedStaleBefore);
  const expectedRange = [before - 600_000, after - 600_000];
  assert.ok(
    capturedStaleBefore.getTime() >= expectedRange[0] &&
      capturedStaleBefore.getTime() <= expectedRange[1],
    `staleBefore ${capturedStaleBefore.toISOString()} not in expected range`,
  );
});

test('reapOnce: a failure in reapStaleRunning is caught, not thrown', async () => {
  await assert.doesNotReject(() =>
    reapOnce(
      async () => {
        throw new Error('db down');
      },
      600_000,
      createLogger({ level: 'error' }),
    ),
  );
});

test('pingHealthcheckOnce: P4.3 — calls the given ping function', async () => {
  let called = false;
  await pingHealthcheckOnce(
    async () => {
      called = true;
    },
    createLogger({ level: 'error' }),
  );
  assert.equal(called, true);
});

test('pingHealthcheckOnce: a failed ping is caught, not thrown', async () => {
  await assert.doesNotReject(() =>
    pingHealthcheckOnce(
      async () => {
        throw new Error('healthchecks.io unreachable');
      },
      createLogger({ level: 'error' }),
    ),
  );
});

function fakeBoss(overrides: Partial<BossQueue> = {}): {
  boss: BossQueue;
  calls: { createQueue?: unknown[]; work?: unknown[]; stop?: unknown[] };
} {
  const calls: { createQueue?: unknown[]; work?: unknown[]; stop?: unknown[] } = {};
  const boss: BossQueue = {
    async start() {
      return undefined;
    },
    async createQueue(name, options) {
      calls.createQueue = [name, options];
    },
    async work(queue, options, handler) {
      calls.work = [queue, options];
      // Simulate pg-boss immediately delivering one batch.
      await handler([{ data: { jobId: 'job-1' } }]);
    },
    async stop(options) {
      calls.stop = [options];
    },
    ...overrides,
  };
  return { boss, calls };
}

test('workerCommand: P4.1 — createQueue is called with the real retry/expire defaults from the plan', async () => {
  const { boss, calls } = fakeBoss();
  const signalHandlers: Record<string, () => void> = {};

  const runPromise = workerCommand(
    { queue: 'run-job', connectionString: 'postgres://fake' },
    {
      runJob: async () => {},
      heartbeat: async () => {},
      reapStaleRunning: async () => [],
      createBoss: async () => boss,
      onSignal: (signal, handler) => {
        signalHandlers[signal] = handler;
      },
    },
    createLogger({ level: 'error' }),
  );

  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(calls.createQueue, [
    'run-job',
    { retryLimit: 2, retryDelay: 60, retryBackoff: true, expireInHours: 6 },
  ]);
  assert.deepEqual(calls.work?.[1], { batchSize: 1 });

  signalHandlers.SIGTERM();
  await runPromise;
});

test('workerCommand: P4.1 — custom retry/expire options override the defaults', async () => {
  const { boss, calls } = fakeBoss();
  const signalHandlers: Record<string, () => void> = {};

  const runPromise = workerCommand(
    {
      queue: 'run-job',
      connectionString: 'postgres://fake',
      retryLimit: 5,
      retryDelaySeconds: 10,
      retryBackoff: false,
      expireInHours: 1,
    },
    {
      runJob: async () => {},
      heartbeat: async () => {},
      reapStaleRunning: async () => [],
      createBoss: async () => boss,
      onSignal: (signal, handler) => {
        signalHandlers[signal] = handler;
      },
    },
    createLogger({ level: 'error' }),
  );

  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(calls.createQueue, [
    'run-job',
    { retryLimit: 5, retryDelay: 10, retryBackoff: false, expireInHours: 1 },
  ]);

  signalHandlers.SIGTERM();
  await runPromise;
});

test('workerCommand: P4.1 — SIGTERM stops the reaper interval and calls boss.stop({graceful: true})', async () => {
  const { boss, calls } = fakeBoss();
  const signalHandlers: Record<string, () => void> = {};
  let reapCalls = 0;

  const runPromise = workerCommand(
    { queue: 'run-job', connectionString: 'postgres://fake', reapIntervalMs: 5 },
    {
      runJob: async () => {},
      heartbeat: async () => {},
      reapStaleRunning: async () => {
        reapCalls += 1;
        return [];
      },
      createBoss: async () => boss,
      onSignal: (signal, handler) => {
        signalHandlers[signal] = handler;
      },
    },
    createLogger({ level: 'error' }),
  );

  await new Promise((r) => setTimeout(r, 30));
  assert.ok(reapCalls > 0, 'reaper should have ticked before shutdown');

  signalHandlers.SIGTERM();
  await runPromise;

  assert.deepEqual(calls.stop, [{ graceful: true, timeout: 5 * 60_000 }]);

  const reapCallsAtShutdown = reapCalls;
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(reapCalls, reapCallsAtShutdown, 'reaper must not tick again after shutdown');
});

test('workerCommand: P4.1 — every dispatched job gets a real heartbeat while processing', async () => {
  const heartbeats: string[] = [];
  const { boss } = fakeBoss();
  const signalHandlers: Record<string, () => void> = {};

  const runPromise = workerCommand(
    { queue: 'run-job', connectionString: 'postgres://fake' },
    {
      runJob: async () => {},
      heartbeat: async (jobId) => void heartbeats.push(jobId),
      reapStaleRunning: async () => [],
      createBoss: async () => boss,
      onSignal: (signal, handler) => {
        signalHandlers[signal] = handler;
      },
    },
    createLogger({ level: 'error' }),
  );

  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(heartbeats, ['job-1']);

  signalHandlers.SIGTERM();
  await runPromise;
});

test('workerCommand: P4.3 — pings the health check on the reaper interval when pingHealthcheck is supplied', async () => {
  const { boss } = fakeBoss();
  const signalHandlers: Record<string, () => void> = {};
  let pingCalls = 0;

  const runPromise = workerCommand(
    { queue: 'run-job', connectionString: 'postgres://fake', reapIntervalMs: 5 },
    {
      runJob: async () => {},
      heartbeat: async () => {},
      reapStaleRunning: async () => [],
      createBoss: async () => boss,
      pingHealthcheck: async () => {
        pingCalls += 1;
      },
      onSignal: (signal, handler) => {
        signalHandlers[signal] = handler;
      },
    },
    createLogger({ level: 'error' }),
  );

  await new Promise((r) => setTimeout(r, 30));
  assert.ok(pingCalls > 0, 'healthcheck should have pinged before shutdown');

  signalHandlers.SIGTERM();
  await runPromise;

  const pingCallsAtShutdown = pingCalls;
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(
    pingCalls,
    pingCallsAtShutdown,
    'healthcheck ping must not fire again after shutdown',
  );
});

test('workerCommand: P4.3 — no healthcheck interval runs at all when pingHealthcheck is omitted', async () => {
  const { boss } = fakeBoss();
  const signalHandlers: Record<string, () => void> = {};

  const runPromise = workerCommand(
    { queue: 'run-job', connectionString: 'postgres://fake', reapIntervalMs: 5 },
    {
      runJob: async () => {},
      heartbeat: async () => {},
      reapStaleRunning: async () => [],
      createBoss: async () => boss,
      onSignal: (signal, handler) => {
        signalHandlers[signal] = handler;
      },
    },
    createLogger({ level: 'error' }),
  );

  // No assertion possible on "nothing happened" beyond it not throwing —
  // real coverage that pingHealthcheck is optional and safely skippable.
  await new Promise((r) => setTimeout(r, 20));
  signalHandlers.SIGTERM();
  await runPromise;
});
