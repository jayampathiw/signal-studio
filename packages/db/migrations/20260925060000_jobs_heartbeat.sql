-- P4.1 — `ss worker`'s own liveness signal. A running job's worker process
-- touches this column every ~30s (`JobsRepo.heartbeat()`) while it's
-- actively processing; the reaper (also `ss worker`, a periodic scan) marks
-- any job still `status = 'running'` whose `heartbeat_at` has gone stale
-- (> 10 min, per the plan's own P4.1 bullet) as `failed`, so a worker that
-- dies mid-job (crash, OOM-kill, host reboot) without a chance to mark its
-- own job `failed` doesn't leave it stuck `running` forever with nothing
-- watching it.
alter table jobs add column if not exists heartbeat_at timestamptz;
create index if not exists idx_jobs_status_heartbeat on jobs (status, heartbeat_at);
