-- Why a job failed, as `{ stage, error, retryable }` (`FailedPayload` in
-- packages/core/src/state). Written by `JobsRepo.markFailed()` from every
-- failure path (worker, stale-job reaper, CI safety net) so the reason is on
-- the job itself instead of only in worker stdout / the job_log tail.
-- Cleared when the job is re-queued, so it always describes the current
-- failure. Null for every job that hasn't failed.
alter table jobs add column if not exists error jsonb;
