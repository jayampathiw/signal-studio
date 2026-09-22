import assert from 'node:assert/strict';
import { test } from 'node:test';

import { handleJob } from './worker.ts';
import { createLogger } from '../logger.ts';

test('handleJob: calls runJob with the payload jobId, resolves on success', async () => {
  const calls: string[] = [];
  await handleJob(
    { jobId: 'job-1' },
    async (jobId) => void calls.push(jobId),
    createLogger({ level: 'error' }),
  );
  assert.deepEqual(calls, ['job-1']);
});

test("handleJob: rethrows runJob's error so pg-boss can retry/dead-letter", async () => {
  await assert.rejects(
    () =>
      handleJob(
        { jobId: 'job-1' },
        async () => {
          throw new Error('render failed');
        },
        createLogger({ level: 'error' }),
      ),
    /render failed/,
  );
});
