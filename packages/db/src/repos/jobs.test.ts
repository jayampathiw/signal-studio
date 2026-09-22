import assert from 'node:assert/strict';
import { test } from 'node:test';

import { JobsRepo } from './jobs.ts';

// Only `listByProject`/`markDispatched` are covered here (what this pass
// added) — `create`/`updateStatus`/`getById` had no test coverage before
// this file existed either; not backfilled, out of this task's scope.

test('listByProject: filters by org_id and project_id, orders newest first', async () => {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const chain = {
    select: (...args: unknown[]) => {
      calls.push({ method: 'select', args });
      return chain;
    },
    eq: (...args: unknown[]) => {
      calls.push({ method: 'eq', args });
      return chain;
    },
    order: (...args: unknown[]) => {
      calls.push({ method: 'order', args });
      return Promise.resolve({ data: [{ id: 'job-1' }], error: null });
    },
  };
  const client = { from: () => chain };
  const repo = new JobsRepo(client as never);

  const rows = await repo.listByProject('org-1', 'proj-1');

  assert.deepEqual(
    calls.filter((c) => c.method === 'eq').map((c) => c.args),
    [
      ['org_id', 'org-1'],
      ['project_id', 'proj-1'],
    ],
  );
  assert.deepEqual(calls.find((c) => c.method === 'order')?.args, [
    'created_at',
    { ascending: false },
  ]);
  assert.deepEqual(rows, [{ id: 'job-1' }]);
});

test('markDispatched: only updates rows currently queued, returns true when it wins', async () => {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const chain = {
    update: (...args: unknown[]) => {
      calls.push({ method: 'update', args });
      return chain;
    },
    eq: (...args: unknown[]) => {
      calls.push({ method: 'eq', args });
      return chain;
    },
    select: async (...args: unknown[]) => {
      calls.push({ method: 'select', args });
      return { data: [{ id: 'job-1' }], error: null };
    },
  };
  const client = { from: () => chain };
  const repo = new JobsRepo(client as never);

  const won = await repo.markDispatched('job-1');

  assert.equal(won, true);
  assert.deepEqual(
    calls.filter((c) => c.method === 'eq').map((c) => c.args),
    [
      ['id', 'job-1'],
      ['status', 'queued'],
    ],
  );
});

test('markDispatched: returns false when no row matched (already dispatched by a racer)', async () => {
  const chain = {
    update: () => chain,
    eq: () => chain,
    select: async () => ({ data: [], error: null }),
  };
  const client = { from: () => chain };
  const repo = new JobsRepo(client as never);

  assert.equal(await repo.markDispatched('job-1'), false);
});
