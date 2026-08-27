-- Shot list v2: long-form vs Shorts template detection + ingestion.
-- Two templates (agreed 2026-07-29): both are one-clip-per-file, pipe-table
-- scene lists with a `key: value` header. clip_type in the header decides
-- which template a file follows: 'long_form' (timecode-driven) or 'short'
-- (role-driven: Hook/Stakes/Build/Peak/End Card). Fresh start — the 5
-- published long-form videos + Wave 1 Shorts stay on the old bullet-list
-- format and are not retrofitted.

-- ── content_items: clip type + slug + parent linkage + misc header fields ────
alter table content_items
  add column if not exists clip_type text not null default 'long_form'
    check (clip_type in ('long_form', 'short'));

alter table content_items
  add column if not exists video_slug text;

create unique index if not exists idx_content_items_video_slug
  on content_items (video_slug) where video_slug is not null;

-- Shorts reference the long-form project they're cut from. Nullable —
-- long-form rows never set this; a Short's parent must already exist as a
-- content_items row (resolved by video_slug at import time).
alter table content_items
  add column if not exists parent_project_id bigint references content_items(id);

create index if not exists idx_content_items_parent on content_items (parent_project_id);

-- Header fields that don't need to be queried/filtered on: mode,
-- match_metadata, fact_check_source, global_art_direction (long-form);
-- shorts_role, hook_formula, stakes_clause, related_video_link_set,
-- posting_dates, language (short). One jsonb bucket beats a dozen
-- rarely-queried columns — same pattern as the existing `seo`/`audio_plan`.
alter table content_items
  add column if not exists shot_list_meta jsonb;

-- ── content_clips: per-scene QC fields from the new template's scene table ───
alter table content_clips
  add column if not exists scene_role text,              -- Cold Open / Hook / Stakes / Build 1 / Peak / End Card / …
  add column if not exists word_count_check text,         -- 'pass' | 'fail'
  add column if not exists kit_tag text,                  -- @xxx reference-kit tag, or null
  add column if not exists kit_tag_check text,             -- 'pass' | 'fail' | 'n/a'
  add column if not exists captions_mode text,             -- 'auto' | 'no_captions'
  add column if not exists tier_overlay text,               -- 'none' | 'tier1' | 'tier2'
  add column if not exists pattern_interrupt_check text,    -- 'pass' | 'fail' | 'n/a (<10s)'
  add column if not exists shorts_source_flag text;         -- 'peak' | 'reversal' | 'meaning' | null (long-form only)

-- ── content_stills: asset provenance from the new template's asset_type field ─
alter table content_stills
  add column if not exists asset_type text
    check (asset_type is null or asset_type in ('new_still', 'reused_crop', 'vertical_native_redesign', 'title_card')),
  add column if not exists asset_ref text;                  -- source scene ref (reused_crop) or composition note (vertical_native_redesign)
