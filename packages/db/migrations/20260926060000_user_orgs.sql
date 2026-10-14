-- P5.1 — maps a real Supabase Auth user (the dashboard's login identity) to
-- exactly one org. apps/api's own auth middleware resolves org_id from this
-- table (via the service-role client, bypassing RLS) after verifying a
-- caller's Supabase access token against /auth/v1/user — this table's own
-- RLS policy only matters for a client querying it directly with the
-- user's own anon-key session, which nothing in this pass does, but is
-- enabled anyway for the same defense-in-depth reasoning every other table
-- in this schema already follows.

create table if not exists user_orgs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  org_id uuid not null references orgs (id),
  created_at timestamptz not null default now()
);
create index if not exists idx_user_orgs_org on user_orgs (org_id);

alter table user_orgs enable row level security;

create policy user_orgs_self on user_orgs
  using (user_id = auth.uid());
