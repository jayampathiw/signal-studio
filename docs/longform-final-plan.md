# Long-Form Pipeline — FINAL Merged Plan (stills-only, cloud-first, fully automated)

> **This document supersedes** `docs/long-form-pipeline-plan.md` (the automation plan) and
> merges it with `docs/longform-v2-task-breakdown.md` (the image-first quality plan) into
> one executable tracker. Both source docs stay as reference; **execute from this file only.**
>
> **Created:** 2026-07-05 · **Owner:** jayampathiw · **Branch:** `feat/longform-v2`
> **Pilot:** project `content_items.id=29` — "Silenced: The Night a Goalkeeper Sent Germany Home"

---

## 0. Locked decisions (2026-07-05)

| # | Decision | Choice | Consequence |
|---|---|---|---|
| D1 | Image generation | **100% manual via Google Flow** — user generates every still + kit ref by hand from the prompt sheet and imports them. No Higgsfield, no fal, no Cloudflare in this pipeline. | Zero credit risk; zero API-generation code; the *only* human-in-the-loop stages are image creation + the approval gates |
| D2 | Video clips | **None.** Every scene is stills + Ken Burns motion. The Seedance/KEEP-VIDEO exceptions are dropped. | `content_stills` is the single visual source; no video validation pool needed; Jul 19 unlimited-window deadline is now **irrelevant** |
| D3 | Priority | **Full automation first**, then #29 through it as the pilot | Cloud phases come *before* the #29 milestone, not after |
| D4 | Runtime | **Cloud from the start** — every automated stage is a dispatchable GitHub Actions job in `reel-pipeline` from day one | Local runs are for development only; a stage isn't "done" until it's green in Actions |
| D5 | Higgsfield future | User will make a **separate plan** for Higgsfield use later | Keep `pool.js` / `higgsfield.js` in the tree (generic, reusable) but no longform script may call Higgsfield |

### What each source plan contributes

| From `long-form-pipeline-plan.md` (automation) | From `longform-v2-task-breakdown.md` (quality) |
|---|---|
| Supabase status state-machine + resumability (re-run = converge, never duplicate) | `content_stills` schema, acts, cuts, overlays, SFX, audio_plan |
| Cloud orchestration: `longform.yml`, stage dispatch, edge-fn trigger, publish guard | Motion engine (Ken Burns + regrade + grain), v2 assembler, 4-layer audio mix |
| Per-item failure handling: `failed→pending` retries, cap → `blocked` | Manual generation loop (prompt-sheet → Google Flow → import), per-act gates |
| `runPool` rolling-concurrency primitive (now repurposed for **local parallel scene renders / R2 uploads**, not Higgsfield) | Kokoro per-scene TTS + WPM audit, playbook skill, script-writing stage |
| **Dropped:** Higgsfield generation pool, video frame-split semantic validation, reference-image generation via API | **Dropped:** seedream/Seedance hybrid routes, KEEP-VIDEO scenes |

### The automated lifecycle (target end-state)

```
brief ──[stage:script]──► scripting ──► awaiting_script_approval        GATE 1 (human)
      ──[stage:seed]────► seeding (parse + seed + TTS) ──► awaiting_refs
      ── user: Google Flow refs → import --refs ─────────► awaiting_stills   GATE 2 (human)
      ── user: Google Flow stills per act → import → approve acts ──►        GATE 3 (human)
      ──[stage:assemble]► rendering (motion + audio mix) ──► rendered ──► awaiting_final_approval  GATE 4 (human)
      ──[stage:publish]─► publishing ──► posted
```
Every `[stage:x]` arrow is a `workflow_dispatch` on `reel-pipeline/longform.yml`, fired by the
`trigger-longform` edge function. Gates are human approvals (CLI now, dashboard in F7).
Any stage crash → `failed` + `status_note`; re-dispatch resumes from DB state.

---

## Status legend
✅ done · 🔄 in progress · ⬜ not started · `[user]` only the user can do it

---

## F0 — Consolidation & de-scope *(make the repo match the decisions)*

**Goal:** the codebase and docs reflect stills-only/no-Higgsfield; all prior work is verified in place.
**Exit test:** `grep -r "higgsfield" apps/video/scripts/longform/` shows no *runnable* generation path for the v2 pipeline; both old plan docs carry a superseded banner; `git log` shows P0–P6 commits present on `feat/longform-v2`.

