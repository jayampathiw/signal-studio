import type { ArtifactsRepo, JobsRepo } from '@signal-studio/db/repos';

import type { Logger } from '../logger.ts';

/**
 * P2.7 — `ss mark-failed --id --run-url`: the `run-job.yml` workflow's own
 * failure safety net (`if: failure()`), not something an operator runs
 * directly. `run-job.ts` already marks a job `failed` on any error it can
 * catch — but if the container never got that far (image pull failure, the
 * process OOM-killed, a crash before `runJob()`'s own try/catch is even
 * entered), the job could be stuck mid-flight forever with nothing pointing
 * back at *why*. This force-marks it `failed` (skipped if already there —
 * `run-job.ts` got there first) and records the failing GitHub Actions run
 * URL as an artifact, satisfying the plan's "on failure PATCH job failed
 * with run URL" without inventing a new DB column for it.
 */

export type MarkFailedOptions = {
  jobId: string;
  runUrl?: string;
};

export type MarkFailedDeps = {
  jobsRepo: JobsRepo;
  createArtifactsRepo: (orgId: string) => ArtifactsRepo;
};

export async function markFailedCommand(
  opts: MarkFailedOptions,
  deps: MarkFailedDeps,
  logger: Logger,
): Promise<void> {
  const job = await deps.jobsRepo.getById(opts.jobId);
  if (!job) throw new Error(`mark-failed: no job found with id "${opts.jobId}"`);

  if (job.status !== 'failed') {
    await deps.jobsRepo.updateStatus(opts.jobId, 'failed');
    logger.info(`job ${job.status} -> failed (forced by CI safety net)`, { jobId: opts.jobId });
  } else {
    logger.info('job already failed — run-job.ts got there first', { jobId: opts.jobId });
  }

  if (opts.runUrl) {
    await deps
      .createArtifactsRepo(job.org_id)
      .record(opts.jobId, 'run-job', 'ci-failure-log', opts.runUrl, {});
  }
}
