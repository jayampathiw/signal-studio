-- Engine core schema (P1.5). Apply to the **dev** Supabase project only —
-- prod stays untouched until P4. pg-boss creates its own schema on first
-- `start()`; do not hand-write it here.

create extension if not exists "pgcrypto";

create table if not exists orgs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  slug text not null,
  config jsonb not null, -- validated project.v1 shape at write time, not enforced in SQL
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, slug)
);
create index if not exists idx_projects_org on projects (org_id);

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  project_id uuid not null references projects(id),
  manifest jsonb not null, -- validated manifest.v1 shape at write time
  status text not null default 'created',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_jobs_org_status on jobs (org_id, status);

create table if not exists job_stages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  job_id uuid not null references jobs(id),
  output_id text, -- null for single-output stages; set per manifest output for multiOutput stages
  stage_name text not null,
  status text not null default 'pending',
  inputs_hash text,
  outputs jsonb,
  warnings jsonb,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, stage_name, output_id)
);
create index if not exists idx_job_stages_org_status on job_stages (org_id, status);
create index if not exists idx_job_stages_job on job_stages (job_id);

create table if not exists artifacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  job_id uuid not null references jobs(id),
  stage_name text not null,
  kind text not null, -- e.g. 'clip', 'wav', 'contact_sheet', 'rendered_video'
  url text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_artifacts_org_status on artifacts (org_id, job_id);

create table if not exists job_log (
  id bigint generated always as identity primary key,
  org_id uuid not null references orgs(id),
  job_id uuid not null references jobs(id),
  stage_name text,
  message text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_job_log_org_status on job_log (org_id, job_id);

-- RLS: org-scoped by default; service role (used by the API/worker) bypasses
-- RLS entirely per Supabase's standard behavior and needs no policy here.
alter table orgs enable row level security;
alter table projects enable row level security;
alter table jobs enable row level security;
alter table job_stages enable row level security;
alter table artifacts enable row level security;
alter table job_log enable row level security;

create policy org_isolation_orgs on orgs
  using (id::text = auth.jwt() ->> 'org_id');
create policy org_isolation_projects on projects
  using (org_id::text = auth.jwt() ->> 'org_id');
create policy org_isolation_jobs on jobs
  using (org_id::text = auth.jwt() ->> 'org_id');
create policy org_isolation_job_stages on job_stages
  using (org_id::text = auth.jwt() ->> 'org_id');
create policy org_isolation_artifacts on artifacts
  using (org_id::text = auth.jwt() ->> 'org_id');
create policy org_isolation_job_log on job_log
  using (org_id::text = auth.jwt() ->> 'org_id');
