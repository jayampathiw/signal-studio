-- Long-form video pipeline schema.
-- Adds the normalized per-clip / per-reference tables the parallel generation
-- pool needs. See docs/long-form-pipeline-plan.md §6b#1: storing 48 clips in one
-- `scenes` jsonb on one row is unsafe under 8 concurrent workers (read-modify-
-- write clobber). One row per clip / per reference = atomic per-worker updates.

-- ── content_items: project-level long-form fields ────────────────────────────
alter table content_items
  add column if not exists target_duration_sec integer;

-- Chapter grouping (reused from the original chapter_chain design).
-- Shape: [{ n, title, scene_range:[from,to] }]
alter table content_items
  add column if not exists chapters jsonb;

-- Add a 'planning' project stage (Phase 2 done → references generating/gating).
alter table content_items
  drop constraint if exists content_items_status_check;
alter table content_items
  add constraint content_items_status_check
  check (status in (
    'brief', 'storyboard', 'planning', 'generating',
    'pending', 'rendering', 'rendered', 'publishing', 'posted', 'failed', 'blocked'
  ));

-- ── content_references: the character/motif reference-image bible ─────────────
-- One row per recurring visual anchor (character, location, motif). Generated
-- once, gated by image-quality-gate, then its higgsfield_media_id is reused as
-- the --image reference for every clip that cites it.
create table if not exists content_references (
  id            bigserial primary key,
  project_id    bigint not null references content_items(id) on delete cascade,
  key           text not null,                    -- stable slug, e.g. 'keeper_gill'
  description   text,                              -- what it is (for humans)
  prompt        text not null,                     -- image-generation prompt
  higgsfield_media_id text,                        -- reusable upload/job id → passed to clips
  url           text,                              -- generated + gated image URL
  status        text not null default 'pending'
    check (status in ('pending','generating','generated','validating','passed','failed','blocked')),
  retry_count   integer not null default 0,
  fail_reason   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (project_id, key)
);

create index if not exists idx_content_references_project_status
  on content_references (project_id, status);

-- ── content_clips: one row per scene/clip (the resume backbone) ───────────────
-- The parallel pool claims/updates a single row atomically. `kind='text_card'`
-- rows carry no generated clip (assembled directly) and are inserted as 'passed'.
create table if not exists content_clips (
  id            bigserial primary key,
  project_id    bigint not null references content_items(id) on delete cascade,
  scene_n       integer not null,                  -- 1-based scene order
  kind          text not null default 'clip'
    check (kind in ('clip','text_card')),
  title         text,                              -- optional scene label
  visual_prompt text,                              -- clip prompt, art direction baked in (null for text_card)
  vo_text       text,                              -- narration for this scene
  audio_cue     text,                              -- SFX direction (🔊)
  text_overlay  text,                              -- on-screen text / title-card content (📝)
  duration_sec  numeric,                           -- target window seconds
  reference_keys text[] not null default '{}',     -- content_references.key values this clip cites
  higgsfield_job_id text,                          -- set on submit
  clip_url      text,                              -- set on generation success
  vo_url        text,                              -- per-scene TTS output (Phase 6)
  status        text not null default 'pending'
    check (status in ('pending','generating','generated','validating','passed','failed','blocked')),
  retry_count   integer not null default 0,
  fail_reason   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (project_id, scene_n)
);

create index if not exists idx_content_clips_project_status
  on content_clips (project_id, status);

-- ── updated_at triggers (reuse set_updated_at() from 100_content_items.sql) ───
drop trigger if exists trg_content_clips_updated_at on content_clips;
create trigger trg_content_clips_updated_at
  before update on content_clips
  for each row execute function set_updated_at();

drop trigger if exists trg_content_references_updated_at on content_references;
create trigger trg_content_references_updated_at
  before update on content_references
  for each row execute function set_updated_at();
