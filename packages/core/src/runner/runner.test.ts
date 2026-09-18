import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  StageRunner,
  CancelledError,
  type Job,
  type JobStageStore,
  type StageRunRecord,
} from './index.ts';

function makeFakeStore() {
  const runs = new Map<string, StageRunRecord>();
  const logs: string[] = [];

  const key = (jobId: string, stage: string, outputId?: string) =>
    `${jobId}:${stage}:${outputId ?? ''}`;

  const store: JobStageStore = {
    async getLastRun(jobId, stage, outputId) {
      return runs.get(key(jobId, stage, outputId)) ?? null;
    },
    async recordStart() {},
    async recordEnd(jobId, stage, result, outputId) {
      runs.set(key(jobId, stage, outputId), { hash: result.hash, status: result.status });
    },
    async log(jobId, stage, message) {
      logs.push(`${jobId}/${stage}: ${message}`);
    },
  };

  return { store, runs, logs };
}

function job(overrides: Partial<Job> = {}): Job {
  return { id: 'job-1', manifest: { outputs: ['fb'] }, ...overrides };
}

test('full run executes every stage once', async () => {
  const { store } = makeFakeStore();
  const calls: string[] = [];
  const runner = new StageRunner(store)
    .register({ name: 'prep', inputsHash: () => 'h1', run: async () => void calls.push('prep') })
    .register({
      name: 'render',
      inputsHash: () => 'h2',
      run: async () => void calls.push('render'),
    });

  await runner.run(job());
  assert.deepEqual(calls, ['prep', 'render']);
});

test('skips a stage when the hash is unchanged and the last run was done', async () => {
  const { store } = makeFakeStore();
  const calls: string[] = [];
  const runner = new StageRunner(store).register({
    name: 'prep',
    inputsHash: () => 'stable-hash',
    run: async () => void calls.push('ran'),
  });

  await runner.run(job());
  await runner.run(job());
  assert.deepEqual(calls, ['ran']);
});

test('does not skip when the hash changes', async () => {
  const { store } = makeFakeStore();
  let hash = 'h1';
  const calls: string[] = [];
  const runner = new StageRunner(store).register({
    name: 'prep',
    inputsHash: () => hash,
    run: async () => void calls.push(hash),
  });

  await runner.run(job());
  hash = 'h2';
  await runner.run(job());
  assert.deepEqual(calls, ['h1', 'h2']);
});

test('resume after crash: a stage left failed is re-run, not skipped', async () => {
  const { store, runs } = makeFakeStore();
  const calls: string[] = [];
  const runner = new StageRunner(store).register({
    name: 'render',
    inputsHash: () => 'h1',
    run: async () => void calls.push('ran'),
  });

  // Simulate a previous crash: a failed record already exists for this hash.
  runs.set('job-1:render:', { hash: 'h1', status: 'failed' });

  await runner.run(job());
  assert.deepEqual(calls, ['ran']);
});

test('failure mid-way stops later stages and records failed status', async () => {
  const { store, runs } = makeFakeStore();
  const calls: string[] = [];
  const runner = new StageRunner(store)
    .register({ name: 'prep', inputsHash: () => 'h1', run: async () => void calls.push('prep') })
    .register({
      name: 'render',
      inputsHash: () => 'h2',
      run: async () => {
        throw new Error('boom');
      },
    })
    .register({
      name: 'publish',
      inputsHash: () => 'h3',
      run: async () => void calls.push('publish'),
    });

  await assert.rejects(() => runner.run(job()), /boom/);
  assert.deepEqual(calls, ['prep']);
  assert.equal(runs.get('job-1:render:')?.status, 'failed');
  assert.equal(runs.has('job-1:publish:'), false);
});

test('multiOutput stage runs once per manifest output', async () => {
  const { store } = makeFakeStore();
  const seen: (string | undefined)[] = [];
  const runner = new StageRunner(store).register({
    name: 'render',
    multiOutput: true,
    inputsHash: () => 'h1',
    run: async (ctx) => void seen.push(ctx.outputId),
  });

  await runner.run(job({ manifest: { outputs: ['fb', 'ig'] } }));
  assert.deepEqual(seen, ['fb', 'ig']);
});

test('cancellation token is checked before each stage', async () => {
  const { store } = makeFakeStore();
  const calls: string[] = [];
  const runner = new StageRunner(store)
    .register({ name: 'prep', inputsHash: () => 'h1', run: async () => void calls.push('prep') })
    .register({
      name: 'render',
      inputsHash: () => 'h2',
      run: async () => void calls.push('render'),
    });

  let cancelAfterFirst = false;
  await assert.rejects(
    () =>
      runner.run(job(), () => {
        const cancel = cancelAfterFirst;
        cancelAfterFirst = true;
        return cancel;
      }),
    CancelledError,
  );
  assert.deepEqual(calls, ['prep']);
});
