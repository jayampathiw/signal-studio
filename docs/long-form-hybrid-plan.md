# Long-Form Hybrid Pipeline — Plan & Progress Tracker (v2)

> **Purpose:** track the redesigned, cost-first long-form pipeline: **stills +
> Ken Burns for most scenes, AI video only for hero moments**. Supersedes the
> *execution economics* of `long-form-pipeline-plan.md` (v1) — v1 stays as the
> architectural record; its data model, pools, gates, and resumability carry
> over unchanged unless stated here.
>
> **Created:** 2026-07-02
> **Owner:** jayampathiw
> **Branch:** `feat/longform-hybrid` (v1 implementation committed there as
> `feat(longform): v1 pipeline — schema, planning, reference bible`; all v2
> work continues on this branch)
> **Status:** 🔄 Phases defined at junior-developer task level; build not started
> **Trigger:** Higgsfield unlimited Seedance Mini/Fast ended (account at 3.41
> credits, Max plan) → provider research → cost reframe: not all 48 scenes
> need AI video.
> **Related:** `docs/long-form-pipeline-plan.md` (v1 — Phases 0–3 ✅ complete
> and reused), `docs/video-generation-flow.md`

---

## Status legend

| Mark | Meaning |
|---|---|
| ✅ | Done |
| 🔄 | In progress |
| ⬜ | Not started |
| ❓ | Open question |

---

## 1. The reframe

A 10–15 min documentary does not need 48 generated video clips. Successful
faceless doc channels are mostly **stills with slow pan/zoom (Ken Burns),
maps, text cards, and strong VO**. Motion is reserved for the moments where
action carries emotion.

**Per-video cost target: < $10 all-in (vs $30–59 for full AI video).** Spend
scales with evidence: promote individual scenes `still` → `motion` in later
videos if the channel earns it.

| Scene kind | Count (pilot est.) | Produced by | Cost |
|---|---|---|---|
| `still` | ~38 | AI image + Ken Burns for the scene's VO duration | ~$0–3 |
| `motion` | ~10 (hero moments) | AI video (Seedance Mini class) | ~$0–6 |
| `text_card` | 3 (S3/S21/S50) | FFmpeg/Remotion — unchanged from v1 | $0 |

Everything else from v1 is kept: `content_clips`/`content_references` schema,
rolling pool, Supabase-resume, two validation gates, per-scene Kokoro TTS,
assemble-with-hold + publish guard, reference bible (12/12 ✅ passed).

---

## 2. Provider chains (verified 2026-07-02)

### 2a. Still images — routing policy

Spike result (0.24 cr, see §5): **Soul V2 passes on atmospheric scenes,
fails on precision scenes** (maps/geography/text — style follows, accuracy
drifts).

| Route (`image_source`) | Provider | Cost | Used for |
|---|---|---|---|
| `reference` | **Reuse a passed reference image directly** (no generation) | $0 | Motif scenes whose reference IS the shot: maps (S4/S5/S43), wall, stadium plates |
| `higgsfield` | **Soul V2** (`text2image_soul_v2`) — 0.12 cr/img, `image_references` ≤ 1, 16:9, 2k | ~26 imgs on current balance | Atmospheric/cinematic stills (the majority) |
| `higgsfield` (bridge) | **`nano_banana_2`** — 2 cr/img — **owner topping up a small credit pack** | ~2 cr/img | Precision stills until the Google workflow (H3) is live; also multi-ref scenes |
| `fal` | fal.ai image API (existing `FAL_KEY`, provider chain in `packages/ai`) | ~$0.03–0.05/img | Automated fallback / overflow |
| `google` | **Nano Banana via owner's Google Pro plan** (unlimited, no API) | $0 | Steady-state for precision + overflow from video #2 via H3 workflow |

**Top-up decision (owner, 2026-07-02):** small top-up approved as a bridge —
precision stills ≈ 6–10/video × 2 cr + retries ≈ 25–30 cr/video on
`nano_banana_2` until Phase H3 makes the Google route practical.

### 2b. Hero motion clips — chain, in order

1. **Free credits**: BytePlus trial, Cloudflare free allocation, Atlas dev
   credits (Atlas only if it passes the acceptance spike — see memory
   `project-longform-video-provider`).
2. **Cloudflare Workers AI `bytedance/seedance-2.0-mini`** — **confirmed**
   $0.090/s 720p, `reference_images[]` 1–4, **12s duration cap** (pad longer
   heroes in assembly). Account exists; needs a Workers AI API token.
