# Long-Form v2 — Readiness Audit & Phase/Task Breakdown

> ⚠️ **SUPERSEDED 2026-07-05.** This plan is kept for reference only.
> **Execute from `docs/longform-final-plan.md`** (phases F0–F10) — the merged
> stills-only, cloud-first final plan. Do not update this document.

> Companion to `docs/longform-v2-image-first-plan.md` (the _what/why_). This doc is the _how_:
> verified prerequisites, then phases where **every phase ends with something runnable and testable**,
> broken into junior-developer-sized tasks with acceptance criteria.

---

## PART 1 — Readiness audit (verified against the codebase 2026-07-05)

### ✅ Verified in place

| What                            | Evidence                                                                                                             |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Kokoro TTS works end-to-end     | `packages/media/tts.js` + `tts.py` (commit fbf49f9); `generate-tts.mjs` runs per-scene                               |
| R2 upload helper                | `packages/media/storage.js → uploadToR2(localPath, {bucket, key})`                                                   |
| ffmpeg has every filter we need | local 4.4.2 has `zoompan, xfade, acrossfade, sidechaincompress, loudnorm` (verified); ubuntu-latest runners ship 6.x |
| Channel entry exists            | `channels.js → 'football/documentary/EN'` with `formats.long_form`, `platforms.youtube {envKey:'FOOTBALL'}`          |
| Dispatch pattern to copy        | `supabase/functions/trigger-generation` (GITHUB_PAT → workflow_dispatch)                                             |
| Dashboard has section pattern   | `apps/dashboard/src/app/{articles,reels,metrics,…}` — long-form slots in beside them                                 |
| v2 inputs on disk               | `content/longform/29/prompts-v2.md`, `shotlist-v2.md`; playbook skill live                                           |
| Idempotency patterns            | `import-stills.mjs` skip guard; `generate-stills.mjs` pending-only + retry/blocked                                   |

### ⚠️ Gaps found (each becomes a task below)

| #   | Finding                                                                                                                                                                                                                                                                                             | Impact |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| F1  | **Bug:** `generate-tts.mjs:76` writes `content_clips.status_note` — that column doesn't exist on `content_clips` (it's `fail_reason`; `status_note` lives on `content_items`). The TTS _error path_ itself throws                                                                                   | P0-2   |
| F2  | **YouTube publisher is a stub** — `packages/publishers/youtube.js` just throws `'not yet implemented'`. The publish stage needs a real YouTube Data API v3 upload **and** one-time OAuth setup (Google Cloud project, client id/secret, refresh token) by the user                                  | P12    |
| F3  | No **act** grouping anywhere — Gate 3 (per-act approval) and prompt-sheet grouping need `content_stills.act`                                                                                                                                                                                        | P1-1   |
| F4  | **Fixed timecodes vs. real VO length conflict** — shotlist gives 12s scenes but Kokoro output may run 13.5s; current assembly `-shortest` would truncate narration mid-word. Assembly must reconcile (scene = max(target, VO+0.4s), scale cut boundaries proportionally, clamp overlay/SFX offsets) | P6-8   |
| F5  | `packages/config/env.js` **throws at import if `FAL_KEY` (etc.) missing** — the Actions runner will crash before doing anything unless all schema vars are set (dummy values acceptable for unused ones)                                                                                            | P9-2   |
| F6  | `generate-stills.mjs` reads `process.env.R2_*` raw while sibling scripts use `env` from `@signal-studio/config` — works locally by accident, breaks on any env-loading change                                                                                                                       | P0-3   |
| F7  | No deterministic **serif font** for title cards — `drawtext` default differs between WSL and the runner                                                                                                                                                                                             | P0-4   |
| F8  | S44 needs a **dissolve** (B→A), plan only specified hard cuts                                                                                                                                                                                                                                       | P6-6   |
| F9  | `content/audio-kit/` binaries need a `.gitignore` entry (manifest committed, media not)                                                                                                                                                                                                             | P0-5   |
| F10 | Dashboard knows nothing of the new `awaiting_*` statuses — status chips/filters must map them                                                                                                                                                                                                       | P10-2  |
| F11 | reel-pipeline runner needs additions: Kokoro pip install + model cache (~300 MB → actions/cache), `SUPABASE_URL`/`SERVICE_ROLE_KEY` as plain env for Node scripts (runner currently only has the MCP token)                                                                                         | P9-1/2 |
| F12 | Live-DB assumptions unverified from code alone: project 29 row state, existing `content_clips` statuses/vo_urls. Must snapshot before seeding                                                                                                                                                       | P0-6   |

