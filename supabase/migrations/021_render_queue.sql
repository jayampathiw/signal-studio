-- Render queue: dashboard queues a channel key; local process-queue.js processes it.
create table if not exists render_queue (
  id          bigint generated always as identity primary key,
  channel_key text        not null,
  status      text        not null default 'queued', -- queued, processing, done, failed
  error       text,
  queued_at   timestamptz not null default now(),
  started_at  timestamptz,
  done_at     timestamptz
);

create index on render_queue (status, queued_at);

alter table render_queue enable row level security;
create policy "authenticated read"   on render_queue for select to authenticated using (true);
create policy "authenticated insert" on render_queue for insert to authenticated with check (true);
create policy "authenticated update" on render_queue for update to authenticated using (true);
