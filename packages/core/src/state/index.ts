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

/**
 * Thrown for failures that will fail the same way on every retry (QA
 * rejected the render, a required asset is missing, the manifest asks for
 * something unsupported) — the worker records them and tells pg-boss not to
 * retry, instead of re-rendering for nothing. Other error classes opt in the
 * same way with their own `retryable = false` field.
 */
export class NonRetryableError extends Error {
  readonly retryable = false;
}

// Which stage threw a given error (and whether that stage already wrote the
// failure to job_log), recorded as the error passes through `StageRunner` or
// a caller's own wrapper — kept off the error object itself so the original
// error class/message is rethrown untouched. The innermost record wins.
const failedStages = new WeakMap<object, { stage: string; logged: boolean }>();

export function recordFailedStage(err: unknown, stage: string, logged = false): void {
  if (typeof err === 'object' && err !== null && !failedStages.has(err)) {
    failedStages.set(err, { stage, logged });
  }
}

export function failureWasLogged(err: unknown): boolean {
  return typeof err === 'object' && err !== null && failedStages.get(err)?.logged === true;
}

export function toFailedPayload(err: unknown, fallbackStage: string): FailedPayload {
  const isObject = typeof err === 'object' && err !== null;
  return {
    stage: (isObject && failedStages.get(err)?.stage) || fallbackStage,
    error: err instanceof Error ? err.message : String(err),
    retryable: !(isObject && (err as { retryable?: unknown }).retryable === false),
  };
}

// Track P (ADR-003): gates that stop a job *before* rendering — the worker
// pauses right after fetching assets. Every other gate runs after render +
// QA. Approving a pre-render gate re-queues the job for a full render; the
// approval is recorded as a `gate-approval` artifact so retries don't ask
// again.
export const PRE_RENDER_GATES: readonly string[] = ['assets_review'];
export const GATE_APPROVAL_KIND = 'gate-approval';

export function isPreRenderGate(gate: string): boolean {
  return PRE_RENDER_GATES.includes(gate);
}

export function postRenderGates(gates: readonly string[]): string[] {
  return gates.filter((g) => !isPreRenderGate(g));
}

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
  // `queued`: the last gate approved on a job with publish targets — the
  // worker picks it back up in publish-only mode. `awaiting_review`: one
  // gate approved, the next gate still pending.
  awaiting_review: ['running', 'queued', 'awaiting_review', 'delivered', 'failed', 'cancelled'],
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