3. **BytePlus ModelArk `dreamina-seedance-2-0-mini-260615`** (~$0.046/s est.)
   — cheaper at volume, pending $1 spike (token rate + ≥3 refs).

~10 clips × ~12s ≈ 120s → **$0–11/video** depending on route.

---

## 3. Deltas to the v1 plan

| v1 element | Change |
|---|---|
| Phases 0–3 (decisions, schema, planning, reference bible) | ✅ **Kept** — complete; bible reused |
| `content_clips.kind` | Add `still`; add `image_source` column (Phase H0) |
| Phase 4 generation pool | Splits by kind: `motion` → video pool (provider adapters); `still` → image pool / import |
| Phase 5 validation | Stills: `image-quality-gate` on the image directly. Semantic-action gate: motion clips only |
| Phase 6 assembly | `still` rows get Ken Burns (`packages/render/ffmpeg`) for the scene's VO duration |
| Reference images | Re-host the 12 passed refs to R2 (Phase H1) |
| Phase 7 cloud orchestration | Deferred — pilot runs locally/interactively (Google image step is manual) |

---

## 4. Phased task list — junior-developer level

> **Conventions for every phase:** work on branch `feat/longform-hybrid`.
> Run scripts from the repo root (`node apps/video/scripts/longform/<script>`).
> All scripts must be **resumable**: re-running skips rows already done
> (filter by `status` / existing values — copy the pattern from
> `generate-references.mjs`). Commit at the end of each phase with a
> `feat(longform): ...` message. Never hardcode secrets — read from `.env`
> via `@signal-studio/config` (add new vars to `packages/config/schema.js`
> as OPTIONAL, or import validation will throw for everyone).
> **Env vars used in this plan:** `CF_ACCOUNT_ID`, `CF_API_TOKEN` (new,
> Phase H4); `R2_*`, `FAL_KEY`, `SUPABASE_*` (existing).

### Phase H0 — Schema + scene classification ⬜
**Goal (achievable, verifiable):** the database knows which of the 48 pilot
scenes are stills vs motion, and which provider each still uses.

