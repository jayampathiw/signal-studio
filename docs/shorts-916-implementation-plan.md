# Shorts 9:16 Support — Implementation & Deployment Plan

> Written 2026-07-24. Goal: extend the existing stills + Ken Burns ffmpeg pipeline
> (the same one that rendered the 5 shipped long-form documentaries) to produce
> 9:16 vertical Shorts — the 15 clips tracked in `content/shorts/tracker.csv`.
> **Explicitly out of scope:** Higgsfield (`reframe`, `outpaint`, any MCP generation) —
> skipped per decision 2026-07-24; may never be needed.

## 1. Current state (verified in code)

| Component                                           | State                                                                                                                                         | Blocker for 9:16                                                                                                                |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `apps/video/src/longform/motion.js`                 | `buildMotionFilter()` **already accepts `width`/`height`/`fps` params**                                                                       | `CANVAS_W/H` (2880×1620), `pan_lr`/`pan_rl`/`hold` geometry, and caption constants (`CAPTION_Y`, font sizes) are hardcoded 16:9 |
| `apps/video/src/longform/render.js`                 | Shared scene builders (`buildCut`, `buildTextCard`, `buildStillsScene`, legacy builders)                                                      | All use module-level `W`/`H` imports directly; never thread width/height to `buildMotionFilter`                                 |
| `apps/video/scripts/longform/assemble-local.mjs`    | File-driven assembler (shotlist-v2 + stills/ + vo/) — what rendered the 5 videos                                                              | No aspect flag; inherits 16:9 from render.js                                                                                    |
| `apps/video/scripts/longform/assemble-longform.mjs` | Supabase-backed assembler (dashboard / cloud path)                                                                                            | Same — no aspect parameter                                                                                                      |
| Source stills (all 5 projects)                      | Native 16:9 (1376×768 / 1792×1008), prompts say "16:9 aspect ratio"                                                                           | No crop headroom — a 9:16 center crop keeps only ~56% of frame width                                                            |
| `content/shorts/`                                   | Scaffolding + tracker.csv with 15 hook lines                                                                                                  | Empty `src/` — no clips exist                                                                                                   |
| Cloud path                                          | `trigger-longform` edge fn → `longform.yml` dispatch → `assemble-longform.mjs`; `assemble_flags` input already passes arbitrary flags through | Nothing — flags flow for free once the assembler understands them                                                               |

**Key insight:** the motion engine's prescale step (`scale=…:force_original_aspect_ratio=increase,crop=CANVAS_W:CANVAS_H`)
already performs a cover-crop. Once the canvas is portrait, feeding it a 16:9 still
automatically center-crops to 9:16 — the reframe mechanism exists; only the
dimensions are frozen.

## 2. Design decisions

- **D1 — One render core, parameterized.** No forked "portrait renderer." `motion.js`
  and `render.js` gain a `format` (width/height) parameter with 1920×1080 defaults so
  every existing call site renders **byte-identical** output. 9:16 = 1080×1920@25fps.
- **D2 — Shorts are cut from existing projects, not new productions.** A short =
  a scene range from an existing project dir (stills + VO already exist), re-rendered
  portrait, with the tracker's hook line as an opening overlay. No new script writing,
  no new TTS.
- **D3 — Crop strategy: automatic center-crop + per-cut manual offset.** Default is
  the prescale cover-crop (center). For shots where centering decapitates the subject,
  a per-cut `crop_x` (0.0 = far left … 1.0 = far right, default 0.5) in the short's
  config shifts the crop window. No AI reframe/outpaint (Higgsfield out of scope).
  Accepted trade-off: effective source region is ~567×1008 → upscaled ~1.9× to
  1080×1920. Lanczos upscale of AI stills is acceptable for Shorts; if a hero shot
  looks soft, regenerate that one still natively 9:16 via the existing Google image
  workflow (same prompt + "9:16 aspect ratio, vertical") — per-still opt-in, not a phase.
- **D4 — Portrait-safe text geometry.** Shorts UI (YT/TikTok/Reels) overlays the
  bottom ~15% and right edge. Portrait constants: captions at `h*0.70` (not 0.80),
  caption fontsize ~64 (narrower frame), hero/hook fontsize ~72, all margins inside
  the middle 80% vertically.
- **D5 — Config-per-short, files-first.** Each short is defined by one small JSON
  file in `content/shorts/<video>/` (source dir, scene list, hook line,
  crop overrides, output name matching tracker.csv). Local/file path ships first;
  the DB/dashboard path reuses the same assembler change.

## 3. Implementation steps

### Phase A — Parameterize the render core (no behavior change at 16:9)

- [ ] **A1. `motion.js`:** replace module-constant canvas with derived values —
      `canvas = { w: round(width*1.5), h: round(height*1.5) }` computed inside
      `buildMotionFilter` from the (already-existing) `width`/`height` params.
      Update `prescale()`, `pan_lr`, `pan_rl`, `hold` to use the derived canvas.
      Keep exported `W`/`H`/`FPS` for callers.