| # | Task | Files | Acceptance | Status |
|---|---|---|---|---|
| F0-1 | Branch `feat/longform-v2` with prior work (bug fixes F1/F6/F7/F9, snapshot script, schema migration applied to prod, parsers, seeder, TTS report, prompt-sheet v2, import v2, audio-kit script, motion engine, v2 assembler) | commits `2e04405`, `9da5c74`, `ac5c565` | branch checked out, 3 commits present | ✅ |
| F0-2 | Add a superseded banner to the top of `docs/long-form-pipeline-plan.md` and `docs/longform-v2-task-breakdown.md` pointing here | both docs | banner visible in first 5 lines | ✅ |
| F0-3 | Neutralize Higgsfield in longform: `generate-stills.mjs` — either delete or add a top-of-file hard exit `console.error('deprecated: stills are generated manually via Google Flow — see docs/longform-final-plan.md'); process.exit(1)`. Same for `generate-clips.mjs`, `generate-references.mjs`, `look-gate-clips.mjs`, `validate-clips.mjs` if they submit jobs | `apps/video/scripts/longform/*.mjs` | running any of them prints the deprecation and exits 1; no Higgsfield submit reachable from longform scripts | ✅ |
| F0-4 | Update `docs/PROJECT-STATUS.md` roadmap line for long-form to point at this plan | doc | line updated | ✅ |
| F0-5 | Commit F0 as `chore(longform): de-scope Higgsfield — stills-only final plan` | git | commit exists | ✅ |

---

## F1 — Data & audio ground truth *(#29 seeded, VO generated, audio kit on R2)*

**Goal:** the database is the complete, correct source of truth for #29 and the channel audio library exists.
**Exit test:** `seed-stills-v2.mjs --project 29` twice → second run reports 0 changes; `generate-tts.mjs --project 29 --report` shows every scene with VO, no `fail_reason`, WPM flags reviewed; `import-audio-kit.mjs --check` prints 15/15 OK.

| # | Task | Files | Acceptance | Status |
|---|---|---|---|---|
| F1-1 | Parsers (`parse-prompts-v2.js` 64 stills + reuse/editor rows; `parse-shotlist-v2.js` 51 scenes, motions, overlays, cues; `map-audio-cues.js`) | `apps/video/src/longform/` | already validated: S34-C timecode, S12 overlay, S37 heartbeat | ✅ |
| F1-2 | Seeder `seed-stills-v2.mjs` (stills upsert, VO-diff reset, 5 kit refs, audio_plan, `--dry`) | `apps/video/scripts/longform/` | built + spot-checked | ✅ |
| F1-3 | Snapshot #29 pre-seed: `node scripts/snapshot-project.mjs --project 29` | `temp/longform/29-pre-v2-snapshot.json` | file exists; row counts match Supabase Studio | ⬜ |
| F1-4 | Seed #29: `--dry` first, review the per-act counts table (expect 64 generated / 3 reuse / 2 editor / 5 refs / 51 scenes), then real run, then re-run to prove idempotency | CLI | dry counts match; run 2 = 0 inserts; VO resets listed match actual narration edits | ⬜ |
| F1-5 | TTS for #29: `node apps/video/scripts/longform/generate-tts.mjs --project 29 --report` | CLI | all scenes have `vo_url`; report written; zero `fail_reason` | ⬜ |
| F1-6 | `[user]` Review the WPM report — scenes outside 120–160 WPM or VO > window+1.5s get a narration trim (edit `shotlist-v2.md`, re-seed, re-TTS only those) | `content/longform/29/shotlist-v2.md` | flagged list empty or explicitly accepted | ⬜ |
| F1-7 | `[user]` Download the 15 audio-kit files per `content/audio-kit/SOURCES.md`, exact filenames | `content/audio-kit/` | 15 files present locally | ⬜ |
| F1-8 | Import kit: `node apps/video/scripts/longform/import-audio-kit.mjs` then `--check` | CLI | manifest.json written+committed; 15/15 URLs return 200 | ⬜ |

---

## F2 — Cloud foundation *(the dispatch skeleton — before any real stage)*

**Goal:** an empty-but-real Actions pipeline: edge-fn trigger → `longform.yml` → status flip → success/failure recorded. Everything later plugs into this.
**Exit test:** `curl` the `trigger-longform` edge fn with `{project_id:29, stage:'noop'}` → Actions run goes green → `status_note` shows the run URL; a forced-failure stage lands `status='failed'` with the error in `status_note`; dispatching a stage that's invalid for the current status returns 409.

