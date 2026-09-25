import assert from 'node:assert/strict';
import { test } from 'node:test';

import { JobStagesRepo } from './job-stages.ts';

// A minimal fake of the subset of the supabase-js fluent query builder this
// repo actually calls — enough to assert the *shape* of what gets sent
// (org_id present, onConflict keys correct) without a real Postgres.
function makeFakeClient() {
  const calls: Array<{ table: string; method: string; args: unknown[] }> = [];

  function builder(table: string) {
    const state: { filters: Record<string, unknown> } = { filters: {} };
    const chain = {
      select: (...args: unknown[]) => {
        calls.push({ table, method: 'select', args });
        return chain;
      },
      eq: (col: string, val: unknown) => {
        state.filters[col] = val;
        return chain;
      },
      is: (col: string, val: unknown) => {
        state.filters[col] = val;
        return chain;
      },
      maybeSingle: async () => {
        calls.push({ table, method: 'maybeSingle', args: [state.filters] });
        return { data: null, error: null };
      },
      upsert: (values: unknown, options: unknown) => {
        calls.push({ table, method: 'upsert', args: [values, options] });
        return Promise.resolve({ error: null });
      },
      insert: (values: unknown) => {
        calls.push({ table, method: 'insert', args: [values] });
        return Promise.resolve({ error: null });
      },
    };
    return chain;
  }

  const client = { from: (table: string) => builder(table) };
  return { client: client as never, calls };
}

test('recordStart includes org_id and the composite onConflict key', async () => {
  const { client, calls } = makeFakeClient();
  const repo = new JobStagesRepo(client, 'org-1');

  await repo.recordStart('job-1', 'render', 'fb');

  const call = calls.find((c) => c.table === 'job_stages' && c.method === 'upsert');
  assert.ok(call, 'expected an upsert call');
  const [values, options] = call!.args as [Record<string, unknown>, { onConflict: string }];
  assert.equal(values.org_id, 'org-1');
  assert.equal(values.job_id, 'job-1');
  assert.equal(values.output_id, 'fb');
  assert.equal(options.onConflict, 'job_id,stage_name,output_id');
});

test('recordStart writes output_id "" (not null) when no outputId given', async () => {
  const { client, calls } = makeFakeClient();
  const repo = new JobStagesRepo(client, 'org-1');

  await repo.recordStart('job-1', 'assets');

  const call = calls.find((c) => c.table === 'job_stages' && c.method === 'upsert');
  const [values] = call!.args as [Record<string, unknown>];
  assert.equal(values.output_id, '');
});

test('recordEnd includes org_id and the resolved hash/status', async () => {
  const { client, calls } = makeFakeClient();
  const repo = new JobStagesRepo(client, 'org-1');

  await repo.recordEnd('job-1', 'render', { hash: 'h1', status: 'done', outputs: { a: 1 } }, 'fb');

  const call = calls.find((c) => c.table === 'job_stages' && c.method === 'upsert');
  const [values] = call!.args as [Record<string, unknown>];
  assert.equal(values.org_id, 'org-1');
  assert.equal(values.status, 'done');
  assert.equal(values.inputs_hash, 'h1');
});

test('log includes org_id', async () => {
  const { client, calls } = makeFakeClient();
  const repo = new JobStagesRepo(client, 'org-1');

  await repo.log('job-1', 'render', 'hello');

  const call = calls.find((c) => c.table === 'job_log' && c.method === 'insert');
  const [values] = call!.args as [Record<string, unknown>];
  assert.equal(values.org_id, 'org-1');
  assert.equal(values.message, 'hello');
});

test('getLastRun filters output_id to "" (not null) when no outputId given', async () => {
  // P2.8 fix: `.is('output_id', null)` never actually worked as a uniqueness
  // filter against a real Postgres NOT NULL DEFAULT '' column — see
  // 20260922100000_job_stages_output_id_not_null.sql for the real bug this
  // uncovered. `''` is the canonical "no output" value everywhere else in
  // this codebase (StageRunner's own `outputId ?? ''` key convention).
  const { client, calls } = makeFakeClient();
  const repo = new JobStagesRepo(client, 'org-1');

  await repo.getLastRun('job-1', 'prep');

  const call = calls.find((c) => c.table === 'job_stages' && c.method === 'maybeSingle');
  const [filters] = call!.args as [Record<string, unknown>];
  assert.equal(filters.output_id, '');
});

test('P2.5: getLastRun returns outputs from the row, so a skip can still feed compile()', async () => {
  // A dedicated fake here (rather than makeFakeClient, whose maybeSingle
  // always returns null data) — every chain method returns the same object
  // so a real prior row can flow through to the final maybeSingle() call.
  const chain = {
    select: () => chain,
    eq: () => chain,
    is: () => chain,
    maybeSingle: async () => ({
      data: { inputs_hash: 'h1', status: 'done', outputs: { durations: { s1: 4 } } },
      error: null,
    }),
  };
  const client = { from: () => chain };
  const repo = new JobStagesRepo(client as never, 'org-1');

  const result = await repo.getLastRun('job-1', 'assets');
  assert.deepEqual(result, { hash: 'h1', status: 'done', outputs: { durations: { s1: 4 } } });
});

test('P4.3: listRecent scopes to org+job, orders by created_at desc with a limit, then returns chronological order', async () => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: (col: string, opts: { ascending: boolean }) => {
      assert.equal(col, 'created_at');
      assert.equal(opts.ascending, false);
      return chain;
    },
    limit: async (n: number) => {
      assert.equal(n, 2);
      // Simulate Postgres returning newest-first per the real .order() call.
      return {
        data: [
          { id: 2, stage_name: 'assets', message: 'second', created_at: 't2' },
          { id: 1, stage_name: 'assets', message: 'first', created_at: 't1' },
        ],
        error: null,
      };
    },
  };
  const client = { from: () => chain };
  const repo = new JobStagesRepo(client as never, 'org-1');

  const entries = await repo.listRecent('job-1', 2);

  assert.deepEqual(entries, [
    { id: 1, stage_name: 'assets', message: 'first', created_at: 't1' },
    { id: 2, stage_name: 'assets', message: 'second', created_at: 't2' },
  ]);
});

test('P4.3: listRecent throws a clear error on a Supabase failure', async () => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: async () => ({ data: null, error: { message: 'connection reset' } }),
  };
  const client = { from: () => chain };
  const repo = new JobStagesRepo(client as never, 'org-1');

  await assert.rejects(() => repo.listRecent('job-1', 50), /connection reset/);
});