- [ ] **A2. `motion.js` text constants:** make `CAPTION_Y`, `CAPTION_FONTSIZE`,
      `HERO_FONTSIZE`, `REVEAL_FONTSIZE` resolve from a `format` lookup
      (`landscape` defaults = today's values; `portrait` = D4 values). Thread through
      `buildDrawtext`/`buildHeroCard`/`buildCaptionAccent`/`buildStandaloneAccent`.
- [ ] **A3. `render.js`:** add optional `format = { width: 1920, height: 1080 }`
      to `buildCut`, `buildTextCard`, `buildStillsScene`, `buildLegacyStill`,
      `buildLegacyClip`; replace direct `W`/`H` usage; pass width/height into
      `buildMotionFilter`. Add `cropX` support: when `crop_x` present on a still,
      replace prescale's center crop x with the offset fraction.
- [ ] **A4. Regression check:** re-render one locked scene of `son-also-saves`
      with no flags and diff against the existing output (must be byte-identical or
      frame-identical) before touching anything else.

### Phase B — Shorts assembler (local path)

- [ ] **B1. Short config format:** `content/shorts/<video>/<clip-basename>.json`:
  ```json
  {
    "source": "content/longform/silenced-goalkeeper",
    "scenes": [14, 15, 16],
    "hook": "Germany hadn't lost a World Cup shootout in 50 years... until this.",
    "hook_amber": "until this",
    "crop": { "15": 0.35 },
    "output": "silenced-s1-tah-miss-EN.mp4"
  }
  ```
- [ ] **B2. New script `apps/video/scripts/longform/assemble-short.mjs`:** thin
      orchestrator — loads the short config, reuses `parseShotlistV2` + the source
      project's `stills/`, `vo/`, `captions.json` for just the listed scenes, calls
      `buildStillsScene` with `format: {width:1080, height:1920}`, prepends the hook
      overlay (hero-card drawtext, first ~3s, top third), concats, watermarks
      (same 80px recipe), writes to `content/shorts/<video>/src/<output>`.
      Flags: `--config <file>`, `--keep-tmp`, `--output` override.
- [ ] **B3. Duration guard:** warn if output > 60s (Shorts limit is 3min but the
      format targets <60s); print final duration + resolution in the run summary.

### Phase C — Scene selection & first clips (Silenced pilot)

- [ ] **C1.** Map Silenced's 3 tracker rows to scene ranges from its shotlist
      (peak = Tah miss sequence, reversal = disallowed goal, meaning = lineage section).
- [ ] **C2.** Write the 3 short configs; render locally; eyeball crop framing,
      adjust `crop_x` per cut where subjects are off-center.
- [ ] **C3.** Listen/watch QC → then repeat for the other 4 videos (12 configs).

### Phase D — Web interface / DB path

- [ ] **D1. `channels.js`:** add `short_form` entry to `football/documentary/EN`'s
      `formats` map (`aspectRatio: '9:16'`, `type: 'short_form'`) — data only, no branching.
- [ ] **D2. `assemble-longform.mjs`:** add `--aspect 16:9|9:16` flag mapped to the
      same `format` param (Phase A makes this a ~10-line change). The cloud workflow's
      existing `assemble_flags` input then carries `--aspect 9:16` with **zero workflow
      or edge-function changes**.
- [ ] **D3. Dashboard (minimal):** longform detail/workbench — show the project's
      aspect and pass it to the trigger call (`trigger-longform` body → `assemble_flags`).
      No schema migration needed for v1 (aspect travels as a flag, not a column);
      add a `content_items.aspect` column later only if Shorts become DB-managed projects.

### Phase E — Deployment & testing plan

**Local (test first, everything runs on this machine):**

1. `ffmpeg` already installed; no new deps (no Python, no new npm packages).
2. Phase A regression: re-render `son-also-saves` scene subset → compare.
3. Phase B/C: render Silenced's 3 shorts → review WAVs/MP4s in
   `content/shorts/silenced/src/`.
4. Commit source-of-truth artifacts: short configs + code. Rendered MP4s follow
   the existing convention (committed under `content/` like the long-form assets were).

**Web/cloud (after local passes):**

1. Push to `main` → Vercel auto-deploys dashboard (no env changes; anon key is
   committed by design).
2. GitHub Actions: no secret changes — `longform.yml` already has ffmpeg + checkout
   - R2 creds; `--aspect 9:16` arrives via the existing `assemble_flags` dispatch input.
3. Smoke test cloud path: dispatch `longform.yml` with `stage=assemble`,
   `assemble_flags=--aspect 9:16 --scenes <range>` against a DB-backed project
   (project 29 is the only DB-backed one) → confirm portrait MP4 lands in R2.
4. Dashboard smoke test on Vercel preview/prod: open longform detail, trigger an
   assemble with the aspect option, verify status round-trip.

**Verification checklist (per rendered short):**

- [ ] `ffprobe`: 1080×1920, 25fps, AAC 44.1kHz stereo, duration matches plan (<60s)
- [ ] Hook overlay visible in first 3s, inside top-third safe zone
- [ ] Captions sit at ~70% height — not obscured by Shorts UI chrome
- [ ] Watermark bottom-right, clear of platform UI
- [ ] No subject decapitation from the center crop (else set `crop_x`)

## 4. Effort/sequencing summary

| Phase                        | Size                                      | Depends on |
| ---------------------------- | ----------------------------------------- | ---------- |
| A — render core params       | ~half day, highest care (regression risk) | —          |
| B — shorts assembler         | ~half day                                 | A          |
| C — Silenced pilot (3 clips) | ~1–2h + QC                                | B          |
| D — DB/dashboard path        | ~2–3h                                     | A          |
| E — cloud smoke test         | ~1h                                       | D          |

Recommended order: A → B → C (ship the 3 Silenced shorts) → remaining 12 configs →
D/E only when Shorts need the dashboard/cloud path at all — the 15 tracker clips can
ship entirely from the local path.

## 5. Risks

- **Crop quality:** ~1.9× upscale from the cropped source region. Mitigation: D3
  per-still native 9:16 regeneration for hero shots only.
- **Byte-identical regression on locked renders:** Phase A must default every new
  param; A4's diff gate is mandatory before merging.
- **Caption collisions in portrait:** narrower frame means long caption chunks may
  overflow; `text-metrics.js` measuring already exists — clamp chunk width to 90%
  of frame width and re-wrap if needed (surface in C2 QC).
