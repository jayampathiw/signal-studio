import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ProjectsRepo } from './projects.ts';

// P2.5: only `getById` is covered here (the method this pass added) —
// `upsert`/`getBySlug` had no test coverage before this file existed either;
// not backfilled here, out of this task's scope.
test('getById: filters by id, returns the row', async () => {
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
    maybeSingle: async () => {
      calls.push({ method: 'maybeSingle', args: [] });
      return { data: { id: 'proj-1', org_id: 'org-1', slug: 'wildlife', config: {} }, error: null };
    },
  };
  const client = { from: () => chain };
  const repo = new ProjectsRepo(client as never);

  const result = await repo.getById('proj-1');

  assert.deepEqual(calls.find((c) => c.method === 'eq')?.args, ['id', 'proj-1']);
  assert.equal(result?.id, 'proj-1');
});

test('getById: returns null when no row matches', async () => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => ({ data: null, error: null }),
  };
  const client = { from: () => chain };
  const repo = new ProjectsRepo(client as never);

  assert.equal(await repo.getById('missing'), null);
});
