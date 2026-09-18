# Implementation Plan — Long-Form v2 "Image-First" Pipeline

> **Status:** Approved decisions locked (2026-07-05) · **Scope:** project #29 (Silenced) re-production + permanent pipeline upgrade
> **Inputs:** `docs/silenced-shotlist-IMAGE-FIRST.md` (v2 shotlist), `content/longform/29/prompts-v2.md`
> (62 self-contained prompts), production playbook → `.claude/skills/longform-doc-playbook`
> **Related:** `docs/google-image-workflow-plan.md` (G-phases, image surface), `docs/long-form-hybrid-plan.md` (H-phases)
> **Execution:** `docs/longform-v2-task-breakdown.md` — readiness audit + P0–P12 phase/task breakdown (the buildable version of this plan)

---

## 1. Decisions (locked with user 2026-07-05)

| #   | Decision            | Choice                                                                                                                                                                                                                                                                                  |
| --- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Multi-still schema  | **New `content_stills` child table** — one row per still/cut, `content_clips` stays the scene row (VO, duration, kind)                                                                                                                                                                  |
| D2  | Editor layer        | **Full ffmpeg automation** — eased Ken Burns, A/B/C cuts, timed overlays, grain, music bed, −14 LUFS. Parallax approximated as PUSH for now                                                                                                                                             |
| D3  | Output resolution   | **1920×1080** (stills generated at 2K → headroom for 1.15–1.30 zooms)                                                                                                                                                                                                                   |
| D4  | Playbook guidelines | **New skill** `.claude/skills/longform-doc-playbook` — auto-applied to every future long-form script/shotlist/prompt review                                                                                                                                                             |
| D5  | Music beds          | **Curated free library** (Pixabay Music / YouTube Audio Library) — one-time download of 5 mood beds into a reusable channel audio kit, rehosted to R2                                                                                                                                   |
| D6  | SFX                 | **Curated free kit** (Pixabay SFX / Freesound CC0) — ~11 generic cues downloaded once, reused across all videos                                                                                                                                                                         |
| D7  | Mix design          | **Segmented bed + ambience**: per-act music segments from `audio_plan` jsonb, 2s crossfades, stadium-ambience layer, sidechain ducking under VO, hard gaps at scripted silences, −14 LUFS master                                                                                        |
| D8  | Image generation    | **Manual for now**: user copies prompts from the UI into Google Flow and uploads the results back through the UI. The image stage is a _paused gate_, not an API call. Gemini API path stays scaffold-able later without redesign (image_source routing)                                |
| D9  | Review model        | **Paused gates in UI** — 4 checkpoints: script/shotlist → kit reference sheets → per-act stills (kit drift) → final preview. Orchestrated runs stop at each; dashboard approval advances                                                                                                |
| D10 | UI                  | **Extend the Angular dashboard** (`apps/dashboard`) with a long-form section                                                                                                                                                                                                            |
| D11 | Runtime             | **GitHub Actions from day one** (public `reel-pipeline` repo pattern, deploy-key checkout). Because gates + manual images make runs multi-day, the pipeline is **event-driven**: each stage is a short dispatched job; state lives in Supabase; the dashboard dispatches the next stage |

---

## 2. Gap analysis — current code vs. v2 flow

