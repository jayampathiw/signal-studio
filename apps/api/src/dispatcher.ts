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

/**
 * P4.1 — the `queue` dispatcher: the real-queue counterpart to the
 * `github` one above, for the `DISPATCH_MODE=queue` production path
 * (P4.2's own VPS deployment, once it exists — `github` stays the
 * emergency/CI fallback per the plan's own T-G bullet, not replaced).
 * Same atomic `markDispatched()` race guard, then hands the job straight
 * to pg-boss via an injected `send` (mirrors `fetchFn`'s injection pattern
 * above — this file stays free of a direct `pg-boss` dependency, matching
 * `apps/worker`'s own `WorkerDeps.createBoss` injection so `apps/api` can
 * be tested without a real Postgres connection, same reasoning either
 * file's header already gives for its own injected primitive).
 */
export type QueueDispatcherOptions = {
  // The pg-boss queue name `ss worker` is listening on (`ss worker
  // --queue <name>`) — must match, or a dispatched job never gets picked
  // up. Not defaulted here; the caller wires both ends from one place
  // (`apps/api/src/index.ts`) rather than this file guessing a name that
  // could silently drift from the worker's own.
  queue: string;
  jobsRepo: JobsRepo;
  send: (queue: string, data: { jobId: string }) => Promise<string | null>;
};

export function createQueueDispatcher(opts: QueueDispatcherOptions): Dispatcher {
  return {
    async dispatch(jobId: string): Promise<void> {
      const won = await opts.jobsRepo.markDispatched(jobId);
      // Someone else already dispatched this job (or it was never `queued`)
      // — not an error, just nothing for this call to do, same as `github`.
      if (!won) return;

      const messageId = await opts.send(opts.queue, { jobId });
      if (messageId === null) {
        throw new DispatchError(
          `queue dispatch failed for job "${jobId}": pg-boss send() returned null (queue "${opts.queue}" may not exist — has ss worker created it?)`,
        );
      }
    },
  };
}
