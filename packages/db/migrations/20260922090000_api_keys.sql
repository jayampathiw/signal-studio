-- API key auth for apps/api (P2.7). Keys are hashed (sha256 hex) — the raw
-- key is only ever returned once, at creation time, same convention CLAUDE.md
-- and this migration's own sibling (20260918_engine_core.sql) already use
-- for "never store the secret itself" (see that file's RLS section).

create table if not exists api_keys (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  name text not null,
  key_hash text not null unique, -- sha256(raw key), hex
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index if not exists idx_api_keys_org on api_keys (org_id);
create index if not exists idx_api_keys_hash on api_keys (key_hash) where revoked_at is null;

alter table api_keys enable row level security;
create policy org_isolation_api_keys on api_keys
  using (org_id::text = auth.jwt() ->> 'org_id');

-- **Not yet applied to the dev project this pass** — this sandbox's session
-- doesn't have the Supabase MCP server connected (the same one P1.5's
-- migration was applied through; it needs SUPABASE_MCP_TOKEN, which isn't
-- set up here). `packages/db/src/repos/api-keys.ts`'s tests use fakes only
-- until this is applied for real.