| #   | Gap                                                                                                                                                                                                                        | Where                                | Severity |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | -------- |
| 1   | One image per scene only (`unique(project_id, scene_n)`, single `clip_url`) — v2 needs 1–3 stills/scene with per-cut timecodes                                                                                             | schema                               | blocking |
| 2   | Single linear zoom `zoom+0.0015` capped at **1.5×** — violates the 1.08–1.15 guideline, no easing, no PULL/SMASH/pan/micro-push                                                                                            | `assemble-longform.mjs buildStill()` | blocking |
| 3   | No audio engineering: raw VO mux, no −14 LUFS master, no music bed at −22…−25 dB, no scripted silences                                                                                                                     | `assemble-longform.mjs`              | blocking |
| 4   | Timed text overlays on stills unsupported (`text_overlay` only rendered for `text_card`) — S12 "16 years"@2:07, S21 card-over-still, S25 "21 shots · 16 corners"@4:22, S30 "GOAL DISALLOWED"@5:13, S40 scoreline@7:00, S48 | `assemble-longform.mjs`              | blocking |
| 5   | Asset-reuse scenes (S43 = regraded S04-B, S44 = S07 reversed) and editor-build graphics (S14 flags/ranking, S51 end plate) have no representation                                                                          | schema + assembly                    | blocking |
| 6   | `import-stills.mjs` only matches `S<n>.png` — v2 files are `S01-A.png`                                                                                                                                                     | import                               | blocking |
| 7   | `prompt-sheet.mjs` prefixes ART_DIRECTION — v2 prompts are **self-contained** (double-prefix would corrupt them); no cut IDs, no act-by-act generation-order output, no kit-reference-sheet step                           | prompt sheet                         | blocking |
| 8   | Output 1280×720 hardcoded                                                                                                                                                                                                  | assembly                             | high     |
| 9   | No unified grain/particle pass, no warm↔cold grade support                                                                                                                                                                 | assembly                             | high     |
| 10  | Kit reference sheets (GK-GILL, PY-OUTFIELD, DE-OUTFIELD, DE-GK, GK-90s) not seeded as `content_references` rows for #29                                                                                                    | data                                 | high     |
| 11  | VO text changed in v2 (TTS-normalized: "twenty ten", "June twenty-ninth", "one-hundred-and-second minute") — affected scenes' `vo_url` must be re-generated, unchanged ones preserved                                      | data + TTS                           | high     |
| 12  | Title cards: plain 60px drawtext, no serif, no hold/fade timing (S50: hold then fade)                                                                                                                                      | assembly                             | medium   |
| 13  | `generate-stills.mjs` reads `content_clips` — must route per-`content_stills` row                                                                                                                                          | generation                           | medium   |
| 14  | Google workflow plan (G2/G4) keys rows as `29-S14` — must become `29-S14-A`                                                                                                                                                | docs                                 | minor    |
| 15  | `docs/*.md:Zone.Identifier` Windows artifacts checked in                                                                                                                                                                   | repo hygiene                         | minor    |
| 16  | v2 shotlist lives only in `docs/` — scripts read `content/longform/<id>/`; canonical copies needed there                                                                                                                   | data                                 | minor    |

---

## 3. Schema — migration `20260705_stills_v2.sql` (Phase V1)

```sql
create table if not exists content_stills (
  id            bigserial primary key,
  project_id    bigint not null references content_items(id) on delete cascade,
  scene_n       integer not null,
  cut           text not null default 'A' check (cut in ('A','B','C','D')),
  prompt        text,                          -- full self-contained prompt (null for reuse rows)
  motion        text not null default 'push'
    check (motion in ('push','pull','smash','micro_push','pan_lr','pan_rl','parallax','hold')),
  start_sec     numeric not null,              -- offset within the scene
  end_sec       numeric not null,
  image_source  text check (image_source is null or image_source in
                  ('reference','higgsfield','fal','cloudflare','google','reuse')),
  reuse_of      text,                          -- e.g. 'S04-B' (image_source='reuse')
  regrade       text,                          -- optional ffmpeg grade hint: 'warm_amber' | 'cold_blue' | null
  reference_keys text[] not null default '{}',
  clip_url      text,
  status        text not null default 'pending'
    check (status in ('pending','generating','generated','validating','passed','failed','blocked')),
  retry_count   integer not null default 0,
  fail_reason   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (project_id, scene_n, cut)
);
-- + idx (project_id, status) + set_updated_at trigger (same pattern as content_clips)

alter table content_clips drop constraint if exists content_clips_kind_check;
alter table content_clips add constraint content_clips_kind_check
  check (kind in ('clip','still','text_card','editor_build'));

alter table content_clips add column if not exists overlays jsonb;
-- overlays: [{ "at": 6.0, "text": "16 years", "style": "small_cream" | "lower_third" | "stamp" }]

alter table content_clips add column if not exists sfx jsonb;
-- sfx: [{ "at": 0.0, "key": "drum_hit", "gain_db": -8 }] — parsed from the shotlist 🔊 line;
-- key 'silence' is a mix directive (music+ambience gap), not a file.

alter table content_items add column if not exists audio_plan jsonb;
-- audio_plan: [{ "from": 31, "to": 144, "track": "bed_somber", "gain_db": -23, "fade": 2 }]
-- seeded from act boundaries; human-editable before assembly.
```

