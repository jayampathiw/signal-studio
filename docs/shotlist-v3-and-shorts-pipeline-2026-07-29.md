# Session summary — 2026-07-29: Shorts pipeline, dashboard rebuild, shot list v3

Covers everything done in this session, in order. Local dashboard testing against the
shared Supabase project (`nnxtvbolhuvihlpwppbj`), ahead of a production deploy.

## 1. Shorts 9:16 pipeline — local render test

- Ran `apps/video/scripts/longform/assemble-short-rewrite.mjs` locally against
  `content/shorts/silenced/silenced-s1-tah-miss-EN-v4.json` — rendered cleanly
  (8 scenes, ~35.7s, layered sound design, watermark). Confirmed the local
  CLI/JSON-config Shorts path works end-to-end before touching the dashboard.
- Later regenerated `silenced-s1-tah-miss-EN-v5.mp4` from a new scene→image
  mapping (`temp/Shortlist/Scene to Image Mapping.txt` + images under
  `temp/Shortlist/new/`) — same VO/timing/sound design as v4, new images
  copied into `content/shorts/silenced/vertical-assets/*-v5.jpeg`.

## 2. Dashboard nav + branding cleanup

- Started `apps/dashboard` locally (`npm start`, port 4200) pointed at the
  shared Supabase project.
- Added a "🎬 Video Channels" nav link (originally "Longform") to all 5
  top-level pages (Articles, Reels, On This Day, Metrics, Upload) — previously
  no page linked to `/longform` at all.
