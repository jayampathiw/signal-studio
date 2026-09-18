# Long-Form Video Pipeline — Plan & Progress Tracker

> ⚠️ **SUPERSEDED 2026-07-05.** This plan is kept for reference only.
> **Execute from `docs/longform-final-plan.md`** (phases F0–F10) — the merged
> stills-only, cloud-first final plan. Do not update this document.

> **Purpose:** track the design and build of the long-form (10–15 min+) video
> generation pipeline. This is the working document — update it as decisions
> land and tasks complete.
>
> **Created:** 2026-07-01
> **Owner:** jayampathiw
> **Status:** 🔄 Design agreed + code-evaluated (§6b); 10-phase build plan ready (§7); **Phase 0 complete** (§7a — all decisions made + 8-concurrent ceiling confirmed by spike); build not yet started
> **Related:** `docs/video-generation-flow.md §1.4` (original `chapter_chain` design — **superseded in part**, see §5), `docs/PROJECT-STATUS.md` (roadmap line "Long-form `chapter_chain` format ⬜")

---

## Status legend

| Mark | Meaning                                               |
| ---- | ----------------------------------------------------- |
| ✅   | Done                                                  |
| 🔄   | In progress                                           |
| ⬜   | Not started                                           |
| 🐞   | Known bug                                             |
| ⏸️   | Deferred                                              |
| ❓   | Open question — needs an answer before it can proceed |

---

## 1. The goal

Generate long-form videos (target **10–15 minutes**, ~48 clips for a first
target; architecture scales to 300+) from a **video script / shot list**, with:

- **Input is a structured shot list** (not a bare concept) — already broken into
  scenes with per-scene visual prompt, VO line, audio cue, duration, and a
  Global Art Direction block. See §4 Phase 1 for the exact shape.
- Claude analyses the shot list once, builds a **character/motif reference-image
  bible**, and maps each scene to the right reference(s)
- Clips generated in parallel up to Higgsfield's account limit (8-wide)
- **Two validation gates** — reference images (Phase 1) and output clips (Phase 2)
- Automated FFmpeg assembly into the final video
- **Resumable** — a crash midway never loses completed work

**First real target:** "Silenced: The Night a Goalkeeper Sent Germany Home"
(South American Football #1) — 51 scenes, 48 generated clips (scenes 3, 21, 50
are text cards). Full script + shot list held by owner; this is the pilot.

---

## 2. Established facts (verified this session — 2026-07-01)

| Fact                             | Value                                                                                           | Source                      |
| -------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------- |
| Higgsfield plan                  | **Max**                                                                                         | `higgsfield account status` |
| Higgsfield concurrent job limit  | **8 videos + 8 images**, API-enforced; overflow **rejected** (`rate_limit_reached`), NOT queued | spike 2026-07-01 (§7a)      |
| Seedance 2.0 Mini + Fast credits | **Unlimited this month**                                                                        | user-confirmed              |
| Credit balance (other models)    | ~270–360 (fluctuating; irrelevant while Seedance is unlimited)                                  | `account status`            |
| Higgsfield workspace ID          | `d5847cc9-7c8b-4bca-aa5f-6cb6bb6b5ea6` (Private, Max)                                           | `higgsfield workspace list` |
| Higgsfield CLI                   | `higgsfield` (aliases `hf`, `higgs`), v0.2.x, creds at `~/.config/higgsfield/credentials.json`  | installed globally          |
| Short-reel cloud gen wall-clock  | ~25 min (setup ~1 min; generation step ~24 min)                                                 | run #20/#21 timing          |
| Existing validation agents       | `image-quality-gate` (image vs prompt/house-rules), `continuity-checker` (scene-to-scene look)  | Tier 2, already built       |
| **Not yet built**                | video→frames splitting + **semantic-action** validation                                         | confirmed this session      |

**The hard ceiling:** 8 concurrent Higgsfield jobs per account. No local
mechanism (Docker, extra runners, worker threads, Actions matrix) raises it —
they'd all just get queued/rejected past 8. Throughput is capped server-side.

---

## 3. Why the short-reel approach doesn't scale to long-form

The current cloud runner drives generation through an **LLM agent**
(`claude --print` running the `wild-eye-reel` skill). For 1–3 clips that's fine.
For 48+ clips it breaks:

| Problem                     | Cause                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------ |
| Context overflow            | Agent accumulates every job ID / poll / URL in one growing context; overflows mid-run around batch 4–5 |
| No checkpointing            | Progress lives in agent memory → a crash loses everything                                              |
| Idle capacity               | "Submit 8 → wait for all 8 → next 8" wastes time waiting on the slowest clip in each batch             |
| 60-min Actions timeout      | `generate.yml` has `timeout-minutes: 60`; a slow batch can blow it                                     |
| One failure poisons a batch | No per-job failure handling → hang or a gap that breaks FFmpeg assembly                                |

---

## 4. Agreed architecture

**The LLM only runs in Phase 1 (planning) and inside per-item validation
subagents. Generation is a plain, deterministic Node script with a rolling
concurrency pool. Supabase is the single source of truth — both the generation
pool and the validation pool are producer/consumers on it, which is what makes
the whole thing resumable.**

### Phase 1 — Planning (LLM, once)

Input is a **structured shot list** (per-scene: `visual_prompt`, `vo`, `audio`,
`text_card?`, `duration_sec`, + a global art-direction block). Claude:

1. **Parse** the shot list into structured scene rows (scene-identification is
   mostly parsing — the shot list already did it).
2. **Build the character/motif reference bible.** Cluster recurring anchors and
   define one reference image per _character/motif_, not per clip.
   Pilot anchors (proof it's a small cast, not one image):

   | Anchor                      | Scenes                     | Note                                                                                                                 |
   | --------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------- |
   | Goalkeeper — **4 distinct** | ~13                        | Chilavert (vintage 90s, S8), Villar (2010 captain, S10), Gill (modern, S2/13/26/32/33/46/47/49), Neuer (German, S36) |
   | Map of South America        | S4, S5, S43                | one plate                                                                                                            |
   | Wall / fortress motif       | S7, S24, S44               | one                                                                                                                  |
   | Stadium at dusk             | S1, S2, S16, S40, S42, S48 | one                                                                                                                  |
   | Penalty spot                | S31, S33, S38              | one                                                                                                                  |

3. **Map each scene → the right reference(s)** (S8→vintage-Chilavert,
   S36→Neuer, S45→all three keepers, etc.).
4. **Write the Supabase rows** — reference-image manifest + per-scene clip rows
   (global art direction pasted into every clip prompt), all `status = pending`.

### Phase 1b — Reference images (generate + gate, BEFORE any clip)

Reference images are generated in the 8-wide image pool, then **validated by
`image-quality-gate`**. A bad character sheet poisons every clip that references
it, so **Phase 2 does not start until all reference images pass.**

### Phase 2 — Generation + validation (two decoupled pools)

Two independent worker pools, both reading/writing Supabase — no LLM in the
generation loop; vision only inside stateless per-clip validation calls.

```
GENERATION POOL (8-wide, Higgsfield-limited)      VALIDATION POOL (own concurrency)
  pick clips: status = pending                      pick clips: status = generated
  submit to Higgsfield → status = generated  ──►    extract sample frames (ffmpeg)
  never blocks on validation                        run vision checks:
  slot frees immediately → next clip                  • look   → continuity-checker
                                                        • action → NEW semantic check
                                                    pass → status = passed (+ url kept)
                                                    fail → status = pending (requeue) + reason
```

**Clip lifecycle (single status field):**

```
pending → generating → generated → validating → passed
                                          └── failed → pending  (retry, capped at N)
```

**Two validation concerns, two mechanisms** (see §6a):

- **Look drift** (wrong-looking character/location) → _prevented_ by reference
  images; _checked_ by `continuity-checker` / `image-quality-gate`.
- **Semantic-action error** (football→volleyball; kicking→hands) → reference
  images do NOT fix this (they control appearance, not motion) → **NEW
  frame-split semantic check** is required.

### Phase 3 — Assembly (FFmpeg)

```
Fetch passed clip urls in scene order ─► FFmpeg concat (+ VO/audio/music) ─► R2 ─► final URL
```

### Crash recovery

Re-run. Each pool grabs whatever isn't terminal: generation picks `pending`,
validation picks `generated`. Completed clips (`passed`) are skipped. No lost
work, no LLM context to rebuild.

**Rough timing for 48 clips:** 48 ÷ 8 ≈ 6 waves × ~5 min ≈ 30 min generation
(validation overlaps, doesn't add wall-clock) + ~5 min assembly = **~35 min**,
plus a Phase 1b reference-image pass (~1 wave) up front.

---

## 5. Relationship to the existing `chapter_chain` design

`docs/video-generation-flow.md §1.4` already designed a `chapter_chain` format.
This plan **keeps its data model** but **replaces its execution model**:

| Aspect            | Original `chapter_chain` design                   | This plan                                                                                    |
| ----------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Generation driver | LLM agent, one session per chapter                | Deterministic Node script, one rolling pool                                                  |
| Parallelism       | Sequential chapters, chained final→start frame    | 8-wide rolling pool across all clips                                                         |
| Resume            | Not addressed                                     | Supabase clip-status state machine                                                           |
| Continuity        | final-frame → next start-frame chain (sequential) | **Shared reference images per character/motif** (keeps full parallelism) — RESOLVED, see §6a |
| Validation        | none                                              | Two gates: reference images + output clips (look + semantic-action)                          |
| Assembly          | FFmpeg per chapter → final                        | FFmpeg concat all clips → final (same idea)                                                  |

Reusable from the original design: `target_duration_sec` + `chapters` jsonb
columns, `scene.chapter_n` field, narration providers (Kokoro / Higgsfield /
none), `channels.js` `long_form` format block.

---

## 6a. Validation — two concerns, two mechanisms

The key insight this session: the two failure modes we've observed are
**different problems** and reference images only solve one of them.

| Concern                                                        | Example                                                                     | Fix                                                                                                                              | Built?               |
| -------------------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| **Look drift** — character/location inconsistent between clips | Gill looks like a different keeper across scenes                            | **Reference images** (prevention) + `continuity-checker` / `image-quality-gate` (detection)                                      | ✅ agents exist      |
| **Semantic-action error** — the _motion/content_ is wrong      | Football clip renders a volleyball scene; player uses hands instead of feet | **NEW frame-split check**: ffmpeg extract N sample frames → vision agent verifies action/content against the scene's VO + prompt | ⬜ **net-new build** |

Why reference images don't cover semantic-action errors: a reference controls
_appearance_, not _motion_. The model can render a perfectly on-model goalkeeper
performing the completely wrong action. So both gates are needed; they are not
redundant.

Both gates run as **stateless per-item subagent calls** inside the validation
pool — independent, no growing context, so they do **not** reintroduce the
Phase-2 context-overflow risk.

---

## 6. Risks & mitigations

| Risk                                                | Mitigation                                                                                  | Status                                 |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------- |
| Context overflow                                    | LLM out of the generation loop; validation is stateless per-item                            | ✅ designed out                        |
| Lost work on crash                                  | Supabase clip-status state machine; both pools resume from it                               | ✅ designed in                         |
| Idle capacity between batches                       | Rolling pool, not fixed batches                                                             | ✅ designed in                         |
| Generation blocked by validation                    | Decoupled pools — generation never waits on a vision call                                   | ✅ designed in                         |
| Look drift across clips                             | Shared reference images per character/motif + look-continuity gate                          | ✅ designed in (§6a)                   |
| Semantic-action errors                              | Frame-split semantic check                                                                  | ⬜ **net-new build** (§6a)             |
| Bad reference poisons all clips                     | Gate reference images before generation starts (Phase 3 barrier)                            | ✅ designed in                         |
| **Concurrent-write clobber**                        | Normalized `content_clips` table, one row/clip — atomic per-worker updates                  | ✅ designed in (§6b #1)                |
| Duplicate jobs on resume                            | Poll in-flight `higgsfield_job_id`s before resubmitting                                     | ✅ designed in (Phase 4)               |
| Overflow rejected not queued (`rate_limit_reached`) | Pool self-limits to 8; treat rate-limit as back-off, not a retry-consuming failure          | ✅ designed in (Phase 4, §7a spike)    |
| VO/picture desync                                   | Per-scene TTS, clip target = VO segment duration                                            | ✅ decided (§7a) — designed in Phase 6 |
| Semantic-check false-rejects (stylized art)         | "Both" strictness chosen → Phase 8 threshold tuning is now **load-bearing**, not optional   | ⬜ Phase 8 (elevated)                  |
| Ship a video with holes                             | Assemble-with-hold, but publish guard blocks `rendered→publishing` while any clip `blocked` | ✅ decided (§7a) — Phase 6             |
| Actions 60-min timeout                              | Raise to ~180 min + resumable re-dispatch backstop                                          | ⬜ Phase 7                             |
| Single job failure                                  | Per-job try/catch; flip row to `failed`→`pending`, keep pool moving                         | ✅ designed in                         |
| Retry storms (a clip that always fails)             | Cap retries at N, then flag `blocked` for human review                                      | ✅ designed in (Phase 5)               |

---

## 6b. Codebase grounding (verified 2026-07-01)

Evaluation against the real code changed five things. These are load-bearing.

| #    | Finding                                                                                                                                                                                                                                                                                 | Impact on the plan                                                                                                                                                      |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 🔴 | **Concurrent-write hazard.** Existing state lives in ONE `scenes` jsonb on ONE row (`scene_status`, `higgsfield_*_job`, `clip_url`). Fine for the sequential single-agent pipeline; **8 parallel workers doing read-modify-write on the same jsonb clobber each other** (lost updates). | **Must use a normalized `content_clips` table — one row per clip** — for atomic concurrent updates. Non-negotiable. Drives Phase 1.                                     |
| 2 🟡 | **`continuity-checker` doesn't fit.** Its inputs are `prevFinalFrameUrl` + `nextScenePrompt` — built for the frame-chain model we deliberately dropped.                                                                                                                                 | Look-check instead = `image-quality-gate` on **extracted clip frames vs the reference image**. `continuity-checker` re-scoped or dropped for long-form. Drives Phase 5. |
| 3 🟢 | **Assembly is mostly reuse.** `assemble-reel.mjs` already does download→`concatClips`(`@signal-studio/render-ffmpeg`)→`uploadToR2`(`@signal-studio/media/storage`)→write `rendered_video_url`. Hardcoded to 21s/3-scenes.                                                               | Phase 6 **generalizes** it to N clips + VO/music mux — not a rebuild.                                                                                                   |
| 4 🟢 | **Reference passing supported.** `higgsfield generate create <model> --image <id>` accepts an upload/job id; `--json` returns job id; poll via `generate get`.                                                                                                                          | Rolling pool: submit w/o `--wait` → store `higgsfield_job_id` → poll. Reference uploaded **once**, media id reused across all citing clips. Drives Phase 3/4.           |
| 5 🔴 | **VO timeline is the hidden hard part.** Pilot is ONE continuous 8–9 min VO track, clips cut on fixed timecodes → assembly becomes a _timing/trim_ problem, and drift desyncs picture from VO.                                                                                          | **Recommended: per-scene TTS**, each clip target = its VO segment duration → assembly is scene-by-scene concat, desync problem gone. Needs owner decision (Phase 0).    |

Other real risks: stylized/silhouette art direction will raise **semantic-check false-rejects**; **resume must poll in-flight Higgsfield jobs before resubmitting** (no duplicates); a stubborn `blocked` clip must not hard-block final assembly with no human surface.

**🔴 Vision-transport finding (2026-07-01):** the configured reseller proxy (`api.contactboxtools.me`) **returns 502 for any image/vision content block** — programmatic vision gating through the Anthropic API path is not possible on this proxy (and the key is a proxy key, so `api.anthropic.com` can't be hit directly). Consequence: **all vision validation (reference gate Phase 3, look + semantic-action Phase 5) must run as Claude Code subagents** (`image-quality-gate`, `continuity-checker`, the new semantic agent) which have vision via the Claude Code runtime — NOT as programmatic proxy calls. `vision-gate.js` remains as the interface but returns `error` on this proxy; the pilot is gated by the interactive Claude Code session's own vision.

---

## 7. Phased task list (the tracker)

> Each phase has a one-line **Goal** and an **Exit** criterion (done-when).
> All manual / human-in-the-loop tasks (handoffs, secrets, uploads, reviews) are
> consolidated in **Phase 9** — the build phases stay code-only.
> Reuse tags: 🟢 reuse · 🟡 adapt · 🔴 net-new.

### Phase 0 — Decisions & spikes

**Goal:** eliminate the unknowns that would force a rebuild if guessed wrong.

- [x] ✅ **VO strategy** — per-scene TTS (§7a)
- [x] ✅ **Semantic-action strictness** — both (per-scene + channel rules) from day one (§7a)
- [x] ✅ **Blocked-clip policy** — assemble-with-hold + publish guard (§7a)
- [x] ✅ Continuity approach — shared reference images per character/motif (§6a)
- [x] ✅ Spike done — 8 confirmed, API-enforced; **overflow rejected not queued** (§7a, §2)
- **Exit:** ✅ all decisions recorded; ceiling confirmed. **Phase 0 complete.**

### Phase 1 — Concurrency-safe data model ✅ COMPLETE (2026-07-01)

**Goal:** a schema where 8 workers run in parallel and the whole job resumes from Supabase alone.

- [x] ✅ 🟢 Add `target_duration_sec`, `chapters` jsonb to `content_items` + `planning` status
- [x] ✅ 🔴 **New `content_clips` table** (one row per clip): `project_id, scene_n, kind(clip|text_card), visual_prompt, vo_text, audio_cue, text_overlay, duration_sec, reference_keys[], higgsfield_job_id, clip_url, vo_url, status(...), retry_count, fail_reason` + `unique(project_id, scene_n)`
- [x] ✅ 🔴 **New `content_references` table**: `project_id, key, description, prompt, higgsfield_media_id, url, status, retry_count, fail_reason` + `unique(project_id, key)`
- [x] ✅ Indexes on `(project_id, status)` for both tables; updated_at triggers
- [x] ✅ `long_form` format block in `channels.js` (`football/documentary/EN`, `reference_pool` strategy, `concurrency:8`)
- [x] ✅ Migration `supabase/migrations/20260701_longform_schema.sql`; applied via `supabase db push`; tables verified queryable
- **Exit:** ✅ a worker can atomically claim/update one clip row without touching siblings.

### Phase 2 — Planning step (LLM, once) ✅ COMPLETE (2026-07-01)

**Goal:** turn a raw shot list into structured, generation-ready rows + reference manifest, deterministically.

- [x] ✅ Deterministic parser `apps/video/src/longform/parse-shotlist.js` (validated: 51 scenes → 48 clips + 3 text cards @ 3/21/50)
- [x] ✅ LLM: cluster recurring anchors → `content_references` (`plan-references.js`); 12 anchors (goalkeeper_silhouette, paraguay_map, fortress_wall, penalty_tension…)
- [x] ✅ LLM: map each scene → `reference_keys` (S8→keeper, S36→keeper+penalty, S45→keeper+lineage); one-offs (S14/28/29/51) correctly unreferenced
- [x] ✅ Orchestrator `apps/video/scripts/longform/plan.mjs` (parse → bible → insert), with `--dry`, `--bible <cache>`, bible auto-cache
- [x] ✅ **Pilot inserted: project `content_items.id=29`** — 12 references (pending), 48 clip rows (pending), 3 text cards (passed)
- **Exit:** ✅ pilot's 48 clips + 12 references exist with correct scene→reference mapping.
- **Infra fixes en route:** `packages/ai/claude.js` — (1) select first `text` block (Opus returns a `thinking` block first), (2) guard `parseResponse` against fenced/prose output, (3) bounded client (timeout+retries), (4) new `chatText()` **fetch transport** (the Anthropic SDK stalls on this reseller proxy for larger requests; plain fetch works). ⚠ **Proxy is flaky** (Opus hangs; intermittent 524s) → planning caches the bible so a good generation is never re-fetched.

### Phase 3 — Reference images + gate (the barrier) ✅ COMPLETE (2026-07-01)

**Goal:** an approved visual bible before a single video credit is spent.

- [x] ✅ Reusable `pool.js` (rolling 8-wide) + `higgsfield.js` (submit/poll, rate-limit back-off, array-id shape) + `vision-gate.js`
- [x] ✅ `generate-references.mjs` — generated 12 refs 8-wide via `nano_banana_2`; stored `higgsfield_media_id` (image job id, reusable as `--image`) + `url`
- [x] ✅ Gate: proxy can't do vision (502) → **gated visually by the Claude Code session**. Caught 3 real defects: `attacker_waves`→soldiers/rifles, `paraguay_map`→stray text, `lone_figure_walk`→theatre not stadium. Refined prompts + regenerated (resumable — 9 passed rows untouched) → all fixed.
- [x] ✅ **Hard barrier OPEN — 12/12 `passed`**, each with a media id.
- **Exit:** ✅ all references passed with reusable media ids; the semantic-error catch (soldiers) validates the gate premise on real output.

### Phase 4 — Generation pool

**Goal:** all clips generated in parallel, pinned at the 8-wide ceiling, fully resumable.

- [ ] ⬜ 🔴 Add a concurrency primitive (`p-limit` or hand-rolled — none exists yet), **self-limited to 8** (overflow is rejected, not queued — §7a spike)
- [ ] ⬜ Rolling pool: claim `pending` → `generate create --image <ref ids> --json` → store `higgsfield_job_id`, set `generating`
- [ ] ⬜ Poll `generate get`; on success store `clip_url`, set `generated`
- [ ] ⬜ **Handle `rate_limit_reached` as back-off + retry** — NOT a job failure (do not increment `retry_count` or mark `failed`); safety net if the pool briefly overshoots 8
- [ ] ⬜ **Resume-safe submit:** poll existing in-flight `higgsfield_job_id`s before submitting new ones (no duplicates)
- [ ] ⬜ Per-job _generation_ failure → `failed`→`pending`, keep pool full; cap retries → `blocked`
- **Exit:** re-running twice never duplicates a job and converges all clips to `generated`; a forced rate-limit hit backs off cleanly without consuming a retry.

### Phase 5 — Validation pool (decoupled)

**Goal:** every clip verified for look AND action, bad clips auto-recycled.

- [ ] ⬜ 🔴 **video→frames splitter** (ffmpeg extract N sample frames per clip)
- [ ] ⬜ 🟡 **Look check:** `image-quality-gate` on frames vs the clip's reference image
- [ ] ⬜ 🔴 **Semantic-action agent (both mechanisms — Phase 0 decision):** per-scene expected-action from the scene's VO/prompt (primary) **+** channel rule-set backstop (football not volleyball; feet not hands except keepers; no real faces)
- [ ] ⬜ 🔴 Channel rule-set authored for the football/diaspora channel (feeds the backstop)
- [ ] ⬜ Pool consuming `status='generated'`; `passed` / `failed→pending` + reason; cap retries → `blocked`
- **Exit:** a deliberately-wrong clip (e.g. volleyball, or a throw-in where a corner was scripted) is caught and requeued automatically; false-reject rate captured for Phase 8 tuning.

### Phase 6 — Assembly

**Goal:** clips + VO become one final MP4 in R2.

- [ ] ⬜ **Per-scene TTS** (Phase 0 decision) via `@signal-studio/media`; each clip's target duration = its VO length + scripted tail-silence for dramatic pauses
- [ ] ⬜ 🟡 Render text cards (scenes 3/21/50) via Remotion/FFmpeg — no Higgsfield
- [ ] ⬜ 🟡 Generalize `assemble-reel.mjs` to N clips: order by `scene_n`, mux clip+VO per scene, `concatClips`, mix music bed
- [ ] ⬜ **Assemble-with-hold** (Phase 0 decision): insert reference-still/slate for `blocked` clips; do NOT fail assembly on holds
- [ ] ⬜ **Publish guard:** block the `rendered → publishing` transition while any scene is `blocked`
- [ ] ⬜ Upload to R2, write `rendered_video_url`, set `status='rendered'`
- **Exit:** the assembled MP4 plays with VO in sync end-to-end; a run with one blocked clip still produces a viewable cut but cannot advance to publishing.

### Phase 7 — Orchestration & cloud

**Goal:** one dispatch runs the whole pipeline headless and survives interruption.

- [ ] ⬜ `longform.yml` in `reel-pipeline` (separate from `generate.yml`); raise `timeout-minutes` (~180) + resume as backstop
- [ ] ⬜ Runner sequences: Plan → References(+barrier) → Generate ⇄ Validate → Assemble
- [ ] ⬜ Trigger path (edge function / dispatch) with `content_item_id`
- **Exit:** a single dispatch reaches `status='rendered'` with no manual steps; mid-run cancel + re-dispatch resumes cleanly.

### Phase 8 — Pilot run & hardening

**Goal:** the actual "Silenced / Paraguay" video, produced end-to-end.

- [ ] ⬜ Dry run on a **3-clip slice** first (exercises every mechanism in ~5 min/iteration)
- [ ] ⬜ Full 48-clip pilot run; measure wall-clock + retry rate
- [ ] ⬜ Dashboard surface for `blocked` clips (human fix/regenerate)
- [ ] ⬜ Tune semantic-check thresholds from real false-reject data
- **Exit:** the pilot MP4 is in R2, in sync, every scene passed or human-cleared.

### Phase 9 — Manual / human-in-the-loop tasks

**Goal:** the human actions that gate or finish the pipeline — done outside code.

- [ ] ⬜ **Owner:** hand over the pilot script + shot list (gates Phase 2)
- [ ] ⬜ **Secrets:** set/verify `reel-pipeline` secrets for `longform.yml` (Higgsfield token, R2_*, Supabase, Anthropic — reuse existing `generate.yml` set or add) (gates Phase 7)
- [ ] ⬜ **Uploads:** shared assets — music bed, end-screen/brand plate, any human-recorded VO (gates Phase 6)
- [ ] ⬜ **Review:** triage `blocked` clips in the dashboard; fix prompt / regenerate (Phase 8)
- [ ] ⬜ **Approval:** final publish sign-off before posting
- **Exit:** no manual task is blocking any build phase; pilot approved for publish.
- **Note:** these are moved here per convention, but the "gates Phase N" tags show where each is actually needed in sequence.

**Critical path:** Phase 0 → 1 gate everything. 4 and 5 run concurrently (producer/consumer); 5's design depends on Phase 0's strictness decision. 3 is a hard barrier before 4. 6 depends on Phase 0's VO decision. Manual items in Phase 9 gate earlier phases as tagged.

**Biggest de-risking move:** build Phases 1–6 against a **3-clip slice** first — it exercises normalized rows, the barrier, the pool, validation, and assembly in ~5 min/iteration instead of ~50.

---

## 7a. Phase 0 decisions log

Record decisions here as they're made (currently open).

| Decision                        | Options                                      | Chosen                                 | Date       | Rationale                                                                                                                                                                                                                                                                                         |
| ------------------------------- | -------------------------------------------- | -------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VO strategy                     | per-scene TTS · single master track + trim   | **Per-scene TTS**                      | 2026-07-01 | Removes VO/picture desync entirely; each clip target = its VO length; parallel + resumable per scene; dramatic pauses = explicit tail-silence                                                                                                                                                     |
| Semantic-action strictness      | per-scene from VO · channel rules · both     | **Both from day one**                  | 2026-07-01 | Per-scene expected-action (primary) + channel rule-set backstop. Most thorough; accepts higher false-reject risk on stylized art → **Phase 8 threshold tuning is now load-bearing, not optional**                                                                                                 |
| Blocked-clip policy             | hard-require all passed · assemble-with-hold | **Assemble-with-hold + publish guard** | 2026-07-01 | Always get a viewable cut with a reference-still/slate for blocked clips; publishing (not assembly) gated on zero blocked → can't ship a video with holes                                                                                                                                         |
| Concurrency ceiling (empirical) | confirm 8                                    | **8, API-enforced**                    | 2026-07-01 | Spike: 8 jobs ran `in_progress`, 9th+ **rejected** with `rate_limit_reached` + `concurrent_jobs_limit:8`. **Overflow is rejected, not queued** → pool must self-limit to 8 and treat `rate_limit_reached` as back-off, not failure. `use_unlim:false` — unlimited credits ≠ unlimited concurrency |

---

## 8. Open questions

- ✅ **Continuity model — RESOLVED.** Shared reference images per character/motif
  (keeps full parallelism). Frame-chaining rejected because it serialises the
  pipeline. See §6a.
- ✅ **Narration & audio — RESOLVED.** Per-scene TTS; each clip target = its VO
  length + scripted tail-silence. Still to confirm during build: whether the 🔊
  audio cues (SFX) are separate layers or baked into the VO track.
- ✅ **Semantic-action strictness — RESOLVED.** Both mechanisms from day one
  (per-scene expected-action + channel rule-set backstop). Trade-off accepted:
  Phase 8 threshold tuning is now load-bearing.
- ❓ **Actions timeout.** Raise `timeout-minutes` past 60, or rely on
  resumability and re-dispatch to continue? (Phase 7)
- ❓ **Scene count source.** Parsed from the shot list (pilot has explicit scenes)
  vs. derived from `target_duration_sec ÷ clipDurationSec` for concept-only input.
- ❓ **Text cards** (scenes 3, 21, 50) — rendered by FFmpeg/Remotion in assembly,
  no Higgsfield clip. Confirm the rendering path.

---

## 9. Session log

| Date       | Note                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-01 | Reel #28 (short) unblocked: stale `HIGGSFIELD_AUTH_TOKEN` refreshed + `runner.sh` workspace-UUID parse bug fixed (reel-pipeline commit `847664a`). Generation succeeded.                                                                                                                                                                                                                                                                                                |
| 2026-07-01 | Long-form design agreed: deterministic Node rolling-pool (8-wide) + Supabase-resume, superseding the LLM-per-chapter execution model. This document created.                                                                                                                                                                                                                                                                                                            |
| 2026-07-01 | Refined after owner's handwritten notes + pilot script: input is a structured **shot list**; Phase 1 builds a character/motif **reference-image bible**; continuity RESOLVED via shared reference images (parallelism kept); added **two-pool** (generation + validation) model with clip-status state machine; split validation into **look** (existing agents) vs **semantic-action** (net-new frame-split check). Pilot = "Silenced / Paraguay" (48 clips).          |
| 2026-07-01 | **Deep evaluation against the codebase** (§6b): 5 load-bearing findings — normalized `content_clips` table required (concurrent-write hazard), `continuity-checker` doesn't fit the parallel model, assembly is mostly reuse, reference-passing confirmed, VO timeline is the hidden hard part. Rewrote §7 into a 10-phase list with per-phase Goal + Exit; manual tasks consolidated into Phase 9; added §7a Phase-0 decisions log.                                    |
| 2026-07-01 | **Phase 0 decisions made** (§7a): VO = per-scene TTS; semantic-action strictness = both mechanisms (per-scene + channel rules) from day one; blocked-clip policy = assemble-with-hold + publish guard. Propagated to Phases 5/6, risks, and open questions.                                                                                                                                                                                                             |
| 2026-07-01 | **Concurrency spike run — Phase 0 complete.** 8 jobs ran `in_progress`, 9th+ **rejected** with `rate_limit_reached` + `concurrent_jobs_limit:8` (`plan_type:max`, `use_unlim:false`). Key finding: **overflow is rejected, not queued** → pool self-limits to 8 and treats rate-limit as back-off, not failure (Phase 4). Unlimited credits ≠ unlimited concurrency.                                                                                                    |
| 2026-07-01 | **Phase 1 built + applied.** Migration `20260701_longform_schema.sql` (content_clips, content_references, project fields, +planning status); `football/documentary/EN` channel added; tables verified queryable.                                                                                                                                                                                                                                                        |
| 2026-07-01 | **Phase 2 built + pilot planned → project id=29.** Deterministic shot-list parser + LLM reference bible (12 anchors, 48 clips mapped). Fixed 4 `claude.js` issues (thinking-block text selection, fenced-JSON guard, bounded client, new `chatText` fetch transport). ⚠ Reseller proxy flaky (Opus hangs, SDK stalls, intermittent 524) — mitigated with bible caching (`--bible`). Planning model: `claude-sonnet-4-6` (Opus too slow/unavailable-fast on this proxy). |
| 2026-07-01 | **Phase 3 built + references passed.** Reusable `pool.js`/`higgsfield.js`/`vision-gate.js` + `generate-references.mjs`. 12 refs generated 8-wide (`nano_banana_2`). **Proxy has no vision (502)** → gated by the Claude Code session's own vision; caught + fixed 3 defects (soldiers, stray text, theatre). Fixed image model id `nano_banana_pro`→`nano_banana_2`. Barrier OPEN 12/12.                                                                                |
