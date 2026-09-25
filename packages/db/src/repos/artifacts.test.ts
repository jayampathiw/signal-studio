import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ArtifactsRepo } from './artifacts.ts';

// P5.3 — real bug fix: listForJob previously filtered by job_id alone, so
// a service-role caller (every real one) could read another org's
// artifacts just by knowing/guessing a job_id. This is that fix's own
// regression test.
test('listForJob: scopes by org_id (constructor) as well as job_id, not job_id alone', async () => {
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
  };
  // Supabase's real chain resolves when awaited, not via an explicit
  // terminal call — mimic that by making `eq` itself thenable on its last
  // invocation.
  let eqCount = 0;
  chain.eq = (...args: unknown[]) => {
    calls.push({ method: 'eq', args });
    eqCount += 1;
    if (eqCount === 2) {
      return Promise.resolve({
        data: [{ id: 'art-1', org_id: 'org-1', job_id: 'job-1' }],
        error: null,
      }) as never;
    }
    return chain;
  };
  const client = { from: () => chain };
  const repo = new ArtifactsRepo(client as never, 'org-1');

  const rows = await repo.listForJob('job-1');

  assert.deepEqual(
    calls.filter((c) => c.method === 'eq').map((c) => c.args),
    [
      ['org_id', 'org-1'],
      ['job_id', 'job-1'],
    ],
  );
  assert.equal(rows.length, 1);
});
