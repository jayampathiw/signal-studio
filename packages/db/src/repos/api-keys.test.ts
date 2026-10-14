import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ApiKeysRepo, hashApiKey } from './api-keys.ts';

function makeFakeClient() {
  const calls: Array<{ table: string; method: string; args: unknown[] }> = [];
  function builder(table: string) {
    const state: { filters: Record<string, unknown> } = { filters: {} };
    const chain = {
      insert: (values: unknown) => {
        calls.push({ table, method: 'insert', args: [values] });
        return chain;
      },
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
      single: async () => {
        calls.push({ table, method: 'single', args: [state.filters] });
        return {
          data: {
            id: 'key-1',
            org_id: 'org-1',
            name: 'test',
            key_hash: 'h',
            created_at: 't',
            revoked_at: null,
          },
          error: null,
        };
      },
      maybeSingle: async () => {
        calls.push({ table, method: 'maybeSingle', args: [state.filters] });
        return { data: null, error: null };
      },
      update: (values: unknown) => {
        calls.push({ table, method: 'update', args: [values] });
        return chain;
      },
    };
    return chain;
  }
  return { client: { from: (t: string) => builder(t) } as never, calls };
}

test('hashApiKey: deterministic sha256 hex, different keys hash differently', () => {
  assert.equal(hashApiKey('abc'), hashApiKey('abc'));
  assert.notEqual(hashApiKey('abc'), hashApiKey('abd'));
  assert.match(hashApiKey('abc'), /^[0-9a-f]{64}$/);
});

test('create: returns the raw key once, persists only its hash', async () => {
  const { client, calls } = makeFakeClient();
  const repo = new ApiKeysRepo(client);

  const { row, rawKey } = await repo.create('org-1', 'ci-key');

  assert.match(rawKey, /^sk_[0-9a-f]{48}$/);
  assert.equal(row.id, 'key-1');
  const insertCall = calls.find((c) => c.method === 'insert');
  const [values] = insertCall!.args as [Record<string, unknown>];
  assert.equal(values.key_hash, hashApiKey(rawKey));
  assert.equal(values.org_id, 'org-1');
  assert.notEqual(values.key_hash, rawKey); // never store the raw key
});

test('findByHash: filters by hash and revoked_at is null', async () => {
  const { client, calls } = makeFakeClient();
  const repo = new ApiKeysRepo(client);

  await repo.findByHash('somehash');

  const call = calls.find((c) => c.method === 'maybeSingle');
  const [filters] = call!.args as [Record<string, unknown>];
  assert.equal(filters.key_hash, 'somehash');
  assert.equal(filters.revoked_at, null);
});

test('revoke: sets revoked_at', async () => {
  const { client, calls } = makeFakeClient();
  const repo = new ApiKeysRepo(client);

  await repo.revoke('key-1');

  const call = calls.find((c) => c.method === 'update');
  const [values] = call!.args as [Record<string, unknown>];
  assert.ok(typeof values.revoked_at === 'string');
});