| # | Task | Files | Acceptance | Status |
|---|---|---|---|---|
| F2-1 | `scripts/set-status.mjs --project N --status S [--note "..."]` — atomic status update with validation against the allowed status list | new script (signal-studio) | invalid status exits 1; valid one updates row | ⬜ |
| F2-2 | `longform.yml` in **reel-pipeline**: `workflow_dispatch` inputs `project_id`, `stage`; deploy-key checkout of signal-studio; setup node 20 + pnpm install; apt ffmpeg; `stage=noop` runs `set-status` + echo | reel-pipeline repo | manual dispatch of `noop` green in < 5 min | ⬜ |
| F2-3 | Secrets/env on reel-pipeline: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `R2_ACCOUNT_ID/ACCESS_KEY_ID/SECRET_ACCESS_KEY/BUCKET_RENDERED/PUBLIC_BASE_URL`, `ANTHROPIC_*`; **dummy values** for `FAL_KEY` + any other var `packages/config/schema.js` requires (env.js throws at import — known gotcha). Document the full list in the yml header comment | reel-pipeline secrets + yml | a workflow step that imports `@signal-studio/config` passes | ⬜ |
| F2-4 | Failure contract: every stage wrapped so a non-zero exit runs `set-status --status failed --note "<stage>: <error tail>"` (use `if: failure()` step) | yml | forced `exit 1` stage → row shows `failed` + note | ⬜ |
| F2-5 | Edge fn `supabase/functions/trigger-longform` (clone of `trigger-generation`): validates requested stage against current status (no gate-skipping — table of legal `status → stage` transitions), flips status to the stage's running value, dispatches via `GITHUB_PAT` | new edge fn | 409 on illegal transition; happy path fires and Actions run appears | ⬜ |
| F2-6 | Kokoro cache: `actions/cache` on the Kokoro model dir (~300 MB) + pip install step (needed by F3, cheap to add now) | yml | second run restores cache, TTS-capable step < 2 min setup | ⬜ |

---

## F3 — Cloud stages: `seed` + `tts`

**Goal:** the data phases run headless.
**Exit test:** `trigger-longform {project_id:29, stage:'seed'}` → green → DB rows updated exactly as the local F1-4 run (idempotent — safe because F1 already seeded); `stage=tts` on a project with one reset scene regenerates only that scene's VO.

| # | Task | Files | Acceptance | Status |
|---|---|---|---|---|
| F3-1 | Wire `stage=seed` → `seed-stills-v2.mjs --project $ID` + `generate-tts.mjs --project $ID --report`; upload the WPM report as an Actions artifact; end status `awaiting_refs` | longform.yml | Exit-test run green; artifact downloadable | ⬜ |
| F3-2 | Wire `stage=tts` → TTS only (for narration-edit loops after Gate 1 feedback) | longform.yml | only reset scenes regenerate | ⬜ |
| F3-3 | Resumability check: cancel a `seed` run mid-way, re-dispatch → converges with no duplicate rows and no double-TTS | — | verified once, noted in this doc's log | ⬜ |

---

## F4 — Manual image loop, hardened *(the ONLY human production stage)*

**Goal:** the Google-Flow loop is friction-free and gate-aware: sheet → generate → import → approve per act → status advances automatically.
**Exit test:** with 2 fake PNGs (`GK-GILL.png`, `S01-A.png`): `--refs` import passes the ref; still import marks S01-A `generated`; `approve-act.mjs --project 29 --act 0` refuses while a still is pending, succeeds when all are approved, and approving the final act flips project status to `awaiting_final_stills_done`→ dispatches nothing yet but prints the assemble command.

| # | Task | Files | Acceptance | Status |
|---|---|---|---|---|
| F4-1 | `prompt-sheet.mjs` v2 (refs-first, act sections, drift checklists, copy-blocks, filenames, no ART_DIRECTION) | done in P4 | sheet regenerates for 29 with 5 ref + 64 still blocks | ✅ |
| F4-2 | `import-stills.mjs` v2 (S01-A regex → `content_stills`, legacy fallback, `--refs` mode) | done in P4 | mixed-folder routing verified in `--dry` | ✅ |
| F4-3 | Review flow: `review-stills.mjs --project N --act A` — lists imported stills of an act with URLs; `--reject S07-B "reason"` resets that still to `pending` (+`fail_reason`), `--approve-all` sets act's `generated`→`passed` | new script | reject → reappears in the next prompt-sheet run; approve-all flips rows | ✅ |
| F4-4 | `approve-act.mjs` (or fold into F4-3): act complete = all its stills `passed`; when **all acts** passed AND 5 refs passed → project status `awaiting_stills`→ ready-for-assemble marker; prints the trigger-longform curl for `stage=assemble` | new script | Exit-test gating behaviour | ✅ |
| F4-5 | Sheet regeneration is incremental: `prompt-sheet.mjs` only lists `pending` rows — so after rejections the sheet contains exactly the redo work | existing behaviour — verify | rejected-only sheet confirmed | ⬜ |

