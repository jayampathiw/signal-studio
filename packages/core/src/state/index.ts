/**
 * Job/stage state machine (P1.2). Transition table is data — assertTransition
 * throws with both state names on an illegal move, so callers get a clear
 * error rather than silently accepting a bad transition.
 */

export type JobStatus =
  | 'created'
  | 'awaiting_assets'
  | 'queued'
  | 'dispatched'
  | 'running'
  | `awaiting_review:${string}`
  | 'delivered'
  | 'published'
  | 'failed'
  | 'cancelled';

export type StageStatus = 'pending' | 'running' | 'skipped' | 'done' | 'failed' | 'warning';

export type FailedPayload = {
  stage: string;
  error: string;
  retryable: boolean;
};

// `awaiting_review:<gate>` is a family of states (one per gate name), so the
// table is keyed on the base statuses and treats any `awaiting_review:*`
// value as reachable from `running` / back to `running` uniformly — checked
// with a helper rather than enumerating every possible gate name.
const JOB_TRANSITIONS: Record<string, string[]> = {
  created: ['awaiting_assets', 'queued', 'cancelled', 'failed'],
  awaiting_assets: ['queued', 'cancelled', 'failed'],
  queued: ['dispatched', 'cancelled', 'failed'],
  dispatched: ['running', 'failed', 'cancelled'],
  running: ['awaiting_review', 'delivered', 'failed', 'cancelled'],
  awaiting_review: ['running', 'delivered', 'failed', 'cancelled'],
  delivered: ['published', 'failed'],
  published: [],
  failed: ['queued'],
  cancelled: [],
};

const STAGE_TRANSITIONS: Record<StageStatus, StageStatus[]> = {
  pending: ['running', 'skipped'],
  running: ['done', 'failed', 'warning'],
  skipped: [],
  done: [],
  failed: ['pending'],
  warning: ['done'],
};

function baseJobStatus(status: JobStatus): string {
  return status.startsWith('awaiting_review:') ? 'awaiting_review' : status;
}

export function assertJobTransition(from: JobStatus, to: JobStatus): void {
  const fromBase = baseJobStatus(from);
  const toBase = baseJobStatus(to);
  const allowed = JOB_TRANSITIONS[fromBase];
  if (!allowed || !allowed.includes(toBase)) {
    throw new Error(`Illegal job transition: ${from} → ${to}`);
  }
}

export function assertStageTransition(from: StageStatus, to: StageStatus): void {
  const allowed = STAGE_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    throw new Error(`Illegal stage transition: ${from} → ${to}`);
  }
}

export { JOB_TRANSITIONS, STAGE_TRANSITIONS };