- [ ] ⬜ **H0.1 — Migration file.** Create
  `supabase/migrations/20260702_hybrid_stills.sql` with exactly:
  ```sql
  alter table content_clips drop constraint if exists content_clips_kind_check;
  alter table content_clips add constraint content_clips_kind_check
    check (kind in ('clip','still','text_card'));

  alter table content_clips add column if not exists image_source text
    check (image_source is null
           or image_source in ('reference','higgsfield','fal','cloudflare','google'));
  ```
  Apply with `supabase db push`. *(If push complains about migration history,
  see memory `project-migration-apply` — repair, don't force.)*
  **Done when:** `select kind, image_source from content_clips limit 1;`
  works in the Supabase SQL editor.

- [ ] ⬜ **H0.2 — Classification file.** Claude (in a Claude Code session)
  proposes the split and writes it to
  `temp/longform/silenced.classification.json`, shape:
  ```json
  [{ "scene_n": 1, "kind": "still", "image_source": "higgsfield" },
   { "scene_n": 33, "kind": "motion" }, ...]
  ```
  Rules: `motion` = action carries the emotion (the save, penalty run-up,
  crowd eruptions) — target 8–12 scenes; `reference` source for scenes whose
  reference image IS the shot (S4/S5/S43 map…); precision stills (maps not
  covered by a reference, text-bearing shots) → `higgsfield` with
  `nano_banana_2` (bridge) or `google`; all other stills → `higgsfield`
  (Soul V2). **Owner reviews and edits this file before H0.3.**

- [ ] ⬜ **H0.3 — Apply script.** New
  `apps/video/scripts/longform/classify-scenes.mjs`:
  reads the JSON, updates each row's `kind` + `image_source`
  (`db.from('content_clips').update(...).eq('project_id', P).eq('scene_n', n)`).
  Flags: `--project 29`, `--file <path>`, `--dry` (print changes, write
  nothing). Copy the arg-parsing style from `plan.mjs`. Note: `motion` rows
  keep `kind='clip'` — `motion` in the JSON is shorthand; only stills change
  kind. **Done when:** `--dry` prints 48 rows; real run then
  `select kind, count(*) from content_clips where project_id=29 group by 1;`
  shows ~still 36–40 / clip 8–12 / text_card 3.

- **Exit:** classification applied and committed; owner has signed off on the
  hero list.

### Phase H1 — Reference re-host to R2 ⬜
**Goal:** all 12 reference images live on R2 as stable public URLs usable by
any provider (Higgsfield CDN links are provider-scoped and may expire).

- [ ] ⬜ **H1.1 — Re-host script.** New
  `apps/video/scripts/longform/rehost-references.mjs`: for each
  `content_references` row of the project with a non-R2 `url`:
  download (plain `fetch` → `Buffer`), upload via the existing R2 helper in
  `@signal-studio/media` (same call `assemble-reel.mjs` uses — key like
  `longform/29/refs/<key>.png`), then update the row's `url`. Keep
  `higgsfield_media_id` untouched (still valid for Higgsfield jobs).
  Resumable: skip rows whose `url` already contains the R2 public host.
  **Done when:** re-running prints "12 skipped"; every `url` in
  `content_references` (project 29) opens in a browser.

- **Exit:** 12/12 refs on R2; script committed.

### Phase H2 — Still-image generation ⬜
**Goal:** every `still` row of the pilot has an R2-hosted image in
`clip_url` and `status='generated'` — total new spend ≤ ~30 credits.

- [ ] ⬜ **H2.1 — `reference` route (free, do first).** New
  `apps/video/scripts/longform/generate-stills.mjs` — start with only this
  route: for rows `kind='still' and image_source='reference' and
  status='pending'`, copy the URL of the row's first reference
  (`reference_keys[0]` → `content_references.url`, now on R2) into
  `clip_url`, set `status='generated'`. **Done when:** those rows (~3–5) are
  `generated` without any generation call.

- [ ] ⬜ **H2.2 — Soul V2 provider.** New
  `apps/video/src/longform/soul.js` exporting
  `generateStill({ prompt, referenceMediaId, aspectRatio = '16:9' })` →
  `{ jobId, url }`. Implement with the existing `submit`/`poll` from
  `higgsfield.js` (`jobType: 'text2image_soul_v2'`; params: `prompt`,
  `aspect_ratio`, `quality: '2k'`, and `image_references: <id>` only when a
  reference is given — max 1, enforced by the API). Bake the global art
  direction into the prompt: read it from
  `temp/longform/silenced-shotlist.md` the same way `plan.mjs` does — do NOT
  copy-paste the paragraph into code.

- [ ] ⬜ **H2.3 — Pool the Soul route.** Extend `generate-stills.mjs`: rows
  with `image_source='higgsfield'` and ≤1 reference run through the v1
  `pool.js` at concurrency 8 (images and videos have separate 8-limits —
  §2 of the v1 plan). After each success: upload the image to R2
  (`longform/29/stills/S<scene_n>.png` — reuse the H1 helper), store the R2
  URL in `clip_url`, set `generated`. Failures follow the v1 state machine
  (`failed`→`pending`, `retry_count++`, cap 3 → `blocked`).
  **Done when:** a 3-scene test run (`--limit 3`) produces 3 viewable R2
  URLs and re-running skips them.

- [ ] ⬜ **H2.4 — Precision route (bridge).** Same script, rows flagged for
  `nano_banana_2` (2 cr/img — requires the owner's top-up): identical flow,
  `jobType: 'nano_banana_2'`; this model accepts multiple
  `image_references`, so pass ALL the row's reference ids. Check the exact
  param shape first with `higgsfield model get nano_banana_2`.

- [ ] ⬜ **H2.5 — fal fallback.** Rows with `image_source='fal'` (or any row
  whose Higgsfield submit hits a credit error): generate via the existing
  fal image provider in `packages/ai`, same R2 upload + row update. Detect
  the credit-exhausted error string from a deliberate test once balance is
  low, and treat it like rate-limit back-off routing → fal instead of
  burning retries.

- [ ] ⬜ **H2.6 — Visual gate.** Run the existing still gate flow: in a
  Claude Code session, review each generated still against its prompt +
  reference (same procedure as v1 Phase 3 — proxy has no vision, so gating
  is done by the session; see v1 §6b). Refine prompts and regenerate fails
  (resumable — passed rows untouched); then set rows `passed`.

- **Exit:** all `still` rows `generated`→`passed` with R2 URLs; credits spent
  recorded in this doc's session log.

### Phase H3 — Google image workflow (kills the top-up dependency) ⬜
**Goal:** from video #2 onward, precision + overflow stills cost $0 via the
owner's Google Pro plan, with ≤45 min of manual work per video.

- [ ] ⬜ **H3.1 — Prompt sheet.** New
  `apps/video/scripts/longform/prompt-sheet.mjs`: emits
  `temp/longform/<project>-promptsheet.md` for rows
  `image_source='google' and status='pending'` — per scene: heading
  `## S<scene_n>`, the full prompt (art direction baked in), and the R2
  URL(s) of its reference image(s) with instruction "download and attach in
  the Gemini app". **Done when:** the sheet renders readable in a markdown
  preview.

- [ ] ⬜ **H3.2 — Import script.** New
  `apps/video/scripts/longform/import-stills.mjs --dir <folder> --project 29`:
  for each file matching `S<digits>.(png|jpg|jpeg|webp)` in the folder,
  upload to R2 (same key scheme as H2.3), set the matching row's `clip_url`
  + `status='generated'`. Warn (don't fail) on files with no matching
  pending row; print a summary (`imported 9, skipped 2, unmatched 1`).

- [ ] ⬜ **H3.3 — Dry run the loop.** Owner generates 2–3 images in the
  Gemini app from a real sheet; import; gate (H2.6 procedure). Fix naming /
  sheet ergonomics from what actually annoyed the owner.

- **Exit:** one full sheet→generate→import→gate cycle completed; from here
  new precision stills default to `image_source='google'` and **no further
  top-ups are needed for images**.

### Phase H4 — Hero motion clips ⬜
**Goal:** all ~8–12 `motion` rows have R2-hosted video clips, generated for
the lowest passing price.

- [ ] ⬜ **H4.1 — Owner (gates this phase):** create a Cloudflare API token
  with Workers AI permission (dash → My Profile → API Tokens; the R2 token
  does NOT work). Add `CF_ACCOUNT_ID` + `CF_API_TOKEN` to root `.env` AND to
  `packages/config/schema.js` as optional vars.

- [ ] ⬜ **H4.2 — Cloudflare adapter.** New
  `apps/video/src/longform/cloudflare.js` exporting the SAME interface as
  `higgsfield.js` (`submit`, `poll`, `generate`) so the pool can't tell them
  apart. Implementation:
  `POST https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/bytedance/seedance-2.0-mini`
  with `Authorization: Bearer ${CF_API_TOKEN}` and body
  `{ prompt, reference_images: [<R2 urls>], duration: Math.min(duration_sec, 12), resolution: '720p', aspect_ratio: '16:9', generate_audio: false }`.
  Check whether the response is synchronous (video URL in the response) or
  async (task id to poll) — handle whichever it is inside `poll` so the
  interface holds. Store the returned video in R2
  (`longform/29/clips/S<scene_n>.mp4`) — do not rely on Cloudflare's URL
  being permanent.

- [ ] ⬜ **H4.3 — One-clip spike (before the batch).** Script or manual run:
  generate ONE hero clip with 2 reference images. Verify: refs honored
  (character looks like the bible), 16:9 output with references, cost on the
  Cloudflare billing page ≈ 12s × $0.09. Record results in the session log.

- [ ] ⬜ **H4.4 — Batch.** Extend `generate-clips.mjs` (v1) to route by a
  `--provider cloudflare|higgsfield` flag (default cloudflare), claiming
  rows `kind='clip' and status='pending'`. Pool semantics unchanged from the
  v1 Phase 4 spec: resume-safe (poll in-flight job ids before submitting),
  per-job try/catch, retry cap → `blocked`.

- [ ] ⬜ **H4.5 — (Parallel, owner+Claude) ModelArk spike.** BytePlus account
  + one pay-as-you-go Mini clip: confirm ~$0.046/s and ≥3 reference images.
  If it passes, add `modelark.js` (same interface) and make it the default
  provider for video #2+. Not a blocker for the pilot.

- **Exit:** all motion rows `generated` with R2 URLs; actual spend recorded.

### Phase H5 — Validation ⬜ (v1 Phase 5, narrowed)
**Goal:** every still and clip verified; bad ones auto-recycled.

- [ ] ⬜ **H5.1 — Stills:** already gated in H2.6/H3.3 (session vision). Add
  the outcome to rows (`passed` / `pending` + `fail_reason`).
- [ ] ⬜ **H5.2 — Motion look-check:** extract 3 frames per clip with the v1
  `frame-extractor.js`; session-gate frames vs the clip's reference.
- [ ] ⬜ **H5.3 — Motion semantic-action check:** v1 design (per-scene
  expected action from VO/prompt + channel rule backstop via
  `semantic-gate.js`) — now only ~10 clips, run in the session.
- **Exit:** a deliberately-wrong clip is caught and requeued; all rows
  `passed` or `blocked`-with-reason.

### Phase H6 — Assembly ⬜ (v1 Phase 6 + Ken Burns)
**Goal:** one final MP4 in R2, VO in sync end-to-end.

- [ ] ⬜ **H6.1 — Per-scene TTS:** Kokoro via `@signal-studio/media`, one
  audio file per scene from `vo_text`, stored to R2, `vo_url` on the row.
  Clip/still target duration = VO length (+ scripted tail silence).
- [ ] ⬜ **H6.2 — Ken Burns stills:** for `still` rows, render a video
  segment from the image at the scene's VO duration using the Ken Burns
  support in `packages/render/ffmpeg` (see the reel path for the call
  shape). Alternate zoom-in / zoom-out / pan direction per consecutive
  scene so the motion doesn't feel repetitive (`scene_n % 3` is fine).
- [ ] ⬜ **H6.3 — Motion clip fit:** clip shorter than its VO (e.g. 12s cap
  vs 14s VO) → freeze the last frame for the remainder (ffmpeg `tpad`);
  longer → trim.
- [ ] ⬜ **H6.4 — Text cards** (S3/S21/S50): FFmpeg `drawtext` on a brand
  background, VO duration.
- [ ] ⬜ **H6.5 — Concat + mix:** generalize `assemble-reel.mjs` → new
  `assemble-longform.mjs`: order by `scene_n`, mux each segment with its VO,
  `concatClips`, music bed under everything (low volume), upload final to
  R2, write `rendered_video_url`, `status='rendered'`. Assemble-with-hold +
  publish guard per v1 decisions.
- **Exit:** the pilot MP4 plays start-to-finish with VO in sync; a run with
  one `blocked` row still assembles (slate inserted) but cannot advance to
  publishing.

### Phase H7 — Slice, pilot & measure ⬜
**Goal:** video #1 live for < $10 all-in, with real cost/retry data.

- [ ] ⬜ **H7.1 — 3-scene slice first:** 1 still (Soul V2) + 1 motion + 1
  text card end-to-end (generate → gate → TTS → assemble). Exercises every
  mechanism in ~15 min.
- [ ] ⬜ **H7.2 — Full pilot run**; record per-provider spend, retry rate,
  wall-clock in the session log.
- [ ] ⬜ **H7.3 — Owner:** review the cut, publish sign-off.
- [ ] ⬜ **H7.4 — Retro:** which stills felt static? Those scenes are the
  `motion`-upgrade candidates for video #2.
- **Exit:** pilot published; measured cost table in this doc.

**Critical path:** H0 → H1 → {H2, H4 in parallel} → H5 → H6 → H7. H3 is
independent (any time after H0) and removes the top-up dependency — do it
before video #2. H4.1 (Cloudflare token) and the top-up are the only two
owner actions blocking generation.

---

## 5. Open questions & resolved spikes

- ✅ **Soul V2 quality — RESOLVED (2026-07-02 spike, 0.24 cr).**
  Atmospheric scenes PASS (S1 floodlight — production quality, on-art-
  direction). Precision scenes FAIL (S4 map — style ok, geography wrong;
  single-reference conditioning is loose). Drove the §2a routing policy.
- ✅ **Credit top-up — DECIDED (owner):** small top-up as bridge for
  `nano_banana_2` precision stills until Phase H3 is live.
- ❓ Cloudflare free allocation: do the 10k free Neurons/day cover any
  Seedance Mini seconds? (Owner: check on the model's dashboard page.)
- ❓ Cloudflare API: sync or async response for video generation (H4.2
  resolves).
- ❓ Music bed + brand plate assets (v1 Phase 9 manual item — gates H6.5).

---

## 6. Session log

| Date | Note |
|---|---|
| 2026-07-02 | Provider research concluded (Seedance Mini via ModelArk/Cloudflare best full-video routes; Veo/Sora/wrappers rejected — memory `project-longform-video-provider`). Cost reframe → hybrid stills+motion design. This doc created; v1 kept as architectural record. Verified: Higgsfield 3.41 credits; Soul V2 = 0.12 cr/image (≈28 images), `image_references` ≤ 1; Nano Banana models 1–2 cr/image. |
| 2026-07-02 | **Soul V2 spike (0.24 cr): atmospheric PASS / precision FAIL** — see §5. Routing: Soul V2 for cinematic stills; reference-reuse for map/motif scenes; `nano_banana_2` (top-up bridge) → Google workflow (H3) for precision. |
| 2026-07-02 | Branch `feat/longform-hybrid` created; v1 implementation committed separately. Plan rewritten to junior-developer task level (H0–H7, per-task done-when + per-phase exit). Owner approved small credit top-up as H2.4 bridge. |