---

## F5 — Assembly: audio layer *(the last unbuilt render code)*

**Goal:** full 4-layer mix (VO + stadium ambience + music beds + SFX) with broadcast loudness, on top of the P6 video layer.
**Exit test:** full render of #29 (placeholder PNGs fine for missing stills) measures **−14 ±0.5 LUFS integrated, ≤ −1.0 dBTP** (`loudnorm print_format=json`); S38 has a genuine 2s music+ambience gap; music audibly ducks ≈6 dB under VO; S30 whistle lands at its scripted offset ±0.2s.

| # | Task | Files | Acceptance | Status |
|---|---|---|---|---|
| F5-1 | Video layer: motion engine + v2 assembler (cuts, xfade dissolve, overlays, text cards, reuse/regrade, VO-length reconciliation, 1080p, legacy fallback) | done in P6 | `--scenes 1-13 --no-audio-mix` produces a watchable 1080p cut | ✅ |
| F5-2 | `src/longform/audio-mix.js` — audio-plan reader: load `content_items.audio_plan` + `content/audio-kit/manifest.json`, download beds/SFX to workdir with cache; missing manifest → clear error naming F1-8 | new module | unit run prints resolved segment list for 29 | ✅ |
| F5-3 | Music stem: per-segment trim/loop to length, 2s `acrossfade` joins, −23 dB base gain, hard gaps for `silence` directives (S38) | same | music-only stem boundaries match plan ±0.5s | ✅ |
| F5-4 | Ambience stem: `stadium_hum` loop at −36 dB always-on throughout video (persistent texture layer) | same | stem present at low level throughout | ✅ |
| F5-5 | SFX stem: `adelay` one-shots from per-scene `content_clips.sfx` at absolute offsets (scene start + at_sec) | same | S30 whistle timing check | ✅ |
| F5-6 | Ducking: `sidechaincompress` music vs VO (threshold=0.013, ratio=4 → ≈6 dB dip) | same | audible/plotted dip during speech | ✅ |
| F5-7 | Master: two-pass `loudnorm` I=-14 TP=-1.0; write measured values to the completion log + `status_note`; wire into `assemble-longform.mjs` (remove/flip `--no-audio-mix` default) | `assemble-longform.mjs` | Exit-test numbers | ✅ |

---

## F6 — Cloud stage: `assemble` *(automation core complete)*

**Goal:** one dispatch renders the whole video headless.
**Exit test:** `trigger-longform {project_id:29, stage:'assemble'}` → Actions green (≤ ~60 min) → `rendered_video_url` set, `status='awaiting_final_approval'`; cancel + re-dispatch mid-render converges without corrupt output.

| # | Task | Files | Acceptance | Status |
|---|---|---|---|---|
| F6-1 | Wire `stage=assemble` → `assemble-longform.mjs --project $ID`; `timeout-minutes: 180`; artifact-upload the run log + loudnorm JSON | longform.yml | Exit test | ✅ |
| F6-2 | Guard: `preflight-assemble.mjs` checks all stills + refs passed + audio_plan present before render; on failure reverts status to `awaiting_stills` | `apps/video/scripts/longform/preflight-assemble.mjs` | dispatch with pending still → clean error, status back to `awaiting_stills` | ✅ |
| F6-3 | Publish guard carried over: `rendered → publishing` transition (F8) blocked while any still/ref is not `passed` — enforced in `trigger-longform` transition table | edge fn | 409 verified | ✅ |

---

## F7 — 🏁 MILESTONE: #29 through the full pipeline

**Goal:** the actual Silenced video, produced by the automated pipeline with you only generating images and approving gates.
**Exit test:** `final.mp4` on R2, rendered by an Actions run; your review confirms kit consistency across acts, no scene reads static (interrupt ≤ 8s everywhere), audio arc matches the shotlist, VO in sync end-to-end.

