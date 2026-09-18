# Implementation Plan — Move Long-Form Image Generation to Google (Workspace Studio → Flow)

> **Status:** Planning · **Author:** derived from Silenced (#29) production + pasted Workspace Studio flow spec
> **Scope:** Still-image + reference-bible generation only. TTS (Kokoro), video clips, and final
> assembly are **unchanged** by this plan.
> **Related docs:** `docs/longform-29-how-we-made-it.md` (current pipeline), `docs/long-form-hybrid-plan.md` (H-phases)

---

## 1. Objective

Replace **Higgsfield** as the image-generation provider for `football/documentary/EN` with a
**Google-native workflow** driven by a Google Sheet, orchestrated by **Google Workspace Studio /
Flows**, generating through **Gemini / Google Flow (Imagen · Nano Banana)**, and archiving to
**Google Drive** — so image generation is billed against the **Google AI Pro subscription** instead
of per-image/credit costs.

**Why now:** Higgsfield credits have ended (see memory `project-longform-video-provider`), and the
current stills path is blocked on a paid provider.

### The key realization that shapes this plan

The model we already use — `imageModel: 'nano_banana_2'` in `channels.js` — **is Google's "Nano
Banana" (Gemini 2.5 Flash Image)**, wrapped and resold by Higgsfield. So:

- We are **not** changing image quality or model family — same model, new billing surface.
- The hard part is **not** generation; it's **the bridge**: getting scenes out of Supabase into a
  Google Sheet, and getting finished images out of Google Drive back into R2 + Supabase, without
  losing resumability or our quality gates.

---

## 2. What already exists (do not rebuild)

The pipeline was **built anticipating this move**. Concretely:

| Asset                               | State                                                                       | Relevance                                                                   |
| ----------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `content_clips.image_source` column | Already accepts `'google'` (migration `20260702_hybrid_stills.sql`)         | The routing key already exists — no schema change needed for the happy path |
| `generate-stills.mjs`               | Already **skips** `image_source='google'` rows: `"waiting for H3 workflow"` | Google rows are deliberately deferred to this workflow                      |
| `prompt-sheet.mjs`                  | Writes a **markdown** brief per `google` scene (prompt + ref image URLs)    | The **manual** ancestor of the Sheet export — generalize it                 |
| `import-stills.mjs`                 | Uploads hand-downloaded `S<n>.png` files → R2 → marks `generated`           | The **manual** ancestor of the Drive import — generalize it                 |
| `content_references`                | Holds the 12-image visual bible (key, url, status)                          | Reference conditioning source — see §7                                      |

**In short:** we already have a _3-scene manual_ Google path. This plan turns it into an
_all-stills semi-automated_ Google path.

---

## 3. Current vs. target architecture

### Current (Higgsfield)

```
Supabase content_clips (image_source='higgsfield')
   → generate-stills.mjs → soul.js → Higgsfield API (nano_banana_2, credits)
   → download → R2 → clip_url + status='generated'
```

### Target (Google)

```
Supabase content_clips (image_source='google')
   → export-to-sheet.mjs ──────────────► Google Sheet (one row per still + ref)
                                              │  (Workspace Studio trigger: "new row")
                                              ▼
                                         Ask Gemini  (prompt enhance, house-style inject)
                                              ▼
                                         Generate Image  (Google Flow backend / Imagen · Nano Banana)
                                              ▼
                                         Save to Google Drive  (folder per project)
                                              ▼
                                         Write Drive URL back into the row
   ◄── import-from-sheet.mjs ◄──────────────┘
   → Drive API download → R2 → clip_url + status='generated'
```

**Design invariant:** **Supabase stays the single source of truth.** The Sheet + Drive are a
_generation surface_, not a database. Every image's canonical home remains R2, referenced by
`content_clips.clip_url`. This keeps `assemble-longform.mjs` **completely unchanged**.

---

## 4. Honest constraints & risks (read before committing)

These materially shape the design. Some are channel-existential.

1. **ToS / billing gray area (RED FLAG).** Automating a **consumer** Google AI Pro/Ultra
   subscription for **bulk, commercial** content production may violate Google's personal-use terms.
   Workspace Flows calling image generation on subscription credits at production volume (≈49
   images/project) is exactly the pattern that can get a Google account flagged. **Decision D1
   below.** The clean-but-paid alternative is the Gemini/Vertex **API** (Option B, §10).

2. **Drive "view link" ≠ image binary.** The write-back produces
   `https://drive.google.com/file/d/<ID>/view`. You **cannot** reliably `fetch()` that — large files
   return an HTML virus-scan interstitial. The import script must use the **Drive API**
   (`files.get?alt=media`) via a service account with folder access, or the
   `uc?export=download&id=<ID>` form for small files. Plan assumes **Drive API + service account**.

3. **Reference-image conditioning is the hard part (§7).** Consistency of the goalkeeper / kits /
   stadium across 37 stills currently comes from passing reference **media IDs** into each call. It
   is unverified whether Workspace Flows' "Generate Image" step accepts **image inputs** (Drive
   images) per row. If it does not, cross-scene consistency degrades. **Decision D2 + spike G0.**

