import { resolveJob } from '@signal-studio/core/resolve';
import {
  assertJobTransition,
  GATE_APPROVAL_KIND,
  isPreRenderGate,
  postRenderGates,
  type JobStatus,
} from '@signal-studio/core/state';
import type { JobRow } from '@signal-studio/db/repos';

import type { AppDeps } from './app.ts';

/**
 * Approves the review gate a job is waiting on — shared by `POST
 * /jobs/:id/approve` and the MCP `approve_gate` tool.
 *
 * A pre-render gate (`assets_review`, Track P) stops the job right after its
 * assets are fetched, before anything renders: approving records a
 * `gate-approval` artifact (so a retried job doesn't stop there again) and
 * queues the job for a full render.
 *
 * Every other gate stops the job at `awaiting_review:<gate>` after rendering
 * + QA, so approving:
 *   - moves to the next post-render gate when one is still pending,
 *   - otherwise marks the job `delivered` when it has nothing to publish,
 *   - otherwise queues it for the worker in publish-only mode, which posts
 *     the already-rendered output instead of re-rendering it.
 * The caller has already checked the job exists, belongs to the org and is
 * `awaiting_review:*`.
 *
 * `publishAt` (P.8, scheduled posting) is only accepted on the approval that
 * publishes. It's stored on that gate's `gate-approval` artifact, and the
 * worker's publish-only run hands it to the platform's own scheduling
 * (Facebook `scheduled_publish_time`), so nothing on our side has to wake up
 * at that time.
 */
export async function approveGate(
  deps: Pick<AppDeps, 'jobsRepo' | 'projectsRepo' | 'dispatcher' | 'createArtifactsRepo'>,
  job: JobRow,
  opts: { publishAt?: string; now?: number } = {},
): Promise<JobStatus> {
  const project = await deps.projectsRepo.getById(job.project_id);
  if (!project) throw new Error(`approveGate: job "${job.id}" has no project`);
  const { gates } = resolveJob(project.config, job.manifest);
  const current = job.status.slice('awaiting_review:'.length);

  if (isPreRenderGate(current)) {
    if (opts.publishAt) throw new ApproveError(PUBLISH_AT_WRONG_GATE);
    assertJobTransition(job.status, 'queued');
    await deps
      .createArtifactsRepo(job.org_id)
      .record(job.id, current, GATE_APPROVAL_KIND, '', { gate: current });
    await deps.jobsRepo.updateStatus(job.id, 'queued');
    await deps.dispatcher.dispatch(job.id);
    return 'queued';
  }

  const after = postRenderGates(gates);
  const index = after.indexOf(current);
  const nextGate = index >= 0 ? after[index + 1] : undefined;

  let next: JobStatus;
  if (nextGate) next = `awaiting_review:${nextGate}`;
  else if (job.manifest.publish.length === 0) next = 'delivered';
  else next = 'queued';

  let publishAt: string | undefined;
  if (opts.publishAt) {
    if (next !== 'queued') throw new ApproveError(PUBLISH_AT_WRONG_GATE);
    publishAt = checkPublishAt(opts.publishAt, opts.now ?? Date.now());
  }

  assertJobTransition(job.status, next);
  if (publishAt) {
    await deps
      .createArtifactsRepo(job.org_id)
      .record(job.id, current, GATE_APPROVAL_KIND, '', { gate: current, publishAt });
  }
  await deps.jobsRepo.updateStatus(job.id, next);
  if (next === 'queued') await deps.dispatcher.dispatch(job.id, 'publish');
  return next;
}

// An approval request the caller should answer with a 400, not a crash.
export class ApproveError extends Error {}

const PUBLISH_AT_WRONG_GATE =
  'publishAt only applies when approving the last gate of a job that publishes';

// Facebook accepts a scheduled time between 10 minutes and 30 days ahead;
// the margins leave room for the worker to pick the job up.
const MIN_LEAD_MS = 15 * 60 * 1000;
const MAX_LEAD_MS = 29 * 24 * 60 * 60 * 1000;

/** Validates a requested publish time; returns it as UTC ISO. */
export function checkPublishAt(value: string, now: number): string {
  if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(value.trim())) {
    throw new ApproveError(
      `publishAt "${value}" needs a timezone, e.g. 2026-10-31T19:00:00-04:00 or 2026-10-31T23:00:00Z`,
    );
  }
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) throw new ApproveError(`publishAt "${value}" is not a valid date-time`);
  if (ms < now + MIN_LEAD_MS) {
    throw new ApproveError(
      `publishAt must be at least 15 minutes from now (now is ${new Date(now).toISOString()}); approve without publishAt to post immediately`,
    );
  }
  if (ms > now + MAX_LEAD_MS) throw new ApproveError('publishAt must be within 29 days');
  return new Date(ms).toISOString();
}
