import { resolveJob } from '@signal-studio/core/resolve';
import { assertJobTransition, type JobStatus } from '@signal-studio/core/state';
import type { JobRow } from '@signal-studio/db/repos';

import type { AppDeps } from './app.ts';

/**
 * Approves the review gate a job is waiting on — shared by `POST
 * /jobs/:id/approve` and the MCP `approve_gate` tool. A gated job stops at
 * `awaiting_review:<gate>` after rendering + QA, so approving:
 *   - moves to the next gate when one is still pending,
 *   - otherwise marks the job `delivered` when it has nothing to publish,
 *   - otherwise queues it for the worker in publish-only mode, which posts
 *     the already-rendered output instead of re-rendering it.
 * The caller has already checked the job exists, belongs to the org and is
 * `awaiting_review:*`.
 */
export async function approveGate(
  deps: Pick<AppDeps, 'jobsRepo' | 'projectsRepo' | 'dispatcher'>,
  job: JobRow,
): Promise<JobStatus> {
  const project = await deps.projectsRepo.getById(job.project_id);
  if (!project) throw new Error(`approveGate: job "${job.id}" has no project`);
  const { gates } = resolveJob(project.config, job.manifest);

  const current = job.status.slice('awaiting_review:'.length);
  const index = gates.indexOf(current);
  const nextGate = index >= 0 ? gates[index + 1] : undefined;

  let next: JobStatus;
  if (nextGate) next = `awaiting_review:${nextGate}`;
  else if (job.manifest.publish.length === 0) next = 'delivered';
  else next = 'queued';

  assertJobTransition(job.status, next);
  await deps.jobsRepo.updateStatus(job.id, next);
  if (next === 'queued') await deps.dispatcher.dispatch(job.id, 'publish');
  return next;
}