4. **We lose in-code quality gates unless re-inserted.** Today `vision-gate.js` /
   `semantic-gate.js` (and `validation: { look, semanticAction }` in the channel) gate images before
   they reach assembly. The no-code Flows path has no equivalent. We re-insert gating **after import**
   (§8, Phase G6).

5. **Quota / rate caps.** Subscription image generation has **daily** caps far lower than an API
   quota. 12 refs + 37 stills = 49 images/project may need to span throttling or multiple days.
   Design for **resumability** (status column) so a partial day is never lost.

6. **Determinism & resumability.** No-code Flows are harder to make idempotent than our Node scripts.
   We enforce idempotency in the **bridge scripts** via `status` + a stable `S<n>` row key, exactly
   like `import-stills.mjs` already does (`status in ('generated','passed')` → skip).

7. **Latency & observability.** Flows runs async and opaquely; a stuck row is invisible to Supabase.
   The Sheet needs a `status` column the import script reconciles, and `export-to-sheet` must be
   safely re-runnable to top up missing rows.

---

## 5. Decisions (recommended defaults; change inline before build)

- **D1 — Billing surface.** ✅ _Recommended:_ proceed with the **subscription (Workspace Flows)**
  path as the primary, **but** treat §10 Option B (Gemini API, pay-per-image) as a first-class,
  already-scaffolded fallback so a ToS block never halts production. Keep volume/account within
  plausible personal-use bounds; do not parallelize across many rows aggressively.
- **D2 — Reference conditioning.** ✅ _Recommended:_ in spike **G0**, verify whether Flows' image
  step accepts Drive image inputs. If **yes** → pass ref Drive URLs per row (full consistency). If
  **no** → hybrid: generate the 12 refs + the ~6 hero-character scenes **in the Gemini app manually
  with attached refs** (as today), and Flows-automate only the **atmosphere/stadium/no-character**
  stills where consistency tolerance is high.
- **D3 — Sheet transport.** ✅ _Recommended:_ real **Google Sheets API via service account**
  (scriptable, re-runnable). Fallback: export a CSV the user pastes once (zero API setup, but manual).
- **D4 — Default `image_source`.** ✅ Flip `football/documentary/EN` default to `google`; keep
  `higgsfield` and `reference` routes intact for per-scene overrides.

---

## 6. Data contracts

### 6.1 Google Sheet schema (tab: `stills`)

One row per still **and** per reference image. Columns:

| Col | Name             | Written by                  | Notes                                                                    |
| --- | ---------------- | --------------------------- | ------------------------------------------------------------------------ |
| A   | `row_key`        | export                      | Stable idempotency key: `29-S14` or `29-ref-goalkeeper`                  |
| B   | `project_id`     | export                      | e.g. `29`                                                                |
| C   | `kind`           | export                      | `reference` \| `still`                                                   |
| D   | `scene_or_key`   | export                      | `S14` or `goalkeeper`                                                    |
| E   | `raw_prompt`     | export                      | `visual_prompt` + GLOBAL ART DIRECTION prefix                            |
| F   | `reference_urls` | export                      | Space-separated Drive URLs of refs to attach (blank for refs themselves) |
| G   | `aspect_ratio`   | export                      | `16:9`                                                                   |
| H   | `gemini_prompt`  | **Flows (Ask Gemini)**      | Enhanced prompt — for audit/repro                                        |
| I   | `drive_url`      | **Flows (Generate + Save)** | Populated when the image is done                                         |
| J   | `status`         | export→Flows→import         | `queued` → `generating` → `done` → (`imported`)                          |
| K   | `error`          | Flows                       | Free text if the step failed                                             |

**Ordering rule:** references first (they must exist in Drive before stills can reference them).
Export writes refs, waits for them to reach `done`, then writes stills with `reference_urls` filled.

### 6.2 Google Drive layout

```
/SignalStudio-Longform/
   /29/
     /refs/    goalkeeper.png, stadium-night.png, …   (12)
     /stills/  S14.png, S30.png, …                     (37)
```

### 6.3 Supabase — no schema change required

