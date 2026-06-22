-- Wild Eye / Wild Capture channel extensions.
-- Adds format, scenes, open_thread, slot, scheduled_for, seo columns to content_items.
-- Extends the status CHECK to include Wild-Eye lifecycle stages.

-- Drop the existing CHECK constraint so we can extend it.
alter table content_items
  drop constraint if exists content_items_status_check;

-- Re-add with Wild-Eye stages prepended (brief → storyboard → generating → ... original values).
alter table content_items
  add constraint content_items_status_check
  check (status in (
    'brief', 'storyboard', 'generating',
    'pending', 'rendering', 'rendered', 'publishing', 'posted', 'failed', 'blocked'
  ));

-- Content format: house-style formula identifier.
-- '11s' | '21s' | 'portrait' for Wild Capture; extensible for future formats.
alter table content_items
  add column if not exists format text;

-- Storyboard + generation record. One element per scene, progressively populated.
-- Shape: [{ n, image_prompt, video_prompt{...},
--            storyboard_url,                        -- composite preview (scene 1 only; set after Step 4)
--            higgsfield_image_job, start_frame_url, -- set after Step 6c
--            higgsfield_video_job, clip_url,        -- set after Step 6e (reels only)
--            final_frame_url,                       -- last frame of clip → reference for next scene
--            scene_status }]
-- scene_status: 'pending' | 'image_done' | 'video_done' | 'blocked'
-- Terminal state: 'video_done' for reels, 'image_done' for portrait
-- Full shape reference: docs/video-generation-flow.md §4
alter table content_items
  add column if not exists scenes jsonb not null default '[]';

-- Human-readable reason for blocked or failed state.
-- Non-null = needs human attention before the row can proceed.
-- Example (blocked): "Scene 3 continuity — fox clearly spotted cavy"
-- Example (failed):  "Higgsfield image blocked after 2 retries"
-- Renamed to status_note in migration 102_generic_brief.sql
alter table content_items
  add column if not exists open_thread text;

-- Target posting slot as a human-readable label, e.g. 'Fri 23:00 BST'
alter table content_items
  add column if not exists slot text;

-- Absolute scheduled post time (set when slot is resolved to a real datetime).
alter table content_items
  add column if not exists scheduled_for timestamptz;

-- SEO package, held until scenes are approved — never written speculatively.
-- Shape: { title: string, description: string, hashtags: string[] }
alter table content_items
  add column if not exists seo jsonb;

-- Indexes for Wild-Eye query patterns.
create index if not exists idx_content_items_format
  on content_items (format) where format is not null;

-- Renamed to idx_content_items_status_note in migration 102_generic_brief.sql
create index if not exists idx_content_items_open_thread
  on content_items (open_thread) where open_thread is not null;

create index if not exists idx_content_items_scheduled
  on content_items (scheduled_for) where scheduled_for is not null;
