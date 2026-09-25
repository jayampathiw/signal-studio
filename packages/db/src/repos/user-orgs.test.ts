import assert from 'node:assert/strict';
import { test } from 'node:test';

import { UserOrgsRepo } from './user-orgs.ts';

test('getOrgIdForUser: filters by user_id, returns org_id', async () => {
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
    maybeSingle: async () => ({ data: { org_id: 'org-1' }, error: null }),
  };
  const client = { from: () => chain };
  const repo = new UserOrgsRepo(client as never);

  const orgId = await repo.getOrgIdForUser('user-1');

  assert.deepEqual(calls.find((c) => c.method === 'eq')?.args, ['user_id', 'user-1']);
  assert.equal(orgId, 'org-1');
});

test('getOrgIdForUser: returns null when the user has no org mapping', async () => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => ({ data: null, error: null }),
  };
  const client = { from: () => chain };
  const repo = new UserOrgsRepo(client as never);

  assert.equal(await repo.getOrgIdForUser('unmapped-user'), null);
});

test('assign: upserts on user_id conflict', async () => {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const chain = {
    upsert: async (...args: unknown[]) => {
      calls.push({ method: 'upsert', args });
      return { error: null };
    },
  };
  const client = { from: () => chain };
  const repo = new UserOrgsRepo(client as never);

  await repo.assign('user-1', 'org-1');

  assert.deepEqual(calls[0].args, [
    { user_id: 'user-1', org_id: 'org-1' },
    { onConflict: 'user_id' },
  ]);
});