- `content_clips.image_source = 'google'`, `clip_url` ← R2 URL after import, `status` lifecycle unchanged.
- `content_references` gains **no new column**; we reuse `url` (R2) and can stash the Drive URL in an
  existing free field if one exists, else the Sheet is the Drive↔ref map. _(Confirm in G1 whether a
  `drive_url` column on `content_references` is worth adding; optional.)_

---

## 7. Reference-image consistency strategy (the crux)

Consistency across 37 stills is the single biggest quality risk in switching surfaces.

**Path A — Flows accepts image inputs (verify in G0):**

1. Generate the 12 refs first (as `kind='reference'` Sheet rows, no `reference_urls`).
2. Import step records each ref's Drive URL (col I) back into the Sheet's ref rows.
3. `export-to-sheet` for stills fills col F (`reference_urls`) with the relevant refs' **Drive URLs**.
4. Flows "Generate Image" attaches those Drive images as conditioning → Nano Banana multi-ref edit.
   → **Full consistency, fully automated.**

**Path B — Flows cannot take image inputs (fallback):**

- Refs + the ~6 hero-character scenes: generate in the **Gemini app** manually with refs attached
  (today's proven method), then drop into the Drive `/stills/` folder named `S<n>.png`.
- Atmosphere / crowd / stadium / object scenes (no recurring character): full Flows automation with a
  **text-only** enhanced prompt (the `Ask Gemini` step bakes the house-style + scene description).
- The import script handles both identically (it only reads Drive → R2).

Either way, `import-from-sheet.mjs` is oblivious to how the image was made — clean seam.

---

## 8. Step-by-step build phases

Named `G0…G7` to sit alongside the existing `H0…H6` phases.

### G0 — Capability spike (½ day, do first) ⚠️ blocking

- In Google Workspace Studio, build a **throwaway 1-row Flow**: trigger on new Sheet row → Ask Gemini
  (enhance) → Generate Image → Save to Drive → write `drive_url` + `status='done'` back.
- **Verify the three unknowns:** (a) can the image step run on **subscription** credits at all;
  (b) does it accept **Drive image inputs** (→ decides D2/§7 path); (c) can it **write back** to the
  Sheet. Record findings at the top of this doc.
- **Exit criteria:** one image round-trips Sheet→Drive→Sheet automatically.

### G1 — DB + channel config

- `channels.js`: in `football/documentary/EN`, set the **default image routing to Google**. Concretely:
  `source`/`imageModel` stay for clips, but add an explicit `imageProvider: 'google'` (or set the
  per-still default `image_source: 'google'`) consumed by `plan.mjs`/classification so new projects
  default google. Keep `nano_banana_2` documented as "same model, via Higgsfield" for the fallback.
- (Optional) add `content_references.drive_url` column via a small migration if we want the Drive map
  in the DB rather than only the Sheet.

### G2 — `export-to-sheet.mjs` (replaces the markdown prompt-sheet for google rows)

- Input: `--project N`. Reads `content_clips` where `image_source='google'` + `status='pending'`,
  and `content_references`.
- Writes/updates rows in the Google Sheet (Sheets API, service account) using `row_key` as upsert key
  — **idempotent**: re-run only adds missing rows, never duplicates (mirrors `import-stills` skip logic).
- Emits refs first, stills second (§6.1 ordering rule), fills `reference_urls` for stills from the
  refs' Drive URLs once known.
- Reuses `prompt-sheet.mjs`'s ART_DIRECTION prefixing logic (lift the shared bit into a helper).

### G3 — Workspace Studio / Flows automation (no-code, per pasted spec)

- Trigger: "When a new row is added" to the project Sheet (`status='queued'`).
- Node 1 **Ask Gemini**: turn `raw_prompt` (+ `reference_urls` context) into `gemini_prompt`, inject
  house style (16:9, cinematic grade, anonymized players — see `docs/strategic-blueprint-…` §9.2 safe
  prompt policy). Write to col H, set `status='generating'`.
- Node 2 **Generate Image**: Flow/Imagen·Nano Banana from `gemini_prompt` (+ Drive ref inputs if D2=Path A).
- Node 3 **Save to Drive**: into `/SignalStudio-Longform/<project>/{refs|stills}/`, filename from
  `scene_or_key`.
- Node 4 **Write back**: `drive_url` (col I), `status='done'` (or `error` on failure).

### G4 — `import-from-sheet.mjs` (generalizes `import-stills.mjs`)

- Input: `--project N`. Reads Sheet rows with `status='done'` (and not yet `imported`).
- Downloads each `drive_url` via **Drive API** (`files.get alt=media`, service account) → buffer.
- Uploads to R2 at the **same keys the pipeline already expects**:
  `longform/<project>/stills/S<n>.png` and `longform/<project>/refs/<key>.png`.
- Writes back: stills → `content_clips.clip_url` + `status='generated'`; refs →
  `content_references.url` + `status='passed'`. Sets Sheet `status='imported'`.
- **Idempotent**: skip rows already `generated`/`passed` (copy `import-stills.mjs` guard exactly).

### G5 — Orchestrator glue

- Small `google-stills.mjs` (or extend the run doc) that runs `export-to-sheet` → _waits for human/
  Flows_ → `import-from-sheet`, and prints how many rows are still `queued`/`generating` so a run can
  be resumed across quota days.
- `generate-stills.mjs` `google` branch: keep skipping (Flows owns generation), but update the log to
  point at the Sheet + import step instead of the old markdown brief.

### G6 — Re-insert quality gates

- After import, run the existing `vision-gate.js` / `semantic-gate.js` against the R2 images (they’re
  provider-agnostic — they read a URL). Wire them into G5 so imported google images are gated exactly
  like Higgsfield ones were, preserving `validation: { look, semanticAction }`.
- Failures → `status='failed'` + re-queue in the Sheet (reset that row to `queued`).

### G7 — Docs + rollback wiring

- Update `docs/longform-29-how-we-made-it.md` STEP 3/3b/4 to describe the Google surface.
- Keep the Higgsfield path selectable via `--source higgsfield` for one project as a live rollback
  (it still works, just needs credits).

---

## 9. Assembly & downstream: unchanged

`generate-tts.mjs`, `generate-clips.mjs`, and `assemble-longform.mjs` require **zero changes** — they
read `clip_url`/`vo_url` from Supabase and don't care how the image was produced. This is the whole
point of keeping Supabase as source of truth. _(Video clips remain a separate provider decision — see
memory `project-longform-video-provider`; this plan is images only.)_

---

## 10. Option B — the clean fallback (Gemini / Vertex API, pay-per-image)

If D1 resolves against the subscription path (ToS block, quota too low, or Flows can't take image
inputs), the **minimal-change** alternative keeps **everything in code**:

- Add `google.js` beside `soul.js` exposing `generateStill()` backed by the **Gemini API**
  (`gemini-2.5-flash-image` / Imagen) — same signature, accepts reference image bytes/URLs.
- In `generate-stills.mjs`, route `image_source='google'` to `google.js` instead of skipping.
- **No Sheets, no Drive, no Flows** — reuses the existing download→R2→DB + in-code gates verbatim.
- Cost: pay-per-image (defeats the subscription motivation) but ToS-clean, resumable, gated, one file.

Keep this scaffolded; it's the insurance policy behind D1.

---

## 11. Rollback plan

1. `--source higgsfield` on `generate-stills.mjs` restores the old path instantly (needs credits).
2. Nothing in this plan drops or renames columns, so reverting `channels.js` default is a one-line change.
3. R2 keys and DB shape are identical across all three surfaces (Higgsfield / Google-Flows / Google-API),
   so assembly can mix images produced by any of them within one project.

---

## 12. Build checklist

- [ ] **G0** spike: subscription image gen + Drive image input + Sheet write-back verified (fills D2)
- [ ] **G1** `channels.js` default → google; optional `content_references.drive_url` migration
- [ ] **G2** `export-to-sheet.mjs` (idempotent, refs-first ordering, ART_DIRECTION reuse)
- [ ] **G3** Workspace Studio Flow: Ask Gemini → Generate → Drive → write-back
- [ ] **G4** `import-from-sheet.mjs` (Drive API download, R2 keys, DB write-back, idempotent skip)
- [ ] **G5** orchestrator glue + resumable status reporting
- [ ] **G6** re-wire `vision-gate` / `semantic-gate` after import
- [ ] **G7** docs update + Higgsfield rollback path kept live
- [ ] **Insurance:** Option B `google.js` (Gemini API) scaffolded

---

## 13. Open questions to resolve during G0/G1

1. Does Workspace Studio/Flows image generation actually draw on the **AI Pro subscription**, or does
   it silently require a billed Cloud project? (Determines whether this plan's premise holds.)
2. Can the "Generate Image" step take **Drive image inputs** for reference conditioning? (D2 fork.)
3. Daily image cap on the subscription — how many of the 49 fit in one day? (Sets throttle/resume cadence.)
4. Is a service account allowed to read the Drive output folder for programmatic download, or must the
   folder be shared to it explicitly? (Drive API setup detail for G4.)
