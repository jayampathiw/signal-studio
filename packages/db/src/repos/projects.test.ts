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

test('listByOrg: filters by org_id, orders by slug', async () => {
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
    order: async (...args: unknown[]) => {
      calls.push({ method: 'order', args });
      return { data: [{ id: 'proj-1', slug: 'wildlife' }], error: null };
    },
  };
  const client = { from: () => chain };
  const repo = new ProjectsRepo(client as never);

  const rows = await repo.listByOrg('org-1');

  assert.deepEqual(calls.find((c) => c.method === 'eq')?.args, ['org_id', 'org-1']);
  assert.deepEqual(calls.find((c) => c.method === 'order')?.args, ['slug', { ascending: true }]);
  assert.deepEqual(rows, [{ id: 'proj-1', slug: 'wildlife' }]);
});

test('updateConfig: scopes the update by org_id and slug, returns the row', async () => {
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
    select: () => chain,
    single: async () => ({ data: { id: 'proj-1', slug: 'wildlife' }, error: null }),
  };
  const client = { from: () => chain };
  const repo = new ProjectsRepo(client as never);

  const config = {
    slug: 'wildlife',
    orgId: 'org-1',
    defaults: { template: 'clips-overlay', voice: 'bm_george', speed: 1, outputs: ['fb'] },
    providers: {
      tts: 'tts-kokoro-js',
      captions: 'captions-faster-whisper',
      image: 'image-fal',
      storage: 'storage-r2',
      publish: 'publish-facebook',
    },
  } as never;

  const row = await repo.updateConfig('org-1', 'wildlife', config);

  assert.deepEqual(
    calls.filter((c) => c.method === 'eq').map((c) => c.args),
    [
      ['org_id', 'org-1'],
      ['slug', 'wildlife'],
    ],
  );
  assert.equal(row.id, 'proj-1');
});
