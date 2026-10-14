import assert from 'node:assert/strict';
import { test } from 'node:test';

import { GenerationAttemptsRepo } from './generation-attempts.ts';

test('create: inserts a scoped row and returns it', async () => {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const chain = {
    insert: (...args: unknown[]) => {
      calls.push({ method: 'insert', args });
      return chain;
    },
    select: () => chain,
    single: async () => ({ data: { id: 'ga-1' }, error: null }),
  };
  const client = { from: () => chain };
  const repo = new GenerationAttemptsRepo(client as never);

  const row = await repo.create('org-1', {
    projectId: 'proj-1',
    shotPurpose: 'wildlife-b-roll',
    succeeded: false,
    note: 'blurry frame',
  });

  assert.deepEqual(calls[0].args, [
    {
      org_id: 'org-1',
      project_id: 'proj-1',
      job_id: null,
      shot_purpose: 'wildlife-b-roll',
      succeeded: false,
      note: 'blurry frame',
      created_by: null,
    },
  ]);
  assert.equal(row.id, 'ga-1');
});

test('weeklyReport: groups by shot_purpose, sorts by most failures first', async () => {
  const rows = [
    { shot_purpose: 'a-roll', succeeded: true },
    { shot_purpose: 'a-roll', succeeded: false },
    { shot_purpose: 'b-roll', succeeded: false },
    { shot_purpose: 'b-roll', succeeded: false },
    { shot_purpose: 'b-roll', succeeded: true },
  ];
  const chain = {
    select: () => chain,
    eq: () => chain,
    gte: async () => ({ data: rows, error: null }),
  };
  const client = { from: () => chain };
  const repo = new GenerationAttemptsRepo(client as never);

  const report = await repo.weeklyReport('org-1', 'proj-1');

  assert.deepEqual(report, [
    { shot_purpose: 'b-roll', attempts: 3, succeeded: 1, failed: 2 },
    { shot_purpose: 'a-roll', attempts: 2, succeeded: 1, failed: 1 },
  ]);
});

test('weeklyReport: empty when nothing was attempted in the window', async () => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    gte: async () => ({ data: [], error: null }),
  };
  const client = { from: () => chain };
  const repo = new GenerationAttemptsRepo(client as never);

  assert.deepEqual(await repo.weeklyReport('org-1', 'proj-1'), []);
});
