-- 102_generic_brief.sql
-- Makes content_items a generic AI video platform table.
--
-- Changes:
--   1. Drop NOT NULL from channel-config columns — these values belong in
--      channels.js + channel skills, not embedded in every DB row.
--      A new brief only needs channel_key + format + concept.
--   2. Rename open_thread → status_note — one field that holds the human-readable
--      reason for any non-happy-path state (blocked OR failed).
--      Rename the partial index to match.
--
-- Apply with: supabase db query --linked -f supabase/migrations/102_generic_brief.sql

-- ─── 1. Remove NOT NULL from channel-config fields ────────────────────────────
-- These columns are kept (nullable) so legacy rows from the news/pexels pipeline
-- keep their values. New AI video briefs simply leave them NULL.

alter table content_items alter column niche            drop not null;
alter table content_items alter column style            drop not null;
alter table content_items alter column language         drop not null;
alter table content_items alter column source_type      drop not null;
alter table content_items alter column source_clips     drop not null;
alter table content_items alter column target_platforms drop not null;

-- ─── 2. Rename open_thread → status_note ─────────────────────────────────────
-- open_thread was too specific (implied continuity review only).
-- status_note covers all non-happy states:
--   blocked  → why it's on hold ("scene 2 continuity conflict — …")
--   failed   → why it failed ("Higgsfield image blocked after 2 retries")
-- Non-null = something needs human attention before the row can proceed.
-- Cleared by human after resolution; status reset to brief or storyboard.

-- Rename open_thread → status_note only if open_thread still exists.
-- (May already be status_note if applied incrementally.)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'content_items' and column_name = 'open_thread'
  ) then
    alter table content_items rename column open_thread to status_note;
    alter index if exists idx_content_items_open_thread
      rename to idx_content_items_status_note;
  end if;
end $$;
