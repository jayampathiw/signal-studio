import type { JobsRepo } from '@signal-studio/db/repos';

/**
 * P2.7 — the `github` dispatcher: flips a job `queued` → `dispatched`
 * (atomically — `JobsRepo.markDispatched()` only succeeds if the row is
 * still `queued`, so two concurrent dispatch attempts can't both win) and
 * triggers `run-job.yml` via GitHub's `workflow_dispatch` REST endpoint.
 */

export type Dispatcher = {
  dispatch(jobId: string): Promise<void>;
};

export type GithubDispatcherOptions = {
  owner: string;
  repo: string;
  workflowFile: string;
  ref: string;
  token: string;
  jobsRepo: JobsRepo;
  fetchFn?: typeof fetch;
};

export class DispatchError extends Error {}

export function createGithubDispatcher(opts: GithubDispatcherOptions): Dispatcher {
  const fetchFn = opts.fetchFn ?? fetch;

  return {
    async dispatch(jobId: string): Promise<void> {
      const won = await opts.jobsRepo.markDispatched(jobId);
      // Someone else already dispatched this job (or it was never `queued`)
      // — not an error, just nothing for this call to do.
      if (!won) return;

      const url = `https://api.github.com/repos/${opts.owner}/${opts.repo}/actions/workflows/${opts.workflowFile}/dispatches`;
      const res = await fetchFn(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${opts.token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ref: opts.ref, inputs: { job_id: jobId } }),
      });

      if (!res.ok) {
        throw new DispatchError(
          `workflow_dispatch failed for job "${jobId}" (${res.status}): ${await res.text()}`,
        );
      }
    },
  };
}