| # | Task | Files | Acceptance | Status |
|---|---|---|---|---|
| F7-1 | `[user]` Generate the 5 kit reference sheets in Google Flow from the sheet → `import-stills.mjs --refs` → visually approve | — | 5 refs `passed` | ⬜ |
| F7-2 | `[user]` Per act (Cold Open, Acts 1–5, Outro): generate stills in Flow with refs attached → import → `review-stills` → reject/redo → approve act | — | all 64 stills `passed`; rejects logged with reasons | ⬜ |
| F7-3 | Dispatch `stage=assemble`; download + watch the full cut | — | Exit test review checklist | ⬜ |
| F7-4 | Fix-loop: any flagged scene → reset its stills → regenerate → re-assemble (partial `--scenes` render locally for quick iteration, full cloud render for the final) | — | final accepted by user | ⬜ |
| F7-5 | Write `docs/longform-29-postmortem.md`: per-act reject rate, wall-clock per stage, WPM accuracy, what to feed back into the playbook skill | new doc | doc committed | ⬜ |

---

## F8 — Publish: YouTube *(closes the loop)*

**Goal:** approved video → the channel, via the pipeline.
**Exit test:** an **unlisted** upload of #29 lands on YouTube via `stage=publish` with SEO title/description/tags from the `seo` jsonb; `status='posted'`, video id stored.

| # | Task | Files | Acceptance | Status |
|---|---|---|---|---|
| F8-1 | `[user]` YouTube OAuth one-time: GCP project, YouTube Data API v3 enabled, OAuth client, consent flow → refresh token; store `YT_CLIENT_ID/SECRET/REFRESH_TOKEN_FOOTBALL` in reel-pipeline secrets | GCP + secrets | `scripts/yt-auth-check.mjs` prints channel name | ⬜ |
| F8-2 | Implement `packages/publishers/youtube.js`: resumable upload, snippet from `seo` jsonb (fallback `ai_caption` — same seo-awareness rule as the FB bug), `privacyStatus` param default `unlisted` | publisher | unlisted test upload of a tiny mp4 | ⬜ |
| F8-3 | SEO generation for long-form: run `seo-writer` agent (or a small script with the playbook rules) → write `seo` jsonb on #29 | agent/script | `seo` jsonb populated, human-reviewed | ⬜ |
| F8-4 | Wire `stage=publish` in longform.yml + transition guard in trigger-longform (`awaiting_final_approval → publishing` only) | yml + edge fn | Exit test | ⬜ |

---

## F9 — Script stage + Gate 1 *(video #2 unlock — the last automation piece)*

**Goal:** a brief becomes script + shotlist + prompts in the exact #29 formats, written by Claude under the playbook skill, validated automatically.
**Exit test:** on a test brief, `stage=script` emits the 3 files; the F1 parsers consume them with **zero code changes**; the lint validator catches seeded violations; approving Gate 1 dispatches `seed`.

| # | Task | Files | Acceptance | Status |
|---|---|---|---|---|
| F9-1 | `write-script.mjs`: brief row → Claude (playbook rules as the system contract: ABT, cold open, 1100–1400 words, TTS normalization, kit-bible section, 🎙️/🔊/📝/🎞️ line formats, self-contained prompts) → writes `script.md`, `shotlist-v2.md`, `prompts-v2.md`, `factcheck.md` under `content/longform/<id>/` | new script | files parse via F1 parsers untouched; word count in budget | ⬜ |
| F9-2 | Format validator: run both parsers + rule lints (scene ≥10s needs ≥2 stills or an interrupt; banned-cliché grep; numerals-in-VO detector; WPM estimate) — fail with a report Claude retries on (max 2) | same script | seeded lint violations caught; retry loop works | ⬜ |
| F9-3 | Wire `stage=script` in longform.yml (needs `ANTHROPIC_*` env — already set in F2-3); end status `awaiting_script_approval` | yml | green run on a scratch brief | ⬜ |
| F9-4 | Gate 1 approval path: `approve-script.mjs --project N [--feedback "..."]` — approve flips status + prints/fires the `seed` dispatch; feedback re-dispatches `script` with the feedback appended | new script | both paths verified | ⬜ |

---

## F10 — Dashboard UI *(replace the CLI gates — quality of life, last)*

**Goal:** all four gates usable from the deployed dashboard; no SSH/CLI needed to run a video end-to-end.
**Exit test:** in the deployed dashboard: open a long-form project → stage tracker shows the current gate → Gate 1 script review, Gate 2/3 workbench (thumbnails, copy-prompt, drag-drop upload, approve/reject, act gating), Gate 4 player + approve→publish — each fires the right edge-fn dispatch.

