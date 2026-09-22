import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createGithubDispatcher, DispatchError } from './dispatcher.ts';

function fakeJobsRepo(markDispatchedResult: boolean) {
  const calls: string[] = [];
  return {
    repo: {
      markDispatched: async (jobId: string) => {
        calls.push(jobId);
        return markDispatchedResult;
      },
    },
    calls,
  };
}

test('dispatch: calls markDispatched, then POSTs workflow_dispatch with the right URL/body', async () => {
  const { repo, calls } = fakeJobsRepo(true);
  const fetchCalls: Array<{ url: string; init: RequestInit }> = [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    fetchCalls.push({ url, init });
    return new Response(null, { status: 204 });
  }) as typeof fetch;

  const dispatcher = createGithubDispatcher({
    owner: 'acme',
    repo: 'signal-studio',
    workflowFile: 'run-job.yml',
    ref: 'refactor',
    token: 'gh-token',
    jobsRepo: repo as never,
    fetchFn,
  });

  await dispatcher.dispatch('job-1');

  assert.deepEqual(calls, ['job-1']);
  assert.equal(fetchCalls.length, 1);
  assert.equal(
    fetchCalls[0].url,
    'https://api.github.com/repos/acme/signal-studio/actions/workflows/run-job.yml/dispatches',
  );
  assert.equal(
    (fetchCalls[0].init.headers as Record<string, string>).Authorization,
    'Bearer gh-token',
  );
  assert.deepEqual(JSON.parse(fetchCalls[0].init.body as string), {
    ref: 'refactor',
    inputs: { job_id: 'job-1' },
  });
});

test('dispatch: skips the GitHub call entirely when markDispatched loses the race', async () => {
  const { repo } = fakeJobsRepo(false);
  let fetchCalled = false;
  const fetchFn = (async () => {
    fetchCalled = true;
    return new Response(null, { status: 204 });
  }) as typeof fetch;

  const dispatcher = createGithubDispatcher({
    owner: 'acme',
    repo: 'signal-studio',
    workflowFile: 'run-job.yml',
    ref: 'refactor',
    token: 'gh-token',
    jobsRepo: repo as never,
    fetchFn,
  });

  await dispatcher.dispatch('job-1');
  assert.equal(fetchCalled, false);
});

test('dispatch: throws DispatchError on a non-ok GitHub response', async () => {
  const { repo } = fakeJobsRepo(true);
  const fetchFn = (async () => new Response('bad ref', { status: 422 })) as typeof fetch;

  const dispatcher = createGithubDispatcher({
    owner: 'acme',
    repo: 'signal-studio',
    workflowFile: 'run-job.yml',
    ref: 'refactor',
    token: 'gh-token',
    jobsRepo: repo as never,
    fetchFn,
  });

  await assert.rejects(() => dispatcher.dispatch('job-1'), DispatchError);
});