- Renamed the football channel's display name from "⚽ Football Documentary" /
  "South American Football Stories" to **"⚽ The Underdog Archives"** in both
  `longform-videos.component.ts` and `longform-list.component.ts` (matches the
  channel's actual logo file, `underdog_archive_standalone_icon.png`).

## 3. "New Video" modal rebuild

- Replaced the manual "Video Title" text field with an **upload-or-paste shot
  list** flow: choose a `.md` file *or* paste markdown into a textarea, either
  populates a live preview (clip type, title, video slug, scene count,
  parent for Shorts) and drives project creation — no manual title typing.
- Added `Component`-level clip_type badges (🎬 Long-form / ⚡ Short) to the
  video list and detail page header, plus a "Short of: #N" parent link.

## 4. Storyboard stage: 3-way upload picker

- The Storyboard stage's still-image upload previously showed all 3 methods
  (individual click-to-upload grid, bulk filename upload, Claude Vision
  auto-match) simultaneously. Rebuilt as a **picker first** — choose one
  method, only that flow shows, with a "← Back" link to change methods.
- Added a real gate on the "Next →" button (project-detail page): disabled
  until `uploadedCount === totalSlots`, with a "Upload N more stills" hint —
  previously it let you advance to Gate 3 with stills still missing.

## 5. Shot list v3 — the big one

**Format:** Two templates (long-form, Shorts), both a `key: value` header +
pipe-table scene list, one-clip-per-file. `clip_type` in the header picks
which. Fresh start from Video #7 — the 5 published long-form videos + Wave 1
Shorts are **not** retrofitted, they stay in their old bullet/emoji format.

**Schema** (`supabase/migrations/20260729_shotlist_v2.sql`): `content_items`
gained `clip_type`, `video_slug` (unique), `parent_project_id` (self-FK for
Shorts), `shot_list_meta` jsonb; `content_clips` gained QC columns
(`scene_role`, `word_count_check`, `kit_tag`, `kit_tag_check`,
`captions_mode`, `tier_overlay`, `pattern_interrupt_check`,
`shorts_source_flag`); `content_stills` gained `asset_type`/`asset_ref`.

**Parser** (`supabase/functions/import-shotlist/index.ts`, fully rewritten):
parses the header (including block scalars and nested mappings like
`posting_dates`) and the scene table generically by column name. Detects
`clip_type`, requires `title`/`video_slug`, resolves a Short's
`parent_video_slug` against an existing project (clear 404 if missing).

**Music/audio v3 addition** (added mid-session, after discovering the shot
list had no field driving background music at all — only SFX via
`audio_cue`):
- Long-form: new `music_bed` (required every row, 7-value enum:
  `somber/tension/drone/release/reflective/hum_only/silence`) +
  `music_gain_db` (optional override). Consecutive same-value rows merge into
  `content_items.audio_plan` segments — non-adjacent repeats of the same bed
  never merge. Gain falls back to a flat `-23dB` (only for the 5 real mood
  beds; `silence`/`hum_only` get `gain_db: null`, no file to apply gain to).
- Shorts: same `music_bed` (optional — blank = no bed, common for Hook) +
  new `heartbeat_layer` (`yes`/blank), both merged independently by
  `scene_id` into `shot_list_meta.sound_design.{bed, heartbeat}`. No gain
  field — flat `-20dB` default, unchanged.
- `audio_cue` is untouched in both — still SFX one-shots/ambience only, via
  `apps/video/src/longform/map-audio-cues.js`.
- Validated the merge algorithm against hand-computed worked samples in the
  spec (including the tricky non-adjacent-repeat and heartbeat-offset-from-bed
  cases) — exact match.
- Fixed a real bug the testing surfaced: a "let it ring out" audio_cue was
  double-triggering an SFX on top of itself. Added a `noop` rule type to
  `map-audio-cues.js` (distinct from the existing `silence` hold marker) so
  ring-out language produces no new one-shot.

**Generation trigger** (`trigger-longform` edge function): now reads
`clip_type` and appends `--clip-type=short` to `assemble_flags` for Shorts on
the assemble stage — the one dispatch input the `reel-pipeline` GitHub
workflow already forwards untouched, so no workflow changes needed.
**Not built:** the actual cloud-side Shorts renderer that reads
`content_stills`/`content_clips` from Supabase (DB-driven, 1080×1920) —
Shorts still render via the local `assemble-short-rewrite.mjs` CLI path
against a static JSON config. This is a standalone follow-up on the scale of
that script itself.

## 6. Audio kit reorganization

- Moved all local audio-kit files into `content/audio-kit/beds/` and
  `content/audio-kit/sfx/` (matching the manifest's own `kind` field).
  Updated `import-audio-kit.mjs` to read from the right subfolder per key.
  R2 upload paths unchanged (still flat `audio-kit/*.mp3`).
- Fixed `piano_sad_solo`: was never actually uploaded to R2 (manifest pointed
  at a local file path) — moved into `beds/`, added to `CANONICAL`, re-ran
  import. Manifest now **23/23 OK** on `--check`.
- Added 4 new SFX keys (user-supplied files, reviewed by filename/duration
  since audio can't be judged without listening): `crowd_clap`,
  `crowd_applause`, `crowd_cheer`, `stadium_crowd_energy`. Wired
  `clap`/`applause`/`cheer` patterns into `map-audio-cues.js`.
- Added 3 new bed keys (user-supplied, same caveat): `tragic_loss`,
  `epic_dramatic`, `ethereal_mystery`. Added all 7 new keys (4 SFX + 3 bed)
  to the Audio Plan editor's dropdown (`longform-audio.component.ts`) so
  they're selectable in the manual editor, not just importable.
- Updated `content/audio-kit/SOURCES.md` to document the new folder layout
  and all new files.

## 7. Shorts Sound Design view (new)

- The Audio Plan editor only ever reads `content_items.audio_plan`
  (long-form's flat segment array) — Shorts' `shot_list_meta.sound_design`
  had no UI at all, so it looked "empty" even when correctly populated.
- Added `shorts-sound-design.component.ts` — a read-only card listing bed
  segments and the heartbeat span by scene range. Shown instead of the Audio
  Plan editor when `clip_type === 'short'`.

## 8. End-to-end validation

- Ran the full v3 template + music_bed/heartbeat_layer merge logic through a
  deliberately edge-case-heavy Shorts test file (non-adjacent bed repeat,
  heartbeat offset from bed in the *opposite* direction from an earlier test,
  `audio_cue` + `music_bed` both populated on the same row, no
  `music_gain_db` column at all). Verified via a standalone script against
  the real deployed parser + the real `map-audio-cues.js` — all checks
  passed.
- Walked the same flow through the actual dashboard UI (create parent
  long-form project `silenced-test` → create Shorts project against it) to
  confirm the browser path matches the API path. Hit and resolved a few
  false starts along the way (wrong file pasted, stale test-project slug
  collisions) — all traced to sequencing/copy-paste, not template or parser
  bugs. Test projects created during this are titled "(delete me)" for easy
  cleanup.

## Known follow-ups / open items

- Shorts DB-driven renderer (content_stills/content_clips → 1080×1920 mp4)
  not built — still CLI/JSON-config only.
- `stadium_crowd_energy` SFX key has no `audio_cue` text pattern wired yet —
  needs a decision on what phrase should trigger it.
- `crowd_clap` vs `crowd_applause` — both applause-type sounds, worth a
  listen to confirm they're distinct enough to justify two separate keys.
- Per-mood default gain table for `music_gain_db` was explicitly deferred —
  flat `-23dB`/`-20dB` fallbacks kept for now; revisit only if a real project
  shows this producing an audibly wrong mix.
