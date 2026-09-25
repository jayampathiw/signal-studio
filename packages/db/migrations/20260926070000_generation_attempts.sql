-- P5.6 — replaces the old `production-log.csv` per-shot-purpose failure
-- tracking with a real table, so the dashboard can render a weekly failure
-- report instead of someone hand-editing a CSV. `shot_purpose` is a free
-- string (e.g. "wildlife-b-roll", "policy-highlight-box") rather than an
-- enum — the plan names no fixed list, and every real project's actual set
-- of shot purposes is project-specific, not something this schema should
-- pin. `job_id` is optional: an attempt can be logged standalone (a
-- generation tried outside the job pipeline entirely, e.g. a manual
-- Higgsfield retry) without forcing a real job row to exist first.

create table if not exists generation_attempts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs (id),
  project_id uuid not null references projects (id),
  job_id uuid references jobs (id),
  shot_purpose text not null,
  succeeded boolean not null,
  note text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);
create index if not exists idx_generation_attempts_org_project on generation_attempts (
  org_id,
  project_id
);
create index if not exists idx_generation_attempts_created_at on generation_attempts (created_at);

alter table generation_attempts enable row level security;

create policy org_isolation_generation_attempts on generation_attempts
  using (org_id::text = auth.jwt() ->> 'org_id');