### Prerequisites that are **user-side** (cannot be coded around)

1. **Audio kit download** — 15 files from the P5 shopping list (one-time).
2. **YouTube OAuth** — Google Cloud project + OAuth client + one-time consent flow (P12; only blocks the _publish_ stage, nothing earlier).
3. **Image generation** — manual Flow generation at Gates 2/3 (by design, D8).
4. **reel-pipeline secrets** — add the new secrets when P9 starts (list in P9-2).

**Verdict:** everything needed for P0–P8 (the full #29 rebuild) exists locally today. P9–P11 need only
existing secrets replumbed. P12 is the single phase with a hard external dependency (YouTube OAuth).

---

## PART 2 — Phases

Rules used: each phase ships something **demonstrably working** (its Exit Test); tasks are ≤ ~half a
day each, name exact files, and have a pass/fail acceptance check. Order within a phase = dependency
order. `[user]` marks the tasks only the user can do.

---

### P0 — Preflight: fixes + ground truth _(no new features)_

**Goal:** current pipeline is bug-free and the DB state of #29 is known.
**Exit test:** `generate-tts.mjs --project 29 --dry` and `generate-stills.mjs --project 29 --dry` run clean; a forced TTS error lands in `fail_reason`; snapshot file exists.

| #    | Task                                                                                                                                                                                                                | Files                                             | Acceptance                                                                                     |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| P0-1 | Create branch `feat/longform-v2` off `feat/longform-hybrid`; commit the four planning/docs files already created                                                                                                    | git                                               | branch pushed, CI (none) n/a                                                                   |
| P0-2 | Fix F1: TTS error path `status_note` → `fail_reason`                                                                                                                                                                | `apps/video/scripts/longform/generate-tts.mjs`    | temporarily point `synthesise` at a bad path → row's `fail_reason` populated, script continues |
| P0-3 | Fix F6: replace raw `process.env.R2_*` with `env` import (match `import-stills.mjs`)                                                                                                                                | `apps/video/scripts/longform/generate-stills.mjs` | `--dry` runs; grep shows no `process.env.R2` left in file                                      |
| P0-4 | Fix F7: add `apps/video/assets/fonts/DejaVuSerif.ttf` (copy from `/usr/share/fonts`, license file alongside) + export path from a tiny `apps/video/src/longform/fonts.js`                                           | new files                                         | `ffprobe`-free check: `node -e` resolves the path, file > 100 KB                               |
| P0-5 | Fix F9: gitignore `content/audio-kit/*` except `manifest.json`                                                                                                                                                      | `.gitignore`                                      | `git status` clean after dropping an mp3 in                                                    |
| P0-6 | Fix F12: write `scripts/snapshot-project.mjs --project 29` dumping `content_items` row + all `content_clips` (id, scene_n, kind, status, vo_url, clip_url, vo_text hash) to `temp/longform/29-pre-v2-snapshot.json` | new script                                        | file exists, row counts printed match Supabase Studio                                          |

---

### P1 — Schema v2 migration

**Goal:** DB can represent stills/cuts, acts, overlays, SFX, audio plan, new statuses.
**Exit test:** `supabase db push` succeeds; scripted insert/constraint probe passes; #29 untouched.

| #    | Task                                                                                                                                                                                                                                                                                     | Files          | Acceptance                                                        |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------- |
| P1-1 | Write `supabase/migrations/20260705_stills_v2.sql`: `content_stills` table exactly as plan §3 **plus `act smallint`** (F3); indexes + `set_updated_at` trigger                                                                                                                           | new migration  | `db push` clean on a shadow/local db                              |
| P1-2 | Same file: widen `content_clips.kind` check (+`editor_build`), add `overlays jsonb`, `sfx jsonb`; add `content_items.audio_plan jsonb`; extend `content_items` status check with `scripting, awaiting_script_approval, seeding, awaiting_refs, awaiting_stills, awaiting_final_approval` | same migration | inserting each new status value succeeds; an invalid one fails    |
| P1-3 | Probe script `scripts/probe-stills-schema.mjs`: inserts a dummy project + still rows (dup cut must fail, bad motion must fail), then deletes them                                                                                                                                        | new script     | prints `ALL CONSTRAINTS OK`                                       |
| P1-4 | Apply to production via the reconciled push flow (memory `project-migration-apply`)                                                                                                                                                                                                      | —              | `db push` on prod clean; P0-6 snapshot re-run shows #29 unchanged |

---

### P2 — Seeder + parsers (v2 data into the DB)

**Goal:** one command turns `prompts-v2.md` + `shotlist-v2.md` into complete DB state for #29.
**Exit test:** `seed-stills-v2.mjs --project 29 --dry` reports **62 generated / 3 reuse / 5 refs / 44 scenes**; real run then a second run reports 0 changes (idempotent); VO diff resets only genuinely changed scenes.

| #    | Task                                                                                                                                                                                                                   | Files       | Acceptance                                                                                                                       |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------- |
| P2-1 | Parser: `apps/video/src/longform/parse-prompts-v2.js` — reads the markdown prompt tables → `[{id:'S01-A', scene_n, cut, act, timecode:{from,to}, notes, prompt}]`; rows with `—` prompt are reuse/editor entries       | new module  | unit run over `content/longform/29/prompts-v2.md` prints 62 prompt rows + reuse/editor rows; spot-check S34-C timecode 6:01–6:05 |
| P2-2 | Parser: `apps/video/src/longform/parse-shotlist-v2.js` — reads shotlist-v2 → per scene: `{vo_text, motion per still (🎞️), audio_cue (🔊), overlays (📝 with at-times), keep_video flag}`                               | new module  | prints 51 scenes; S12 overlay `{at:6, text:'16 years'}`; S7-B motion `smash`                                                     |
| P2-3 | Cue mapper: `apps/video/src/longform/map-audio-cues.js` — keyword table 🔊→sfx keys (plan A2); returns `{sfx:[…], unmatched:[…]}`                                                                                      | new module  | S37 → `heartbeat`; S38 → `{key:'silence', hold:2}`; nonsense input lands in `unmatched`                                          |
| P2-4 | Seeder core: `apps/video/scripts/longform/seed-stills-v2.mjs` — upsert `content_stills` (key: project/scene/cut) incl. reuse rows (`image_source='reuse'`, `reuse_of`, `regrade`); `--dry` prints per-act counts table | new script  | Exit-test counts; re-run = 0 inserts                                                                                             |
| P2-5 | Seeder: scene updates — `content_clips` vo_text/kind/duration/overlays/sfx/audio_cue; **VO diff**: `vo_text` changed → `vo_url=null` (uses P0-6 snapshot hashes as cross-check)                                        | same script | scenes with "twenty ten"-style edits reset; unchanged scenes keep vo_url; printout lists which                                   |
| P2-6 | Seeder: kit refs — upsert 5 `content_references` rows (GK-GILL, PY-OUTFIELD, DE-OUTFIELD, DE-GK, GK-90s) with reference-sheet prompts built from the INLINE KIT DEFINITIONS block                                      | same script | 5 rows `pending` in DB; prompts contain "front view, neutral pose, plain dark background"                                        |
| P2-7 | Seeder: `content_items.audio_plan` from the act boundaries (plan A2), `target_duration_sec=543`, status → `awaiting_refs` (only if currently ≥ seeded)                                                                 | same script | audio_plan jsonb has 5 segments + hum-only gap 0–31s                                                                             |

---

### P3 — TTS regeneration

**Goal:** every scene has VO matching v2 narration.
**Exit test:** `generate-tts.mjs --project 29` regenerates only the reset scenes; total VO duration within ±10% of 480s of narration; no `fail_reason` rows.

| #    | Task                                                                                                                                      | Files                                   | Acceptance                                       |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------ |
| P3-1 | Run TTS for #29 post-seed; record per-scene durations via `ffprobe` into a report `temp/longform/29-vo-report.json` (add `--report` flag) | `generate-tts.mjs`                      | report lists every scene: seconds, words, WPM    |
| P3-2 | WPM audit: flag scenes outside 120–160 WPM or where VO > scene window +1.5s (feeds F4 handling)                                           | small check in the same `--report` path | flagged list printed; reviewed by user before P6 |

---

### P4 — Prompt sheet v2 + import v2 (the manual-generation loop, CLI edition)

**Goal:** the copy-paste→upload loop works end-to-end before any UI exists.
**Exit test:** sheet file has refs-first + act sections with checklists; dropping `GK-GILL.png` + `S01-A.png` in a folder and running import marks the right rows `generated`; rerun skips both.

| #    | Task                                                                                                                                                                                                                                                                                        | Files                                          | Acceptance                                                                                   |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------- |
| P4-1 | Rewrite `prompt-sheet.mjs`: source `content_stills` (pending, google) + `content_references` (pending); **no ART_DIRECTION prefix**; sections: ① kit sheets ② acts in order, each with its drift checklist from prompts-v2 GENERATION ORDER; per item: copy-block, filename, refs to attach | `apps/video/scripts/longform/prompt-sheet.mjs` | output for #29: 5 ref blocks then 62 still blocks; zero occurrences of the old global prefix |
| P4-2 | Update `import-stills.mjs`: regex `/^S(\d+)-([A-D])\./i` → `content_stills`; keep bare `S(\d+)` → legacy `content_clips`; R2 key `longform/<p>/stills/S<n>-<cut>.png`                                                                                                                       | same file                                      | mixed folder (S01-A.png + legacy S5.png) routes both correctly in `--dry`                    |
| P4-3 | Add `--refs` mode: `GK-GILL.png` → R2 `longform/<p>/refs/` → `content_references.url`, `status='passed'`                                                                                                                                                                                    | same file                                      | ref row passes; unknown filename warns, doesn't crash                                        |

---

### P5 — Audio kit

**Goal:** reusable channel audio library live on R2 with a committed manifest.
**Exit test:** `node import-audio-kit.mjs --check` prints 15/15 keys OK and every manifest URL returns HTTP 200.

| #    | Task                                                                                                                                                                                                                                                                                  | Files       | Acceptance                                                          |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------- |
| P5-1 | `[user]` Download the 15 shopping-list files (plan A1 tables) into `content/audio-kit/`, named exactly by key; note source URL + license per file in `content/audio-kit/SOURCES.md`                                                                                                   | audio files | 15 files present, SOURCES.md committed                              |
| P5-2 | `apps/video/scripts/longform/import-audio-kit.mjs`: validate names against the canonical key list, probe each with `ffprobe` (duration, sample rate), upload to R2 `audio-kit/`, write `content/audio-kit/manifest.json` `{key:{url,duration,kind}}`; `--check` mode re-verifies URLs | new script  | Exit test; a misnamed file produces a clear error naming valid keys |

---

### P6 — Assembly v2: video layer

**Goal:** stills → moving, graded, overlaid 1080p scenes; whole-video concat works (silent-music).
**Exit test:** `assemble-longform.mjs --project 29 --scenes 1-13 --no-audio-mix` produces a watchable Cold Open + Act 1 at 1920×1080; ffprobe duration within ±0.2s/scene of plan; S7 shows a smash cut; S3 title card is serif with 4s hold.

| #    | Task                                                                                                                                                                                                                                                                                                  | Files                   | Acceptance                                                                                                                                      |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| P6-1 | Motion engine `apps/video/src/longform/motion.js`: build the zoompan/crop filter string per `motion` type with **quadratic ease-in-out** (`push` →1.12, `micro_push` →1.06, `pull` 1.15→1.00, `smash` →1.30/1.5s+hold, `pan_lr`/`pan_rl` at 1.10, `parallax`→push, `hold`) at given fps/duration/size | new module              | unit script renders 6 tiny test clips from one PNG; eyeball: motion matches labels; first/last frame scales correct via `ffprobe`+frame extract |
| P6-2 | Scene builder: fetch `content_stills` per scene, render each cut with P6-1, concat cuts at `start_sec` boundaries, VO across the scene; **fallback**: no stills rows → legacy single-image/clip path (plan §3 back-compat)                                                                            | `assemble-longform.mjs` | 2-cut scene (S02) = one file, hard cut at 8s                                                                                                    |
| P6-3 | Reuse resolver: `image_source='reuse'` → resolve `reuse_of` R2 file; `regrade` warm_amber/cold_blue via `colorbalance`/`curves`                                                                                                                                                                       | same file               | S43 output visibly warmer than S04-B source                                                                                                     |
| P6-4 | Timed overlays from `content_clips.overlays`: drawtext `enable='between(t,…)'`, three styles (small_cream/lower_third/stamp), font from P0-4                                                                                                                                                          | same file               | S12: "16 years" appears at 6s±0.1 (frame-extract check)                                                                                         |
| P6-5 | Text cards + editor builds: serif title cards (S03 hold-cut, S50 hold-fade 1s); S14 navy plate + drawbox flags + ranking text; S51 end plate                                                                                                                                                          | same file               | still-frame extracts match spec; S50 last frame ≈ black                                                                                         |
| P6-6 | F8: dissolve support — per-still optional `transition:'dissolve'` (S44 B→A) via `xfade`                                                                                                                                                                                                               | same file               | S44 shows a visible 0.5s dissolve                                                                                                               |
| P6-7 | Unify pass: film grain (`noise=alls=6:allf=t`) + subtle vignette on every scene; 1920×1080 constants; encode params identical across builders so concat `-c copy` holds                                                                                                                               | same file               | concat of mixed scene types plays without glitch; `ffprobe` shows one consistent codec/profile                                                  |
| P6-8 | F4: VO-length reconciliation — scene duration = max(planned, VO+0.4s); scale cut boundaries proportionally; clamp overlay/sfx times; log every stretched scene                                                                                                                                        | same file               | inject an artificially long VO → scene stretches, narration not truncated, log line present                                                     |

---

### P7 — Assembly v2: audio layer

**Goal:** the full 4-layer mix + broadcast loudness.
**Exit test:** full `--project 29` render (with whatever stills exist; placeholder PNGs acceptable) measures **−14 ±0.5 LUFS integrated, ≤ −1.0 dBTP** via `ffmpeg loudnorm print_format=json`; S38 has a genuine 2s music/ambience gap; music audibly ducks under VO.

| #    | Task                                                                                                                              | Files                                                    | Acceptance                                             |
| ---- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------ |
| P7-1 | Audio-plan reader: load `audio_plan` + kit manifest; download beds/SFX to workdir with cache                                      | `assemble-longform.mjs` (or `src/longform/audio-mix.js`) | missing manifest → clear error naming P5               |
| P7-2 | Music track: per-segment trim/loop to segment length, 2s `acrossfade` joins, −23 dB base gain, hard gaps for `silence` directives | same                                                     | rendered music-only stem matches plan boundaries ±0.5s |
| P7-3 | Ambience: `stadium_hum` loop at −30 dB scoped to match scenes (audio_plan `ambience` ranges)                                      | same                                                     | stem present only inside ranges                        |
| P7-4 | SFX: `adelay` one-shots from per-scene `sfx` at absolute offsets                                                                  | same                                                     | S30 whistle lands at 5:13±0.2                          |
| P7-5 | Ducking: `sidechaincompress` music vs VO (threshold/ratio tuned so music drops ≈6 dB under speech)                                | same                                                     | loudness plot (or ear check) shows dip during VO       |
| P7-6 | Master: two-pass `loudnorm` I=-14 TP=-1.0 on the final mix; write measured values into the completion log + DB `status_note`      | same                                                     | Exit-test numbers                                      |

---

### P8 — 🏁 MILESTONE: #29 rebuilt end-to-end (CLI)

**Goal:** the actual deliverable — the new Silenced video.
**Exit test:** new `final.mp4` on R2; user review confirms: kit consistency across acts, no scene reads as static-slideshow (interrupt ≤8s everywhere), audio arc matches the shotlist.

| #    | Task                                                                                                                                  | Files                               | Acceptance                                   |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | -------------------------------------------- |
| P8-1 | `[user]` Generate 5 kit sheets in Flow from the P4-1 sheet → `import-stills.mjs --refs` → approve                                     | —                                   | 5 refs `passed`                              |
| P8-2 | `[user]`+CLI loop per act: generate → import → review (reject = reset to pending → reappears in sheet) — Cold Open, Acts 1–5 in order | —                                   | all 62 stills `generated`; rejects logged    |
| P8-3 | KEEP-VIDEO check on scenes 1/2/4/25/26/40 against the kit bible; keepers stay `kind='clip'`                                           | DB flips via small script or Studio | decision recorded per scene in `status_note` |
| P8-4 | Full assemble + review; if S33/S38/S39 feel dead → flag for the surgical motion-clip exception (separate decision, not this phase)    | —                                   | Exit test                                    |

---

### P9 — Orchestration (GitHub Actions + trigger)

**Goal:** every stage P2–P7 runs headless in the cloud, dispatched by an API call.
**Exit test:** `curl` to `trigger-longform` with `{project_id, stage:'assemble'}` → Actions run goes green → `rendered_video_url` updated → status `awaiting_final_approval`.

| #    | Task                                                                                                                                                                                                      | Files                               | Acceptance                                                           |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------- |
| P9-1 | `longform.yml` in reel-pipeline: dispatch inputs `project_id`,`stage`; deploy-key checkout of signal-studio; setup node+pnpm, apt ffmpeg, pip kokoro with `actions/cache` on the model dir (F11)          | reel-pipeline repo                  | manual dispatch of `stage=seed` green in <10 min warm                |
| P9-2 | Secrets/env: add `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `R2_*` (verify existing), `ANTHROPIC_*`; set dummy `FAL_KEY` etc. to satisfy config schema (F5) — documented in the workflow header comment | reel-pipeline secrets + yml         | `node -e "require config"`-equivalent step passes on runner          |
| P9-3 | Stage runner map in yml: `script`→(P11) `seed`→seed-stills-v2+generate-tts `assemble`→assemble-longform `publish`→(P12); each sets status to its running value first, `failed`+`status_note` on error     | yml + tiny `scripts/set-status.mjs` | forced failure lands `failed` with note                              |
| P9-4 | Edge fn `supabase/functions/trigger-longform` (clone trigger-generation): validates stage against current status (no skipping gates), flips status, dispatches                                            | new edge fn                         | dispatching `assemble` while `awaiting_refs` → 409; happy path fires |

---

### P10 — UI: shell + generation workbench (Gates 2/3)

**Goal:** the manual image loop moves from CLI to the dashboard.
**Exit test:** in the deployed dashboard: open project 29 → workbench shows cards with thumbnails; upload a replacement PNG → row updates; "Approve act" disabled until all its stills approved; approving the last act flips project status.

| #     | Task                                                                                                                                                                              | Files                                                         | Acceptance                                           |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------- |
| P10-1 | Route + list: `longform/` section, project list (long_form items, status chips incl. new statuses — F10), detail shell with stage tracker component (§5.1 pipeline as steps)      | `apps/dashboard/src/app/longform/…`                           | list renders; tracker highlights current gate for 29 |
| P10-2 | Status chip/filter mapping for all new statuses across existing shared components (F10)                                                                                           | dashboard shared                                              | no blank/unknown chips anywhere                      |
| P10-3 | Edge fn `upload-still`: issue presigned R2 PUT for `{project, scene, cut                                                                                                          | ref key}`; confirm endpoint records `clip_url`/`url` + status | new edge fn                                          | curl: presign → PUT a PNG → row `generated` |
| P10-4 | Workbench component: cards grouped refs→acts; copy-prompt button, filename, ref-attachment note, drag-drop upload (P10-3), thumbnail, approve/reject per still (reject→`pending`) | dashboard                                                     | Exit test interactions                               |
| P10-5 | Act gating: "Approve act" (all stills approved → sets those stills `passed`); after final act → call `trigger-longform stage=assemble`                                            | dashboard                                                     | button disabled-state logic + dispatch observed      |

---

### P11 — From-scratch script stage + Gate 1 (video #2 unlock)

**Goal:** brief → script/shotlist/prompts written by Claude in the exact #29 formats.
**Exit test:** on a test brief, `write-script.mjs` emits the 3 files; `parse-prompts-v2`/`parse-shotlist-v2` (P2 parsers) consume them with **zero code changes**; Gate 1 screen shows script + WPM + fact-check list; approve dispatches `seed`.

| #     | Task                                                                                                                                                                                                                                                                                   | Files       | Acceptance                                  |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------- |
| P11-1 | `write-script.mjs`: brief row → Claude (playbook rules embedded as the system contract: ABT, cold-open, 1100–1400 words, TTS normalization, kit-bible section, 🔊/📝/🎞️ line formats, self-contained prompts) → writes `script.md`, `shotlist-v2.md`, `prompts-v2.md` + `factcheck.md` | new script  | Exit test parse check; word count in budget |
| P11-2 | Format validator: run P2 parsers + rule lints (every scene ≥10s has ≥2 stills or an overlay/SFX interrupt; banned-cliché grep; numerals-in-VO detector) — fail the stage with a report Claude can retry on (max 2 retries)                                                             | same script | seeded lint violations get caught           |
| P11-3 | Gate 1 UI: rendered script/shotlist, WPM + duration estimate, fact-check checklist, approve / request-rewrite (feedback → re-dispatch `script`)                                                                                                                                        | dashboard   | approve flips status + dispatches seed      |

---

### P12 — Audio panel, final gate, publish

**Goal:** close the loop to a published YouTube video.
**Exit test:** an **unlisted** upload of #29 lands on the channel via the pipeline with SEO title/description/tags from the `seo` jsonb; Gate 4 player + approve→publish works.

| #     | Task                                                                                                                                                                                                           | Files         | Acceptance                                      |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ----------------------------------------------- |
| P12-1 | Audio panel (U4): audio_plan segment editor (track dropdown from manifest, from/to, gain), per-scene sfx table, unmatched-cue warnings                                                                         | dashboard     | edit persists; assemble uses edited plan        |
| P12-2 | Gate 4 (U5): preview player on `rendered_video_url`, per-scene timeline (VO/still links), approve→publish, flag-scenes→back to Gate 3 with those stills reset                                                  | dashboard     | flagging S20 resets exactly S20's stills        |
| P12-3 | `[user]` YouTube OAuth one-time: Google Cloud project, YouTube Data API v3 enabled, OAuth client, consent → refresh token; store as `YT_CLIENT_ID/SECRET/REFRESH_TOKEN_FOOTBALL` (envKey pattern)              | GCP + secrets | `scripts/yt-auth-check.mjs` prints channel name |
| P12-4 | Implement `packages/publishers/youtube.js` (F2): resumable upload, snippet from `seo` jsonb (fallback `ai_caption` — same seo-awareness rule as the known FB bug), `privacyStatus` param defaulting `unlisted` | publisher     | Exit test upload                                |
| P12-5 | `publish` stage in `longform.yml` + status → `posted`, store video id                                                                                                                                          | yml + script  | end-to-end from Gate 4 button                   |

---

## Dependency graph (what can run in parallel)

```
P0 → P1 → P2 → P3 ─┐
              P4 ──┼→ P8 (milestone: #29 done, CLI)
      P5 ──────────┤
      P6 → P7 ─────┘
P8 → P9 → P10 → P11 → P12
         (P5 anytime after P0 · P6-1 motion engine can start right after P0, it only needs a PNG)
```

Suggested junior-dev parallel tracks after P1: **Track A** P2→P3→P4 (data), **Track B** P6-1→P6-x (motion/assembly), **Track C** P5 (audio kit import script) — they only meet at P7/P8.
