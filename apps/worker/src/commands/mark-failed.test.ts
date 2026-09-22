import assert from 'node:assert/strict';
import { test } from 'node:test';

import { markFailedCommand } from './mark-failed.ts';
import { createLogger } from '../logger.ts';

function fakeDeps(job: { id: string; org_id: string; status: string } | null) {
  const statusUpdates: string[] = [];
  const artifacts: Array<{ jobId: string; kind: string; url: string }> = [];
  return {
    jobsRepo: {
      async getById() {
        return job;
      },
      async updateStatus(id: string, status: string) {
        statusUpdates.push(status);
      },
    } as never,
    createArtifactsRepo: () =>
      ({
        async record(jobId: string, _stage: string, kind: string, url: string) {
          artifacts.push({ jobId, kind, url });
        },
      }) as never,
    statusUpdates,
    artifacts,
  };
}

test('mark-failed: forces status to failed and records the run URL as an artifact', async () => {
  const deps = fakeDeps({ id: 'job-1', org_id: 'org-1', status: 'running' });
  await markFailedCommand(
    { jobId: 'job-1', runUrl: 'https://github.com/x/y/actions/runs/1' },
    deps,
    createLogger({ level: 'error' }),
  );

  assert.deepEqual(deps.statusUpdates, ['failed']);
  assert.deepEqual(deps.artifacts, [
    { jobId: 'job-1', kind: 'ci-failure-log', url: 'https://github.com/x/y/actions/runs/1' },
  ]);
});

test('mark-failed: does not re-write status when already failed', async () => {
  const deps = fakeDeps({ id: 'job-1', org_id: 'org-1', status: 'failed' });
  await markFailedCommand({ jobId: 'job-1' }, deps, createLogger({ level: 'error' }));
  assert.deepEqual(deps.statusUpdates, []);
});

test('mark-failed: throws a clear error for an unknown job', async () => {
  const deps = fakeDeps(null);
  await assert.rejects(
    () => markFailedCommand({ jobId: 'missing' }, deps, createLogger({ level: 'error' })),
    /no job found/,
  );
});