**Back-compat rule (load-bearing):** the assembler treats `content_stills` as _optional_. A `still`
scene with zero `content_stills` rows falls back to `content_clips.clip_url` exactly as today, so v1
projects and mixed states keep working. Nothing in `content_clips` is dropped or renamed.

---

## 4. Build phases

### V0 — Files (this commit, no code)

- [x] This plan.
- [x] `content/longform/29/prompts-v2.md` — canonical copy of the 62-prompt Generation Prompts v2.
- [x] `.claude/skills/longform-doc-playbook/SKILL.md` — production playbook skill (D4).
- [ ] Copy `docs/silenced-shotlist-IMAGE-FIRST.md` → `content/longform/29/shotlist-v2.md` (gap 16).
- [ ] Delete `*.md:Zone.Identifier` artifacts (gap 15).

### V1 — Migration

As §3. Apply via the reconciled `db push` flow (memory: `project-migration-apply`).

### V2 — Seeder: `seed-stills-v2.mjs --project 29 [--dry]`

Parses `content/longform/29/prompts-v2.md` (prompt table: ID, scene, timecode, notes, prompt) and
`shotlist-v2.md` (motion lines, VO, overlays, audio cues) and:

- **Upserts `content_stills`**: 62 generated rows (`image_source='google'`) + reuse rows
  (S43-A `reuse_of='S04-B'` `regrade='warm_amber'`; S44-A/B `reuse_of='S07-B'/'S07-A'`).
  Motion parsed from the 🎞️ line (PUSH/PULL/SMASH/micro/pan/parallax); timecodes → `start_sec`/`end_sec`
  relative to scene start.
- **Updates `content_clips`** per scene: `vo_text` (v2 normalized), `kind`
  (`still` | `text_card` S03/S50 | `editor_build` S14/S51), `overlays` jsonb, `audio_cue`, `duration_sec`.
- **VO diff**: where `vo_text` changed vs. DB, null out `vo_url` and reset status so `generate-tts.mjs`
  regenerates only those scenes. Unchanged VO is preserved (idempotent).
- **Seeds `content_references`** kit rows: `GK-GILL`, `PY-OUTFIELD`, `DE-OUTFIELD`, `DE-GK`, `GK-90s`
  with the reference-sheet prompts (anonymous figure, front view, neutral pose, full kit, plain dark
  background + inline kit spec). These are generated & approved **before** any scene stills.

### V3 — Prompt sheet v2: rewrite `prompt-sheet.mjs`

- Source: `content_stills` (`status='pending'`, `image_source='google'`), joined to refs.
- **No ART_DIRECTION prefix** — v2 prompts are self-contained (prefix would double the style block).
- Output ordered by the mandated generation order: ① 5 kit reference sheets (with approval checklist)
  → ② Cold Open → ③ Acts 1–5, each act section headed with its kit-drift review checklist
  ("do not start the next act until this act passes").
- Filenames use the cut ID: `S01-A.png`. Reference-sheet section lists the approved ref image to
  attach in Flow's img2img slot per still.

### V4 — Import v2: update `import-stills.mjs`

- Filename regex → `/^S(\d+)(?:-([A-D]))?\./i`; with a cut letter → match `content_stills` row;
  without → legacy `content_clips` path (unchanged, keeps v1 projects importable).
- `--refs` mode: `GK-GILL.png` etc. → upload to `longform/<p>/refs/` → `content_references.url`,
  `status='passed'`.
- R2 keys: `longform/<p>/stills/S<n>-<cut>.png`. Same idempotent skip guard (`generated`/`passed`).

### V5 — Assembly v2: rewrite `assemble-longform.mjs`

Constants: **1920×1080 @ 25fps** (D3). Per scene:

1. Fetch `content_stills` ordered by `cut`; fall back to `content_clips.clip_url` if none (§3 rule).
2. Resolve `reuse` rows: source = the referenced still's R2 file; apply `regrade`
   (warm_amber → `colorbalance`/`curves` toward amber; cold_blue inverse); S44 plays B→A with PULL.
3. Render each cut with its motion (all eased — quadratic ease-in-out on the zoompan expression):
   - `push` 1.00→1.12 over cut duration · `micro_push` →1.06 · `pull` 1.15→1.00
   - `smash` 1.00→1.30 in 1.5s then hold
   - `pan_lr`/`pan_rl` lateral crop-window pan at constant scale 1.10
   - `parallax` → rendered as `push` (D2; true 2.5D deferred — flagged in output log)
