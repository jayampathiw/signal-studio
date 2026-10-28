import { assertJobTransition } from '@signal-studio/core/state';
import type { JobRow } from '@signal-studio/db/repos';

import type { AppDeps } from './app.ts';

/**
 * Moves a `created`/`awaiting_assets` job to `queued` and dispatches it —
 * shared by `POST /jobs/:id/queue` and the MCP `queue_job` tool (Track P,
 * P.1), so a claude.ai Project can start a render with no dashboard step.
 * Returns an error message when the job is in any other status. The caller
 * has already checked the job exists and belongs to the org.
 */
export async function queueJob(
  deps: Pick<AppDeps, 'jobsRepo' | 'dispatcher'>,
  job: JobRow,
): Promise<string | null> {
  if (job.status !== 'created' && job.status !== 'awaiting_assets') {
    return `Job is "${job.status}", not created/awaiting_assets`;
  }
  assertJobTransition(job.status, 'queued');
  await deps.jobsRepo.updateStatus(job.id, 'queued');
  await deps.dispatcher.dispatch(job.id);
  return null;
}