| # | Task | Files | Acceptance | Status |
|---|---|---|---|---|
| F10-1 | Route + list: `longform/` section, project list with status chips for **all** new statuses (no blank chips), detail shell with stage tracker | `apps/dashboard/src/app/longform/…` | list renders; tracker highlights current gate | ⬜ |
| F10-2 | Edge fn `upload-still`: presigned R2 PUT for `{project, scene, cut | ref key}` + confirm endpoint (row update + status) | new edge fn | curl presign → PUT PNG → row `generated` | ⬜ |
| F10-3 | Workbench (Gates 2/3): cards refs→acts, copy-prompt, filename, drag-drop upload, thumbnail, approve/reject per still, "Approve act" gating, final act → assemble dispatch | dashboard | Exit-test interactions | ⬜ |
| F10-4 | Gate 1 screen: rendered script/shotlist, WPM + duration estimate, fact-check list, approve / request-rewrite | dashboard | approve dispatches seed | ⬜ |
| F10-5 | Gate 4 screen: player on `rendered_video_url`, per-scene timeline, approve→publish, flag-scenes→reset those stills + back to Gate 3 | dashboard | flagging S20 resets exactly S20's stills | ⬜ |
| F10-6 | Audio panel: audio_plan segment editor (track dropdown from manifest, from/to, gain), per-scene sfx table, unmatched-cue warnings | dashboard | edit persists; assemble uses edited plan | ⬜ |

---

## Dependency graph & parallel tracks

```
F0 ──► F1 ─────────────┐
  └──► F2 ──► F3 ──────┤
              F4 ──────┼──► F7 (🏁 #29 milestone) ──► F8 (publish)
       F5 ──► F6 ──────┘                          └─► F9 (script stage) ──► F10 (UI)
```

- **Track A (data):** F0 → F1 (mostly user tasks: audio kit, WPM review) — start immediately
- **Track B (cloud):** F2 → F3 — pure code, parallel with Track A
- **Track C (render):** F5 (audio mix) — only needs F1-8's manifest; parallel with F3
- They converge at **F6** (cloud assemble), then **F7** is the milestone.
- **F8/F9/F10 order is swappable** — F8 first gets #29 published soonest; F9 first unlocks video #2 production; F10 is pure QoL and safely last.
- **User-blocking items to start today:** F1-7 (download 15 audio files) and F7-1/F7-2 image generation can begin any time after F1-4 seeds the prompts — image work overlaps all code phases.

## Timeline reality check

With D1/D2 there is **no external deadline** (nothing expires). Rough effort at junior-dev pace:
F0 ½d · F1 ½d code + user time · F2 1–1½d · F3 ½d · F4 ½d · F5 1½–2d · F6 ½d · F7 user-paced (image generation dominates) · F8 1d + OAuth · F9 1–1½d · F10 3–4d.
**Code total ≈ 10–12 dev-days; critical path to the #29 milestone ≈ 5–6 dev-days + your image-generation time.**

## Log

| Date | Note |
|---|---|
| 2026-07-05 | Plan created by merging the automation plan + v2 task breakdown under decisions D1–D5 (stills-only, no Higgsfield, full automation, cloud-first). Prior v2 phases P0–P6 mapped to ✅ items in F0/F1/F4/F5. Credit test result recorded: Seedance Mini video free via API, nano_banana_flash 14 credits/image — moot under D1/D2. |
| 2026-07-06 | F2 + F3 verified complete (longform.yml wired, trigger-longform deployed, cloud seed+tts ran green for project 29). F0-2/F0-3 verified complete (banners on old docs, Higgsfield hard-exits on all 5 scripts). F4-3 (`review-stills.mjs`) + F4-4 (`approve-act.mjs`) built. F5-2 through F5-7 complete: `src/longform/audio-mix.js` implements all 4 stems (VO extract, music beds w/ acrossfade + silence gating, ambience -36dB, SFX adelay), sidechaincompress ducking, two-pass loudnorm -14 LUFS/-1.0 TP; wired into `assemble-longform.mjs` replacing P7 stub. Note F5-4 implemented as always-on ambience at -36dB (not range-scoped) — `hum_only` acts use stadium_hum in the music layer additionally. Next: user runs F1-8 (import audio kit after downloads), then F6 (wire `stage=assemble` in longform.yml). |