4. Hard-cut concat of cuts at their `start_sec` boundaries; VO spans the whole scene.
5. **Overlays**: `drawtext` with `enable='between(t,at,end)'` from `content_clips.overlays`;
   styles: `small_cream` (36px, cream, 80% alpha), `lower_third` (48px, cream, bottom third),
   `stamp` (64px, white, boxed). Never generated into the image — always editor/ffmpeg text.
6. **Text cards**: white **serif** (DejaVu Serif or bundled font), S03 hold 4s hard cut,
   S50 hold then 1s fade-to-black.
7. **Editor builds**: S14 → navy plate + drawtext ranking ("12th in the world vs. 34th") between two
   flat flag color-bars (pure ffmpeg drawbox); S51 → navy end plate + channel text + subscribe zone.
   (Good enough v1; Remotion upgrade later if wanted.)
8. **Unify pass** on every scene: `noise=alls=6:allf=t` film grain + subtle vignette.
9. **Audio**: per-scene VO placed at scene start; `--music <file>` (default from
   `channels.js → football/documentary/EN`, reuse the reel `music:` pattern) looped under the full
   timeline at −23 dB, dipped −6 dB more under VO (`sidechaincompress` or simple volume automation);
   scripted silences honored (music gap on S38's 2-second hold). Final master: **two-pass `loudnorm`
   to −14 LUFS integrated** on the concatenated output.
10. Concat re-encoded scenes with `-c copy` (uniform encode params), upload
    `longform/<p>/final.mp4`, update `content_items` — unchanged.

### V6 — Generation routing: `generate-stills.mjs`

- Add `--table stills` mode (default when `content_stills` rows exist): iterate per-still rows;
  `google` → skip (Flow/Sheet owns it, log points at prompt sheet + import), `higgsfield` →
  existing soul.js route (kept as rollback), `reference`/`reuse` → no-op (assembly resolves).

### A1 — Channel audio kit (one-time, manual download + scripted import)

The only manual step in the audio pipeline, done **once** and reused by every future video.

- Location: `content/audio-kit/` (gitignored binaries) → rehosted to R2 `audio-kit/<key>.<ext>` by
  a new `import-audio-kit.mjs` (validates filenames against the manifest keys, uploads, writes
  `content/audio-kit/manifest.json` with the R2 URLs — the manifest IS committed).
- File naming = manifest key exactly (`bed_somber.mp3`, `whistle.wav`, …).

**Shopping list — music beds** (Pixabay Music / YouTube Audio Library; instrumental, no vocals,
license: free for monetized YouTube):

| Key              | Mood                                       | Search terms                            | Min length |
| ---------------- | ------------------------------------------ | --------------------------------------- | ---------- |
| `bed_somber`     | melancholic piano/strings, ~60–70 BPM      | "sad cinematic piano documentary"       | 2 min      |
| `bed_tension`    | dark pulsing build, low percussion         | "dark tension cinematic suspense build" | 2.5 min    |
| `bed_drone`      | minimal dark ambient, no melody/percussion | "dark ambient drone minimal"            | 2 min      |
| `bed_release`    | triumphant emotional orchestral swell      | "epic emotional triumph orchestral"     | 1 min      |
| `bed_reflective` | warm, hopeful, sparse piano                | "hopeful calm reflective piano ambient" | 2 min      |

**Shopping list — SFX** (Pixabay SFX / Freesound CC0):

| Key              | Sound                                          | Used at (#29)                            |
| ---------------- | ---------------------------------------------- | ---------------------------------------- |
| `stadium_hum`    | crowd murmur ambience, loopable ≥60s           | S1 rise, ambience layer all match scenes |
| `crowd_surge`    | crowd roar swell 3–5s                          | S33 save                                 |
| `crowd_eruption` | full celebration roar 8–12s                    | S39–40 release                           |
| `drum_hit`       | low cinematic drum/boom                        | S7 wall smash                            |
| `bass_pulse`     | deep sub pulse/drop                            | S8 name beat                             |
| `musical_hit`    | impact braam/stinger                           | S20, S27 goals, title card               |
| `whistle`        | single referee whistle                         | S30                                      |
| `heartbeat`      | slow heartbeat, loopable                       | S37 strip-down                           |
| `riser`          | 1.5s tension riser                             | smash-cut entries                        |
| `hum_cut`        | abrupt cut-to-silence tail (or handled in mix) | S2, S28 collapse                         |

### A2 — Seeder: 🔊 → structured audio (extends V2)

- Keyword-map each scene's `audio_cue` text to `sfx` jsonb entries (`hum→stadium_hum`,
  `drum→drum_hit`, `whistle→whistle`, `heartbeat→heartbeat`, `erupt/crowd→crowd_*`,
  `silence/do not fill→{key:'silence'}`). Unmatched cues are logged for manual mapping — never
  silently dropped.
- Seed `content_items.audio_plan` from act boundaries (#29):
  `0:00–0:31 none (hum only) → 0:31–3:17 bed_somber → 3:17–5:18 bed_tension →
 5:18–6:54 bed_drone → 6:54–7:15 bed_release → 7:15–9:03 bed_reflective`.

### A3 — Assembly audio graph (extends V5 step 9)

Four layers mixed after video concat, then mastered:

1. **VO** — per-scene, placed at scene starts (level anchor).
2. **Ambience** — `stadium_hum` looped at −30 dB under match scenes (audio_plan can scope it).
3. **Music** — audio_plan segments at −23 dB, 2s crossfades (`acrossfade`), sidechain-ducked
   −6 dB under VO (`sidechaincompress`), hard-gapped across `silence` directives and scripted holds.
4. **SFX** — one-shots via `adelay` at absolute offsets from `sfx` jsonb.
   Master: two-pass `loudnorm` → **−14 LUFS integrated, −1.0 dBTP**.

### V7 — Docs + G-plan touch-ups

- `docs/google-image-workflow-plan.md`: Sheet `row_key` → `29-S01-A`; export reads `content_stills`.
- `docs/longform-29-how-we-made-it.md`: append v2 flow steps.
- `CLAUDE.md` (project): one line pointing at the playbook skill for long-form work.

---

## 5. One-shot automation architecture (from scratch → published)

### 5.1 State machine (the whole flow)

`content_items.status` drives everything. New long-form statuses (additive check-constraint update,
folded into the V1 migration):

```
brief ──[dispatch: script]──► scripting ──► awaiting_script_approval        (GATE 1, UI)
      ──[approve → dispatch: seed]──► seeding+tts ──► awaiting_refs         (GATE 2, UI: copy 5 kit
                                                       prompts → generate in Flow → upload → approve)
      ──[refs approved]──► awaiting_stills                                  (GATE 3, per act: copy
                                                       prompts → upload → approve act; reject resets
                                                       a still to pending and it reappears)
      ──[all acts approved → dispatch: assemble]──► rendering ──► awaiting_final_approval (GATE 4,
                                                       preview player in UI)
      ──[approve → dispatch: publish]──► publishing ──► posted
```

Failures at any stage → `failed` + `status_note` (existing convention). Every stage is idempotent
and resumable (same guards as the V-phase scripts) — re-dispatching a stage never duplicates work.

### 5.2 Orchestration phases (O)

- **O1 — `longform.yml` in `reel-pipeline`** (public repo, free minutes; checkout signal-studio via
  the existing deploy key). `workflow_dispatch` inputs: `project_id`, `stage`
  (`script` | `seed` | `assemble` | `publish`). Runner setup: node + pnpm, `ffmpeg` (apt), Kokoro
  (pip, models cached), R2/Supabase/Anthropic secrets (extend the existing reel-pipeline secret set).
- **O2 — `trigger-longform` edge function** — mirror of `trigger-generation`: dashboard calls it
  with `{project_id, stage}`; it flips status to the running state and fires `workflow_dispatch`
  via `GITHUB_PAT`. Gate approvals in the UI call this to advance.
- **O3 — Script stage: `write-script.mjs`** (from-scratch entry point). Input: a brief row
  (topic, match facts, angle). Calls Claude with the **longform-doc-playbook rules as the system
  contract** (ABT, cold open, word budget, TTS normalization, motion language, kit-bible section,
  🔊 cues, self-contained prompts) → writes `content/…/script.md`, `shotlist-v2.md`, `prompts-v2.md`
  formats **identical to #29's**, so the V2 seeder consumes them unchanged. Fact-check block emitted
  alongside for Gate 1 review.
- **O4 — Seed stage** = V2 seeder + `generate-tts.mjs` in one job (TTS has no dependency on images).
- **O5 — Assemble stage** = V5 assembly (+A3 audio) on the runner; needs the audio-kit manifest.
- **O6 — Publish stage** — YouTube upload via `packages/publishers` + SEO package (title/description/
  tags generated at script stage, stored in `seo` jsonb; publisher must read `seo` — same fix as the
  known Wild Eye caption bug).
- **O7 — Stills upload path**: dashboard requests a presigned R2 PUT from a new `upload-still` edge
  function (avoids 15MB PNGs through the function itself), uploads directly, then the function
  records `clip_url` + `status='generated'` on the `content_stills` row. `import-stills.mjs` remains
  as the CLI fallback for bulk local import.

### 5.3 UI phases (U) — `apps/dashboard`, new "Long-form" section

- **U1 — Project list + detail shell**: list of `long_form` items with status chips; detail page
  with a stage tracker (the §5.1 pipeline rendered as steps, current gate highlighted) and per-stage
  action buttons (each → `trigger-longform`).
- **U2 — Gate 1 (script review)**: rendered script + shotlist + word count/WPM check + fact-check
  list; approve / request-rewrite (rewrite note → re-dispatch `script` with feedback).
- **U3 — Gate 2/3 (generation workbench)** — the core screen for manual image gen (D8):
  per-still cards grouped kit-refs-first then by act; each card = prompt with **copy button**,
  target filename (`S01-A.png`), attached-ref reminder, **drag-drop upload slot** (presigned R2),
  thumbnail once uploaded, approve/reject per still, **approve act** button (locked until all
  stills in the act are approved — enforces the act-by-act drift rule). Reject → status `pending`
  - card returns to the queue.
- **U4 — Audio panel**: `audio_plan` segment editor (track dropdown from the kit manifest, from/to,
  gain) + per-scene `sfx` table with unmatched-cue warnings from the seeder.
- **U5 — Gate 4 (final review)**: preview player on `rendered_video_url`, scene timeline with
  per-scene VO/still links, approve-to-publish (→ `publish` stage) or flag scenes (resets those
  scenes and returns to Gate 3).

### 5.4 Build order for the whole program

1. **V1–V6 + A1–A3** (pipeline core, CLI-driven) — prove the #29 rebuild end-to-end locally first.
2. **O1–O2** (workflow + trigger) — same scripts, now dispatchable.
3. **U1 + U3** (shell + generation workbench) — removes the last CLI dependency for production work.
4. **O3 + U2** (script stage + Gate 1) — unlocks true from-scratch one-shot for video #2.
5. **U4, U5, O6** (audio panel, final gate, publish) — completes the loop.

Rationale: #29 already has a script/shotlist, so the CLI core delivers value immediately; the UI
and from-scratch script stage matter most for video #2 onward.

## 6. Execution order for reproducing #29

0. A1 audio kit: download the 15 shopping-list files once → `import-audio-kit.mjs` (can run in
   parallel with everything up to assembly; assembly hard-requires the manifest).
1. V1 migration → V2 seed (`--dry` first, review counts: 62 gen + 3 reuse + 5 refs).
2. `generate-tts.mjs` — regenerates only VO-changed scenes.
3. Prompt sheet → generate **5 kit sheets** in Flow → approve → `import-stills.mjs --refs`.
4. Act-by-act: generate act stills in Flow (attach kit refs) → review for kit drift → import → next act.
5. KEEP-VIDEO check: scenes 1, 2, 4, 25, 26, 40 — keep approved v1 clips **only if** they pass the
   kit bible; a kept clip = scene keeps `kind='clip'` and its `content_stills` rows stay unused.
6. `assemble-longform.mjs --project 29 [--music <bed>]` → review → publish.
7. Peaks rule: if S33/S38/S39 feel dead as stills, generate motion for those 2–3 scenes only.

## 7. Rollback

- `content_clips` untouched for v1 projects; assembler falls back when `content_stills` is empty.
- Higgsfield route stays live behind `--source higgsfield` (needs credits).
- Migration is additive-only (new table, widened check, new nullable column).
