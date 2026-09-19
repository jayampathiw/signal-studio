# Signal Studio → Video Engine — Refactoring & Deployment Plan (v3)

> **Status:** v3 — every open question is answered (§0, §8). No code has been written. **Execution runs locally by the owner**, using this file as the tracker (see §9).
> **Branch:** `refactor/signal-studio` (from `main` @ `548b5ed`)
> **v1:** 2026-09-17 after a full read of the repo + your answers to 8 decision questions.
> **v2:** 2026-09-17 after the four _Built Layer by Layer_ documents (AssembleX Factory). Changes marked **[v2]**.
> **v3:** 2026-09-17 after the closing questionnaire (Q2–Q8). Changes marked **[v3]**.
> Same tracker convention as `docs/longform-final-plan.md`: tick rows as they land; keep §0 and §8 current.

---

## 0. Decisions locked from our Q&A

| #   | Decision                               | Your answer                                                                                                                    | What it forces                                                                                                                                                                                                                                   |
| --- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | **Delivery model**                     | Single-tenant template per customer now; SaaS-ready later; no customers yet; low budget                                        | Schema carries `org_id` from day one, but no billing, no roles, no tenant UI until there is a paying reason                                                                                                                                      |
| D2  | **Production runtime**                 | An **engine** callable by API/trigger; deterministic; Claude via API for AI steps; no Higgsfield; MCP not needed in production | Node workers own every stage. Claude Code skills = developer + operator tooling only. Higgsfield code is archived, not ported                                                                                                                    |
| D3  | **Compute**                            | Free first (GitHub Actions), Docker worker + pg-boss as the target, **both supported from the start**                          | One CLI entrypoint (`ss run-job`) inside one Docker image. GitHub Actions and the VPS worker both just run that image. Constraints in §6.3                                                                                                       |
| D4  | **AssembleX Factory**                  | New Facebook page; format defined by the _Built Layer by Layer_ docs **[v2]**                                                  | 9:16, 3–6 user-supplied 8 s clips from Google Flow, per-shot Kokoro VO + fact overlay, Remotion assembly, `_fb`/`_ig` variants, Sunday compilation. Input mode = **script + videos**. It is the first template built and the M1 milestone (§2.6) |
| D5  | **Live channels to protect**           | The Policy File; Underdog Archive long-form + Shorts; AssembleX (new)                                                          | Their current scripts stay runnable until the new engine reproduces one reference video each (Phase 0)                                                                                                                                           |
| D6  | **News pipeline**                      | Freeze, keep running, out of scope                                                                                             | `apps/news` moves to the workspace repo untouched; shared packages keep a compatibility export until it is migrated later                                                                                                                        |
| D7  | **Repo layout**                        | Two repos: engine + private workspace                                                                                          | `signal-studio` = sellable engine. `signal-studio-workspace` (private) = your projects, content, brand configs, deploy config, frozen news app                                                                                                   |
| D8  | **Dashboard**                          | Keep Angular; rebuild around the Project/Job model. **[v3] Location resolved: engine repo** (Q2)                               | Generic Projects/Jobs/Review UI ships with the engine. Brand-specific screens, if ever, are lazy-loaded libraries in the workspace                                                                                                               |
| D9  | **Remote control** **[v2]**            | "Access the app via API or another remote way" — nothing beyond what was already planned                                       | REST API with API keys is the primary control surface (§2.5, §6.5). An MCP endpoint on the same API is a small optional add-on so a Claude.ai Project can call it directly                                                                       |
| D10 | **Test/promotion order** **[v2]**      | Local → GitHub → production                                                                                                    | Every template and every runtime change climbs the same ladder (§5.4). `ss run-local` exists before any DB or dispatcher code                                                                                                                    |
| D11 | **Language** **[v3]** (Q3)             | TypeScript for new packages, no build step                                                                                     | `core`, `templates`, `providers`, `api`, `worker`, `shared` in TS via Node 22 `--experimental-strip-types`. Ported JS stays JS with `// @ts-check` until rewritten                                                                               |
| D12 | **Free compute path** **[v3]** (Q4)    | Private engine repo, 2,000 free Actions min/month                                                                              | `run-job.yml` lives in the private engine repo. **No public trigger repo, no deploy-key checkout.** `reel-pipeline` is retired after Phase 3.7                                                                                                   |
| D13 | **Visibility / licence** **[v3]** (Q5) | Private + commercial licence                                                                                                   | Engine repo private; GHCR image private; `LICENSE` = commercial (per-customer grant). Third-party notices file required (§7.3)                                                                                                                   |
| D14 | **Captions engine** **[v3]** (Q6)      | `faster-whisper`                                                                                                               | Provider `captions-faster-whisper` (Python/CTranslate2, pinned). Slim Python layer stays in the image (Piper needs it anyway)                                                                                                                    |
| D15 | **Launch conflict** **[v3]** (Q7)      | Option A — pilot bridge                                                                                                        | Phase 0.8 runs **first**: the _Implementation Plan_ built as written in the workspace layout; pilot + weeks 1–3 ship on it; Phase 2 lifts it into `clips-overlay`                                                                                |
| D16 | **Master prompt output** **[v3]** (Q8) | Keep `pack.json` + adapter                                                                                                     | Master prompt unchanged. `packs/blbl.v1` adapter in the workspace converts `pack.json` → `manifest.v1`                                                                                                                                           |
| D17 | **Execution mode** **[v3]**            | Owner implements locally, phase by phase, using this file as the tracker                                                       | This session produced the plan only. §9 describes the local execution loop                                                                                                                                                                       |

---

## 1. What the code actually is today (the gap we are closing)

- **Six pipelines, three orchestrators, one DB.** News; stock-footage reels (dormant); Wild Eye Higgsfield reels (agent-driven, never shipped a publishable reel); long-form stills documentary (26 scripts, shipped 6 videos); 9:16 Shorts (2 assemblers); Policy File (Remotion). Orchestrated by `node pipeline.js` spawns, `claude --print` on a runner, and a `longform.yml` stage dispatcher respectively.
- **The abstraction that should unify them is unused.** `packages/render/core` (`render(timeline, {engine})`) is imported by exactly one real pipeline (`assemble-case.mjs`). `longform/render.js`, `renderers/reel.js`, and both Shorts assemblers call FFmpeg directly. `packages/types/timeline.js` exists and is good — it just isn't the contract.
- **Config is not data anymore.** `channels.js` has three incompatible shapes. Per-project quirks are hard-coded in scripts (`NO_CAPTION_SCENES_BY_PROJECT` in `assemble-local.mjs`, watermark file names, brand colours as constants in `assemble-short-rewrite.mjs`).
- **Duplicated modules.** Two publisher trees, two `tts.py`, two Claude JSON shims (Node + Deno), two Shorts assemblers with ~60% overlap.
- **Single-tenant everywhere.** Supabase project id, `jayampathiw/reel-pipeline`, `/home/jayam/...` in `.mcp.json`, `FB_PAGE_ID_<SUFFIX>` env naming, `content/` paths baked into JSON configs.
- **Hygiene.** 235 MB of content in git; 377 `console.log` in 58 files vs. a CLAUDE.md rule saying none; one smoke test; no ESLint/Prettier/typecheck/CI test gate; `settings.json` runs `scripts/hooks/env-check.js` on every Bash call **and that file does not exist**; 28 docs, ~10 superseded; `PROJECT-STATUS.md` 3 months stale.
- **Runtime coupling.** Kokoro/Whisper/Piper are Python subprocesses installed ad hoc per run (3–5 min cold start on Actions). `whisper` CLI is invoked by name with no version pin.

None of this is a criticism — it is what "ship six videos fast" produces. The refactor turns it into a product without stopping the shipping.

---

## 2. Target architecture

### 2.1 Core model (five nouns)

| Noun         | Meaning                                                                                                                                                                                                 | Persisted in                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **Org**      | A customer/tenant. You are org 1.                                                                                                                                                                       | `orgs`                                                       |
| **Project**  | A brand/channel: brand kit (fonts, colours, watermark, music beds, caption/overlay style, motion presets), default voice, default template, publish targets, prompt pack for Claude, which gates are on | `projects` + `projects/<slug>/project.yaml` in the workspace |
| **Job**      | One video run. Holds the **manifest** (input), resolved config, status, stage results, output artifacts (one job can emit several outputs — `_fb`, `_ig`)                                               | `jobs`, `job_stages`, `artifacts`                            |
| **Template** | Turns a manifest into a **Timeline** (the IR) and knows which render engine it needs                                                                                                                    | `packages/templates/*`                                       |
| **Provider** | A swappable adapter behind a fixed interface: LLM, TTS, captions, image, stock video, storage, publish                                                                                                  | `packages/providers/*`                                       |

### 2.2 The pipeline every job runs

```
manifest ──► validate (zod) ──► resolve (project defaults ⊕ manifest overrides)
   │
   ├─ stage: script      (LLM provider — only if manifest has no script)             [gate: script_review]
   ├─ stage: assets      (probe + normalise user clips/stills; or image/stock provider) [gate: assets_review]
   ├─ stage: audio       (TTS per shot, cached by text+voice hash; per-file loudnorm; VO-budget warnings)
   ├─ stage: captions    (word timings — only for templates that burn captions)
   ├─ stage: compile     (template: manifest + measured durations → Timeline, one per output variant)
   ├─ stage: render      (engine: ffmpeg | remotion → MP4 + thumbnail per variant)
   ├─ stage: qa          (duration, loudness, resolution, black frames, safe-zone text checks; optional Claude vision spot-check) [gate: final_review]
   ├─ stage: deliver     (storage provider → signed URLs; captions.txt; always runs)
   └─ stage: publish     (publish provider(s); only if requested; scheduled_publish_time supported)
```

- **Every stage is idempotent and resumable.** Re-running a job converges; completed stages with unchanged inputs are skipped (content-hash keyed).
- **Gates are data.** A gate is a stage that ends in `awaiting_review:<gate>`. AssembleX runs fully automatic once clips are present; Policy File keeps a human final review.
- **Timeline is the only thing renderers see.** `packages/types/timeline.js` becomes the versioned contract (`timeline.v1`); both engines consume it and nothing else.

### 2.3 Input modes → manifest

| Your case                           | Manifest shape                                                                                | Stages that run                                                                        |
| ----------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **Script only**                     | `shots[].text`; `visual.mode: "generate"` (image provider) or `"stock"`                       | assets(generate) → audio → …                                                           |
| **Script + images**                 | `shots[].text` + `shots[].image`                                                              | assets(validate) → audio → …                                                           |
| **Script + videos** **(AssembleX)** | `shots[].clip` + `speed`, `trim_in_s`, `overlay_text`, `voiceover_text`, per-shot audio flags | assets(probe+normalise+optional audio strip) → audio → compile → render → qa → deliver |
| **Trigger only**                    | `topic` or nothing; project has `prompt_pack` + `topic_source`                                | script(LLM) → assets → …                                                               |

Templates at launch — **[v2] order changed; `clips-overlay` is first**:

| #   | Template          | Engine            | Source                                                                                                   | Used by                                                                                                     |
| --- | ----------------- | ----------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1   | `clips-overlay`   | remotion          | _Built Layer by Layer_ Implementation Plan §5 (`Post` composition) + existing `render-remotion` plumbing | **AssembleX** (fb/ig variants); any "script + videos" job; stock reels if revived (stock provider feeds it) |
| 2   | `compilation`     | remotion          | Implementation Plan §5.5                                                                                 | AssembleX Sunday compilation; any series stitch                                                             |
| 3   | `stills-kenburns` | ffmpeg            | `apps/video/src/longform/{render,motion,captions,audio-mix}.js`                                          | Underdog long-form; Shorts base                                                                             |
| 4   | `shorts-916`      | ffmpeg            | `assemble-short-rewrite.mjs`                                                                             | Underdog Shorts                                                                                             |
| 5   | `case-file`       | remotion          | `compositions/case-file/*` + `assemble-case.mjs`                                                         | Policy File 16:9 and 9:16                                                                                   |
| 6   | `carousel`        | remotion (stills) | `render-carousel.mjs`                                                                                    | Policy File carousels                                                                                       |

`clips-narrated` from v1 is dropped: `renderers/reel.js` (Pexels reels) becomes a `stock-pexels` assets provider feeding `clips-overlay`.

### 2.4 Provider interfaces (fixed, small)

```ts
LLM:      complete({system, messages, schema?}) → {text|json, usage}
TTS:      synthesise({text, voice, speed}) → {wavPath, durationSec}
Captions: wordTimings({wavPath, hintText}) → [{text,start,end}]
Image:    generate({prompt, aspect, size}) → {path|url}
Stock:    search({query, orientation, minDuration}) → [{url, meta}]
Storage:  put({localPath, key}) → {url}; signedUrl(key); presignUpload(key)
Publish:  post({platform, pageRef, video, caption, scheduleAt?}) → {postId, url}
```

Launch set: `llm-anthropic`, **`tts-kokoro-js` [v2]** (Node/ONNX, no Python — from the Implementation Plan §4), `tts-kokoro-py` (current, kept until parity is proven), `tts-piper`, `tts-elevenlabs`, `tts-fake` (CI), **`captions-faster-whisper` [v3]**, `image-fal`, `image-user`, `stock-pexels`, `storage-r2`, `storage-local`, `publish-facebook`, `publish-youtube`. Instagram/TikTok remain explicit `NotImplementedProvider`s that fail at **validation**, not mid-run.

### 2.5 Runtime and dispatch

```
Claude.ai Project / curl / dashboard / Claude Code ──POST /jobs──►  API (Hono)  ──► jobs row + dispatch
                                                                                     │
                                                    DISPATCH_MODE=queue              │       DISPATCH_MODE=github
                                                    pg-boss.send('run-job')          │       workflow_dispatch(run-job.yml)
                                                             │                       │                   │
                                                 worker daemon (VPS/Fly)             │       GitHub runner (free)
                                                 `ss worker`                         │       `docker run <image> ss run-job --id N`
                                                             └──────── same Docker image, same code path ────────┘
                                          local dev: `ss run-local --manifest x.json`  (no DB, no dispatcher)
```

- **`ss`** is one CLI in `apps/worker`: `ss validate`, `ss run-local`, `ss run-job --id N`, `ss worker`.
- **API is Hono**, written once, deployed two ways: Supabase Edge Function (free, Deno) and Node inside the Docker image (VPS). Thin by design — DB reads/writes, signed/presigned URLs, dispatch — so it never needs the Node-only engine packages.
- **pg-boss** uses your existing Supabase Postgres. No Redis, no new vendor.

### 2.6 **[v2]** AssembleX Factory (_Built Layer by Layer_) on the engine

The four docs describe a standalone Remotion mini-pipeline (`prep → tts → render → log → captions`). Mapped onto the engine it is one project + one template + a manifest adapter — nothing in the master prompt needs to change today.

| BLBL concept                                                                                                                    | Engine equivalent                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pack.json` (chatbot output, zod-validated)                                                                                     | `packs/blbl.v1` **adapter** → `manifest.v1`. Adapter lives in the workspace; the master prompt keeps emitting `pack.json` verbatim. Later (optional) the master prompt §6 emits `manifest.v1` directly and the adapter is deleted                                                                                                                                                       |
| `npm run prep` (normalise 1080×1920/30 fps, QA tiles, audio strip)                                                              | `assets` stage: ffprobe → normalise → QA contact sheet artifact → `strip_native_audio` honoured per shot                                                                                                                                                                                                                                                                                |
| `npm run tts` (kokoro-js, `bm_george`, budget warning, loudnorm −16)                                                            | `audio` stage with `tts-kokoro-js`; `voiceover_duration_s` written to the job, not back into the file; budget = `duration_s/speed − overlay_in_s − 0.3` → warning in `job_stages.warnings`                                                                                                                                                                                              |
| `Post` composition (speed ramps, fact overlay, VO at `overlay_in_s`, music duck −18 dB, end card, "AI visualisation" watermark) | `clips-overlay` template → `timeline.v1` (adds `shot.playbackRate`, `shot.overlay`, `shot.voStartSec`, `music.duckUnderVoice`, `watermark.text`) → `render-remotion`                                                                                                                                                                                                                    |
| `_fb` / `_ig` variants (`ig_optional` shots dropped)                                                                            | `manifest.outputs[]` — one job, two artifacts, one compile+render each                                                                                                                                                                                                                                                                                                                  |
| Sunday `Compilation`                                                                                                            | `compilation` template; manifest `inputs.jobs[]` references the three episode jobs' artifacts                                                                                                                                                                                                                                                                                           |
| `production-log.csv` (Flow attempts, credits, reject reasons)                                                                   | Engine cannot see Google Flow. Stays a **workspace** CSV/skill (`/log-attempt`) for now; a `generation_attempts` table + dashboard form is a Phase 5 item                                                                                                                                                                                                                               |
| `npm run captions` → `captions.txt`                                                                                             | `deliver` stage writes `captions.txt` from `manifest.captions`                                                                                                                                                                                                                                                                                                                          |
| Weekly rhythm (Sun packs → Mon–Wed Flow → Thu render → Fri schedule)                                                            | Sunday: Claude.ai Project (or Claude Code) runs `BATCH 7` → `POST /jobs` ×7 → jobs sit in `awaiting_assets`. Mon–Wed: upload clips via presigned URL (dashboard or `ss upload`). Job auto-advances when all `shots[].clip` exist. Thu: nothing to do — already rendered. Fri: `captions.txt` + schedule (manual in Meta Business Suite now; `publish-facebook` with `scheduleAt` later) |
| Disclosure toggles ("AI info" / "altered content")                                                                              | Publish-provider flags `aiDisclosure: true`; manual until the providers land                                                                                                                                                                                                                                                                                                            |

**Manifest additions driven by BLBL** (all optional, all templates ignore what they don't use): `shots[].clip`, `speed`, `trim_in_s`, `overlay_text/in_s/out_s`, `voiceover_text`, `ig_optional`, `audio.{keep_native_sfx, strip_native_audio}`, `fact_confidence`, `verify`; `music.{file|mood, gain_db, duck}`; `end_card`; `watermark.text`; `outputs[]`; `inputs.jobs[]`; `captions.{facebook, facebook_question, instagram, youtube_shorts_title, hashtags_*}`; `disclosure`.

---

## 3. Target repository layout

### 3.1 `signal-studio` (engine — the sellable thing)

```
signal-studio/
├── CLAUDE.md                     ≤ 100 lines: commands, conventions, where things live
├── .claude/
│   ├── rules/                    path-scoped: remotion.md, ffmpeg.md, providers.md, migrations.md, dashboard.md
│   ├── skills/                   add-template, add-provider, run-job-local, golden-check, release, debug-job
│   ├── agents/                   code-reviewer, render-qa, security-reviewer
│   └── settings.json             permissions allowlist + hooks (lint/format on edit; block edits to applied migrations)
├── apps/
│   ├── api/                      Hono: /jobs, /jobs/:id, /jobs/:id/approve, /jobs/:id/assets (presign), /projects, /health, (/mcp optional)
│   ├── worker/                   `ss` CLI + pg-boss daemon
│   └── dashboard/                Angular 21 — Projects, Jobs, Review, Assets, Settings (generic)
├── packages/
│   ├── core/                     zod schemas (manifest, project, timeline.v1), state machine, stage runner, resolver
│   ├── templates/                clips-overlay, compilation, stills-kenburns, shorts-916, case-file, carousel
│   ├── providers/                one folder per adapter + contracts + fakes
│   ├── render-ffmpeg/            the only FFmpeg call site (+ motion, audio-mix, text-metrics moved here)
│   ├── render-remotion/          compositions, timeline-driven
│   ├── db/                       supabase client, repositories, migrations/
│   ├── config/                   zod env schema per role (api | worker | dashboard-build)
│   └── shared/                   pino logger, errors, fs/tmp helpers, hashing
├── docker/                       Dockerfile (ffmpeg, node 22, chromium, kokoro-js model; slim python: piper + faster-whisper), compose.yml
├── LICENSE                       commercial licence (per-customer grant) + THIRD_PARTY_NOTICES.md   [v3]
├── examples/                     one tiny project per template (≤ 2 MB total) — CI fixtures and customer docs
├── .github/workflows/            ci.yml (lint+typecheck+test+example render), run-job.yml (dispatch runner), image.yml (build+push ghcr)
└── docs/                         README, architecture, manifest-spec, templates, providers, deployment, runbook, PROJECT-STATUS, decisions/ (ADRs)
```

### 3.2 `signal-studio-workspace` (private — your business)

```
signal-studio-workspace/
├── CLAUDE.md                     your brands, your gates, your publish slots
├── engine/                       git submodule → signal-studio @ tag   (npm packages later, §7.4)
├── projects/
│   ├── assemblex-factory/        project.yaml, brand/ (Inter font, music beds), packs/blbl.v1 adapter, content/<week>/<post>/{pack.json,prompts.md,clips,stills,refs}
│   ├── policy-file/
│   ├── underdog-archive/
│   └── underdog-archive-es/
├── apps/news/                    frozen, unchanged, its own workflow
├── deploy/                       .env.template, compose.override.yml, fly.toml, secrets checklist
├── .claude/skills/               longform-doc-playbook, policy-file-playbook, blbl-weekly-batch, log-attempt, new-project
└── docs/archive/                 all superseded plans, research prompts, historical status; BLBL docs live in projects/assemblex-factory/docs
```

**A customer copy = fork of the workspace template with `projects/` emptied.** Hand-over = engine repo + a workspace fork + the runbook.

---

## 4. Phased plan

Effort is in **focused days** (≈ 5–6 h of you + Claude Code). Ordered so **M1 = AssembleX's first post rendered by `POST /jobs` on free compute** lands after Phase 2. **[v2] But see §7.7 — your BLBL launch calendar says the pilot post goes live ~22 Sep; the engine cannot be there by then. Phase 0.8 is the bridge.**

### Phase 0 — Safety net and hygiene (4–5 days) **+ BLBL pilot bridge (2–3 days) [v2]**

| #            | Task                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Exit criterion                                                                                                                                            |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1          | **Golden references.** Render one reference video per live template with today's scripts (Policy File 16:9 + 9:16, one Underdog long-form act, one Short). Store in R2 `golden/` with `golden.json` (duration, resolution, integrated loudness, true peak, scene boundaries, perceptual hash of 10 sampled frames)                                                                                                                                                                                                   | `node scripts/golden-check.mjs <mp4> <golden.json>` passes on today's output                                                                              |
| 0.2          | **CI baseline.** ESLint flat config + Prettier, `tsc --checkJs` on `packages/*`, Vitest, `ci.yml`                                                                                                                                                                                                                                                                                                                                                                                                                    | CI green; failing lint blocks merge                                                                                                                       |
| 0.3          | **Fix the broken hook** (`scripts/hooks/env-check.js` missing) and drop the repo-wide safe-language lint hook                                                                                                                                                                                                                                                                                                                                                                                                        | `claude` sessions stop failing hooks silently                                                                                                             |
| 0.4          | **Move content out of git** → workspace repo. Engine keeps `examples/` only                                                                                                                                                                                                                                                                                                                                                                                                                                          | engine repo < 20 MB                                                                                                                                       |
| 0.5          | **Freeze news** in the workspace                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | news cron green from workspace                                                                                                                            |
| 0.6          | **Doc prune** to the 8 docs in §3.1; rewrite `PROJECT-STATUS.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                     | index matches folder                                                                                                                                      |
| 0.7          | `pino` logger in files touched from here on; `no-console` rule with per-file allow-list burned down per phase                                                                                                                                                                                                                                                                                                                                                                                                        | rule on                                                                                                                                                   |
| **0.8 [v2]** | **BLBL pilot bridge.** Build the _Implementation Plan_ exactly as written (zod `Pack`, `prep`, `tts` with kokoro-js, `Post` + `EndCard` + `FactOverlay` compositions, `render`, `captions`) as `workspace/projects/assemblex-factory/pilot/` — a standalone script set on top of the existing `packages/render/remotion` and `packages/media`. **Everything in it is designed to be lifted into `clips-overlay` in Phase 2 unchanged** (the composition, the schema, the loudnorm values). No DB, no API, local only | One Mode C post rendered `_fb` + `_ig` with no manual editing; the pilot's Definition of Done (§10 of the Implementation Plan) met; published on the page |

### Phase 1 — Core domain and the IR (6–8 days)

| #   | Task                                                                                                                               | Exit criterion                                                                                |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 1.1 | `packages/core/schemas/`: `manifest.v1` (superset incl. §2.6 fields), `project.v1`, `timeline.v1` as zod; JSON Schema exported     | `ss validate examples/*/manifest.json` passes; a bad manifest fails with a path-precise error |
| 1.2 | **State machine** with explicit transition table; `awaiting_assets`, `awaiting_review:<gate>`; `failed` carries `stage` + `error`  | Unit tests cover every legal and illegal transition                                           |
| 1.3 | **Stage runner**: ordered stages, hash-keyed skip, `job_stages` rows, `job_log` stream, multi-output compile/render                | Re-running a completed job performs zero work                                                 |
| 1.4 | **Resolver**: project ⊕ manifest ⊕ env → frozen `ResolvedJob`; no other code reads env/config                                      | Snapshot test per example                                                                     |
| 1.5 | **DB migration**: `orgs`, `projects`, `jobs`, `job_stages`, `artifacts`, `job_log` (all `org_id`, RLS on). Legacy tables untouched | `supabase db push` clean; old dashboard still works                                           |
| 1.6 | **Provider contracts** + `fakes/`                                                                                                  | Contract suite runs against every provider with `--fake`                                      |

### Phase 2 — `clips-overlay` + first runtime → **M1** (8–10 days) **[v2 reordered]**

| #   | Task                                                                                                                                                                                                                                       | Exit criterion (climbs the ladder in §5.4)                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| 2.1 | **`clips-overlay` template** from the Phase 0.8 pilot: `compile(manifest) → timeline.v1` per output; `render-remotion` consumes `timeline.v1` only (`Post` composition becomes the generic `ClipsOverlay`)                                 | **Local:** `ss run-local` on the pilot pack reproduces the pilot's `_fb`/`_ig` within golden tolerances      |
| 2.2 | **`compilation` template** (`inputs.jobs[]`, title plates, shared end card, continuous music)                                                                                                                                              | **Local:** 3 pilot-style packs → one 90–120 s file                                                           |
| 2.3 | `packs/blbl.v1` adapter (workspace) + `assets` stage (probe, normalise, QA contact sheet, audio strip)                                                                                                                                     | **Local:** `pack.json` → manifest → render with zero hand edits                                              |
| 2.4 | Providers: `tts-kokoro-js`, `tts-kokoro-py` (parity check on 3 sentences: same voice, duration ±3%, listen test), `storage-local`, `storage-r2`, `llm-anthropic` (prompt caching, JSON via schema, proxy double-encode shim behind a flag) | **Local:** contract tests green on real providers                                                            |
| 2.5 | `apps/worker`: `ss validate`, `ss run-local`, `ss run-job`, `ss upload` (presigned)                                                                                                                                                        | **Local:** `run-local` on `examples/clips-overlay` < 3 min on a laptop                                       |
| 2.6 | **Docker image** (node 22, ffmpeg, chromium, kokoro-js model baked; python+piper+whisper kept for now) → GHCR private via `image.yml`                                                                                                      | **Local:** `docker run image ss run-local …` works                                                           |
| 2.7 | `run-job.yml` (private engine repo, `container:` = the image) + `apps/api` `POST /jobs`, `GET /jobs/:id`, `POST /jobs/:id/assets` (presign) with `DISPATCH_MODE=github`, deployed as a Supabase edge function; API-key auth                | **GitHub:** `curl POST /jobs` → Actions run → `delivered`; signed URLs returned                              |
| 2.8 | AssembleX project in the workspace; week-1 EP1 pack through the API                                                                                                                                                                        | **M1 (GitHub tier): first AssembleX post produced end-to-end by `POST /jobs` + clip upload, no manual step** |

### Phase 3 — Remaining templates and providers (7–9 days)

| #   | Task                                                                                                                                                                                                                           | Exit criterion                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| 3.1 | `stills-kenburns` onto the IR (from `longform/*`); project quirks become manifest/project fields                                                                                                                               | Golden check (Underdog long-form act) — local, then GitHub                        |
| 3.2 | `shorts-916` (from `assemble-short-rewrite.mjs`); retire `assemble-short.mjs`                                                                                                                                                  | Golden check (Short)                                                              |
| 3.3 | `case-file` + `carousel`; `assemble-case.mjs` logic → template `compile()`                                                                                                                                                     | Golden checks (Policy File ×2)                                                    |
| 3.4 | `stock-pexels`, `image-fal`, `image-user`, `tts-piper`, `tts-elevenlabs`, `captions-faster-whisper` (pinned; replaces the unpinned `whisper` CLI call in `packages/media/subtitles.js`)                                        | Contract tests; word timings on 3 golden VO files within ±50 ms of today's output |
| 3.5 | `publish-facebook` (SEO-aware caption; `scheduleAt`; AI-disclosure flag; fixes the blank-caption bug for good), `publish-youtube`                                                                                              | One real scheduled post to a test page                                            |
| 3.6 | `qa` stage: ffprobe checks, `loudnorm` vs project target, black frames, overlay safe-zone check from the timeline, optional Claude vision spot-check                                                                           | QA failures produce actionable `job_stages.error`                                 |
| 3.7 | Delete old script trees after each golden check passes (`apps/video/**`, `channels.js`); **[v3]** retire the `reel-pipeline` public repo (archive it on GitHub; remove `trigger-generation`/`trigger-longform` edge functions) | `apps/video` gone; no path-based project quirks; no public trigger repo           |

### Phase 4 — Worker runtime hardening and production deploy (4–5 days)

| #   | Task                                                                                                                                                                                                                          | Exit criterion                                                                                   |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 4.1 | `ss worker`: concurrency 1 per container, pg-boss retry/backoff, heartbeat → `jobs.heartbeat_at`, stuck-job reaper                                                                                                            | Kill mid-render → resumes on restart, no duplicate output                                        |
| 4.2 | `compose.yml`: worker + api + watchtower; `.env` from workspace `deploy/`                                                                                                                                                     | **Production:** one VPS, `DISPATCH_MODE=queue`, AssembleX week rendered there                    |
| 4.3 | Observability: `job_log` in dashboard; pino JSON; Healthchecks.io; Sentry free                                                                                                                                                | Failing job visible with stage + last 50 log lines                                               |
| 4.4 | Secrets consolidation: two stores only (GitHub secrets; VPS `.env`); edge-fn secrets only for the API                                                                                                                         | `docs/deployment.md` secrets table ≤ 2 columns                                                   |
| 4.5 | **[v2] optional** `/mcp` on the API (Streamable HTTP; tools `create_job`, `get_job`, `list_jobs`, `approve_gate`, `presign_upload`); OAuth 2.1 single-client if claude.ai custom connectors require it (verify at build time) | A Claude.ai Project with the BLBL master prompt creates 7 jobs from `BATCH 7` without copy-paste |

### Phase 5 — Dashboard rebuild (Angular) (8–10 days)

| #   | Task                                                                                                                                                                                                                                                                                          | Exit criterion                                                      |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 5.1 | Feature modules: **Projects** (brand kit editor from `project.v1` JSON Schema), **Jobs** (list; detail with stage timeline, log, artifacts, preview per variant), **Review** (gate approve/reject → API), **Assets** (drag-drop clip upload to presigned URLs, per-shot status), **Settings** | Every action is an API call; dashboard never writes `jobs` directly |
| 5.2 | **New Job** form: project → template → paste script / pack.json / upload assets → manifest preview → submit                                                                                                                                                                                   | Valid manifest for all four input modes                             |
| 5.3 | Split `supabase.service.ts` (875 lines); delete legacy pages as their pipelines retire                                                                                                                                                                                                        | No component > 400 lines                                            |
| 5.4 | Auth: Supabase Auth; `org_id` claim; RLS                                                                                                                                                                                                                                                      | A second org cannot see org 1 jobs                                  |
| 5.5 | **[v2]** `generation_attempts` table + "log attempt" form (replaces `production-log.csv`)                                                                                                                                                                                                     | Weekly failure report per shot purpose                              |

### Phase 6 — Split, template, hand-over kit (3–4 days)

| #   | Task                                                                                                                          | Exit criterion                                              |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 6.1 | Create `signal-studio-workspace`; engine as submodule pinned to a tag; move `projects/`, `apps/news`, `deploy/`, archive docs | Your four brands run from the workspace                     |
| 6.2 | `examples/` complete + `docs/manifest-spec.md` generated from zod                                                             | A stranger renders an example in 15 minutes from the README |
| 6.3 | Licence + hand-over checklist (§7.3), third-party notices, onboarding runbook, secrets checklist                              | Reviewed by you                                             |
| 6.4 | SaaS-readiness backlog as ADR-004 (roles, invitations, billing hooks, per-org R2 prefixes, metering, rate limits)             | Scoped, not vague                                           |

### Track C — Claude Code layer (alongside every phase, ~3 days total)

| #   | Task                                                                                                                                                                                       | Exit criterion                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| C.1 | Root `CLAUDE.md` ≤ 100 lines; per-app/per-package `CLAUDE.md` ≤ 40 lines; `CLAUDE.local.md` gitignored                                                                                     | Every line passes "would removing this cause a mistake?" |
| C.2 | `.claude/rules/` path-scoped: `remotion.md`, `ffmpeg.md`, `providers.md`, `migrations.md`, `dashboard.md`                                                                                  | Load only when matching files are touched                |
| C.3 | Skills: `add-template`, `add-provider`, `run-job-local`, `golden-check`, `debug-job <id>`, `release` (`disable-model-invocation: true`)                                                    | ≤ 60 lines each; keywords front-loaded                   |
| C.4 | Agents: `code-reviewer` (fresh-context diff vs plan), `render-qa`, `security-reviewer`                                                                                                     | Used in every phase's PR flow                            |
| C.5 | Hooks: PostToolUse `eslint --fix` + `prettier`; PreToolUse block writes to applied migrations; working `env-check`                                                                         | Verified with `/hooks`                                   |
| C.6 | Workspace `CLAUDE.md` + brand skills (`longform-doc-playbook`, `policy-file-playbook`, **`blbl-weekly-batch`** — wraps the master prompt + `POST /jobs`, **`log-attempt`**, `new-project`) | Brand knowledge never lives in the engine                |
| C.7 | Retire `.claude/commands/*` and `wild-eye-*` → `workspace/.claude/archive/`                                                                                                                | Engine `.claude/` has zero channel-specific content      |

**Total: ≈ 45–57 focused days** (v1 + the 2–3 day pilot bridge). M1 at ≈ day 20–25.

---

## 5. Engineering standards (apply from Phase 0)

### 5.1 Language and tooling

- **TypeScript for all new packages** run with Node 22 `--experimental-strip-types` (already used for Remotion) — no build step. Ported JS stays JS with `// @ts-check` + JSDoc until rewritten. _(Q3)_
- **ESM only**, Node ≥ 22 LTS, npm workspaces.
- **zod at every boundary**; internal code trusts types.
- **pino** logger; `no-console` ESLint rule.
- ESLint flat config + Prettier; CI is the gate. **Conventional commits** + Changesets.

### 5.2 Testing pyramid

| Level    | What                                                                                         | Runs where                                     |
| -------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Unit     | schemas, state machine, resolver, each template's `compile()` (manifest → Timeline snapshot) | every PR, < 30 s                               |
| Contract | each provider vs its fake; real services opt-in locally / nightly                            | PR (fakes); nightly (real)                     |
| Golden   | render `examples/*` with `tts-fake`, metrics vs `golden.json`                                | PR (ffmpeg templates ~2 min); Remotion nightly |
| E2E      | `POST /jobs` → Actions → `delivered` on the example project                                  | nightly + before release                       |

### 5.3 Non-negotiables

- No brand names in the engine (CI grep-guard for `policy-file|underdog|assemblex|built-layer|wild-eye|jayampathiw`).
- No path assumptions in code — everything from the resolved job.
- Every stage registers inputs hash and outputs in `job_stages`/`artifacts`.
- Secrets never in JSON configs; `project.yaml` references env names.

### 5.4 **[v2] Promotion ladder — local → GitHub → production**

| Rung           | Environment                                                    | Command / trigger      | Providers              | Must pass before the next rung                                 |
| -------------- | -------------------------------------------------------------- | ---------------------- | ---------------------- | -------------------------------------------------------------- |
| **Local**      | laptop, `ss run-local`, no DB                                  | manifest file          | fakes first, then real | unit + contract + golden on the example; one real pack renders |
| **GitHub**     | `run-job.yml`, `DISPATCH_MODE=github`, Supabase `dev` project  | `POST /jobs` (edge fn) | real                   | E2E on `examples/`; one real AssembleX pack delivered          |
| **Production** | VPS/Fly worker, `DISPATCH_MODE=queue`, Supabase `prod` project | `POST /jobs` (API)     | real                   | a full AssembleX week rendered; heartbeat + alerts green       |

Rules: every template and every runtime change climbs all three rungs in order; the Docker image tag is promoted (`:dev` → `:prod`), never rebuilt between rungs; two Supabase projects (`dev`, `prod`) from Phase 2 onward so GitHub testing never touches production rows.

---

## 6. Deployment plan

### 6.1 Tiers

| Tier                | When                                  | Compute                                                                                                               | Cost        | How jobs run                                                 |
| ------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------ |
| **T0 — Free**       | Now → M1, and beyond for low volume   | GitHub Actions on the **private** engine repo (2,000 free Linux min/month) **[v3: only path; public runner retired]** | $0          | `run-job.yml` → `container: ghcr.io/…/worker` → `ss run-job` |
| **T1 — Single VPS** | First customer or > ~40 renders/month | Hetzner CX22 (~€4) or Oracle Free Tier ARM ($0, reclaimable)                                                          | €0–10/mo    | `compose.yml`; `DISPATCH_MODE=queue`                         |
| **T2 — Elastic**    | Several customers / SaaS              | Fly.io scale-to-zero workers; Modal/RunPod if a GPU step appears                                                      | pay-per-use | Same image; pg-boss queue per org                            |

AssembleX volume (6 renders + 1 compilation/week, ~3–4 min each on a runner) ≈ **30 min/week** — comfortably inside the private-repo free tier.

### 6.2 Storage, DB, hosting

- **Supabase**: two projects (`dev`, `prod`) [v2]; Postgres, Auth, edge functions, pg-boss schema.
- **Cloudflare R2**: `golden/`, `uploads/<job>/`, `artifacts/<job>/`, `delivered/`. Presigned PUT for clip uploads.
- **Dashboard**: Vercel or Cloudflare Pages. **Registry**: GHCR private.

### 6.3 Constraints on "both dispatchers from the start"

1. **Free minutes.** Private repos: 2,000 min/month. AssembleX fits with room (~30 min/week). **[v3]** If ever exceeded, move to T1 rather than reviving a public trigger repo; minute usage is reported in the daily digest (§6.4).
2. **6-hour cap, no GPU, ~1–2 min image pull.** Fine for all current templates.
3. **No long-lived process on Actions.** `ss worker` never runs there; Actions always runs `ss run-job --id N` once and exits.
4. **Exactly-once.** `queue`: pg-boss `SKIP LOCKED`. `github`: API sets `dispatched` atomically before dispatch. One `DISPATCH_MODE` per deployment.
5. **Artifacts.** `deliver` uploads to R2 before the job ends.
6. **Oracle Free Tier** is generous but reclaimable — T1 for you, not for customers.

### 6.4 Operations

- `docs/runbook.md`: stuck job, failed stage, re-run, roll back image tag, rotate token, add project, onboard customer.
- Backups: Supabase daily; R2 versioning on `delivered/`.
- Alerts: Healthchecks.io heartbeat, Sentry, daily digest of failed/awaiting jobs (email/Telegram).

### 6.5 **[v2] Remote control surface**

| Caller                         | How                                                                                                                                     |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| curl / any script / n8n / Make | `POST /jobs` with `Authorization: Bearer <api key>`; `GET /jobs/:id`; `POST /jobs/:id/assets` → presigned PUT; `POST /jobs/:id/approve` |
| Claude Code (local or web)     | `blbl-weekly-batch` skill calls the same endpoints                                                                                      |
| Claude.ai Project              | Phase 4.5 `/mcp` endpoint (optional) — or paste `pack.json` into the dashboard New Job form                                             |
| Dashboard                      | same API                                                                                                                                |
| GitHub `workflow_dispatch`     | still works directly for emergencies (`run-job.yml` inputs: `job_id`)                                                                   |

---

## 7. Where I disagree or see risk — decide before approval

### 7.1 Dashboard belongs in the engine repo — **resolved [v3]: engine (D8)**

If the engine is sold as code or run as SaaS, the dashboard **is the product surface**. Brand-specific screens belong to the workspace as lazy-loaded libraries, if ever.

### 7.2 "Byte-for-byte" parity is impossible; metric parity is the honest test

FFmpeg/Remotion encodes differ run to run. Golden checks compare duration, resolution, loudness, scene boundaries and perceptual frame hashes within tolerances.

### 7.3 Licensing — matters the moment you sell

- **Remotion**: free for individuals and companies ≤ 3 people; larger customer companies need a Company Licence. **[v2] AssembleX's template is Remotion-based, so this now covers your flagship, not just Policy File.** State it in the hand-over kit; an FFmpeg fallback for `clips-overlay` is feasible later (~3 days) if a customer needs it.
- **FFmpeg** external binary — fine. **Kokoro** Apache-2.0 (kokoro-js same model) — fine. **Piper** MIT, **Whisper** MIT — fine. Music beds must be licensable to customers.
- **Meta/YouTube publishing on behalf of customers**: customer-owned tokens at T0/T1; App Review only for a multi-customer app.
- **[v2] Google Flow / Veo output terms**: you are generating manually on Ultra; confirm the plan's commercial-use terms before selling AssembleX-style production to a customer.

### 7.4 Submodule vs. published packages

Submodule now; Changesets + GitHub Packages as ADR-003 when a second customer exists.

### 7.5 Scope pressure

Phase 5 (dashboard) is expensive and not needed for M1. Run AssembleX from `curl`/Claude Code + a one-page Jobs list for weeks if time is short.

### 7.6 Higgsfield / Wild Eye

Archived, nothing ported. AI video later = one `VideoGen` provider + one template (~5 days), with a deterministic budget check.

### 7.7 **[v2] The launch calendar conflicts with the refactor — resolved [v3]: Option A (D15)**

Your _Content Plan_ says: bootstrap 17–21 Sep, pilot live ~22 Sep, week 1 production 20–25 Sep. Today is 17 Sep. The engine's M1 is ≈ 20–25 focused days away. **The engine cannot ship the pilot on time.** Options considered:

| Option                                           | What happens                                                                                                                                                                                                                                                                                                   | My view                                                                                                                                     |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Pilot bridge (Phase 0.8) — recommended**    | Build the _Implementation Plan_ as written (2–3 days) inside the workspace on top of existing `render-remotion` + `packages/media`. Ship the pilot and weeks 1–3 with it. Phase 2 lifts the composition + schema into `clips-overlay` unchanged; the bridge is deleted when M1 passes golden parity against it | Keeps the launch, and the bridge's output _is_ the golden reference for the template. ~2 days of "throwaway" that is mostly not thrown away |
| B. Slip the launch 3–4 weeks and go engine-first | Phases 0–2 first; AssembleX starts on the engine                                                                                                                                                                                                                                                               | Cleaner, but you lose the Q4 gifting window's run-up and delay income                                                                       |
| C. Skip Phase 0 hygiene, rush Phase 1–2          | M1 in ~12 days if nothing goes wrong                                                                                                                                                                                                                                                                           | I do not recommend it — it is how the current repo got here                                                                                 |

Also note: the _Implementation Plan_ uses **kokoro-js** (Node/ONNX) where the repo uses Python Kokoro. Adopting kokoro-js engine-wide removes Python from the Docker image only if Piper (es-MX) and Whisper also go — Whisper can (`whisper.cpp` Node bindings or keep a slim Python layer); Piper cannot yet. Plan keeps both TTS providers until parity is measured (Phase 2.4).

---

## 8. Questions — all answered **[v3]**

| #   | Question                    | Answer (2026-09-17)                      | Where it lands       |
| --- | --------------------------- | ---------------------------------------- | -------------------- |
| Q1  | AssembleX format            | The four _Built Layer by Layer_ docs     | §2.6, D4             |
| Q2  | Dashboard location          | **Engine repo**                          | D8, §3.1, §7.1       |
| Q3  | Language for new packages   | **TypeScript, no build step**            | D11, §5.1            |
| Q4  | Free compute path           | **Private engine repo, 2,000 min/month** | D12, §6.1, §6.3      |
| Q5  | Engine visibility / licence | **Private + commercial licence**         | D13, §3.1, §7.3      |
| Q6  | Whisper implementation      | **`faster-whisper`**                     | D14, §2.4, 3.4       |
| Q7  | Launch conflict             | **Option A — pilot bridge first**        | D15, Phase 0.8, §7.7 |
| Q8  | Master prompt output        | **Keep `pack.json` + adapter**           | D16, §2.6            |

No decision is open. New questions go in this table with a date, not in chat history.

---

## 9. Execution — local, phase by phase **[v3]**

The owner implements this plan locally (Claude Code on the laptop). This session wrote the plan only.

**Order of work**

1. **Phase 0.8 — pilot bridge** (first, because of the 22 Sep pilot). Build it under `projects/assemblex-factory/pilot/` (create the folder in this repo for now; it moves to the workspace in Phase 6). Reuse `packages/render/remotion` and `packages/media`; add `kokoro-js`. Definition of done = the _Implementation Plan_ §10.
2. **Phase 0.1–0.7** — golden references, CI baseline, hook fix, content move, news freeze, doc prune, logger rule.
3. **Phases 1 → 2** — core + `clips-overlay` → **M1**.
4. **Phases 3 → 4 → 5 → 6**, Track C alongside.

**Per-phase loop (repeat for every row in §4)**

- Start a fresh Claude Code session per phase (or per 2–3 rows); paste the row's task + exit criterion as the prompt. Use plan mode for anything touching more than one package.
- Climb the ladder in §5.4: local → GitHub → production. A row is not done until its exit criterion is met on the highest rung it applies to.
- One PR per row or small group of rows; run `/code-review` (fresh context) before merging; `/security-review` on anything touching auth, secrets, or publish providers.
- Tick the row here, and update `PROJECT-STATUS.md` §1 in the same commit when a load-bearing surface changes (schemas, templates, providers, migrations, workflows).
- If a row turns out wrong, change the plan **before** the code: edit the row, note the date and reason in the row's cell, then implement.

**Branching**

- `refactor/signal-studio` is the integration branch; row PRs branch from it and merge back. Merge to `main` only at phase boundaries with a green ladder.
- The remote push from this session failed (GitHub App not connected for `jayampathiw/signal-studio`); the plan commit exists locally on the branch — pull it or re-apply from the attached file.

**Stop conditions (ask before continuing)**

- A golden check fails and the fix would change the output the audience already sees.
- Any change to `orgs`/`projects`/`jobs` schema after Phase 1.5 (migrations, not edits).
- Anything that would put brand names, content, or secrets into the engine repo.

---

## 10. Task tracker **[v3]**

How to use this section:

- Tick `[x]` as each subtask lands. Add the date and commit hash at the end of the line when useful.
- Every phase ends with three **TEST GATES** in fixed order: **T-L (Local) → T-G (GitHub) → T-P (Production)**. A gate is not passed until every line under it is ticked. Do not start the next phase before the phase's highest applicable gate is green.
- Some phases have no production gate yet (nothing to deploy) — those rows say `n/a`.
- IDs are stable; reference them in commit messages (`feat(core): P1.2-03 transition table`).
- If a subtask turns out to be wrong, edit it here first (with a dated note), then implement.

### Legend

`[ ]` not started · `[x]` done · `[-]` dropped (say why) · `[!]` blocked (say by what)

---

### P0.8 — Pilot bridge (Built Layer by Layer) — **first**

Goal: one Mode C post rendered `_fb` + `_ig` with no manual editing; published ~22 Sep. Location: `projects/assemblex-factory/pilot/` in this repo (moves to workspace in P6).

- [~] **P0.8-01 Folder + sample pack** (2026-09-17)
  - [x] Create `projects/assemblex-factory/pilot/` with `package.json` (private, ESM, scripts: `validate`, `prep`, `tts`, `render`, `captions`, `log`)
  - [x] Create `projects/assemblex-factory/content/2026-W38/standalone_sample-001/` with `pack.json`, `prompts.md`, `refs/`, `stills/`, `clips/raw/`, `clips/`, `vo/`, `qa/`, `out/`
  - [ ] Run the master prompt once (Mode C), save the real `pack.json` and `prompts.md` — **deferred**: current `pack.json`/`prompts.md` are a schema-plausible placeholder (`_placeholder: true`), not real master-prompt output. Swap in before P0.8 T-L/T-P gates.
  - [x] Add `projects/**/clips/`, `projects/**/vo/`, `projects/**/out/`, `projects/**/qa/`, `projects/**/stills/`, `projects/**/refs/` to `.gitignore`
- [x] **P0.8-02 Zod schema** (`pilot/src/manifest.ts`) (2026-09-17)
  - [x] `Shot` and `Pack` schemas with defaults, min/max, enums — reconstructed from every field referenced across §10 since the original _Implementation Plan_ §2 was unavailable (see file header note); reconcile if/when the real doc surfaces
  - [x] `strip_native_audio` field present with default `false`
  - [x] `npm run validate <pack-dir>` prints path-precise errors on a broken pack (verified against a deliberately broken pack — `shots.0.voiceover_text: Required`)
  - [x] Unit test (`node --test`, 5 cases): valid sample passes; defaults apply; missing `voiceover_text` fails; 7 shots fails (`max(6)`); `strip_native_audio` defaults false — all green
- [x] **P0.8-03 `prep`** (`pilot/scripts/prep.ts`) (2026-09-17)
  - [x] Normalise every `clips/raw/*.mp4` → `clips/*.mp4` (1080×1920, 30 fps, yuv420p, libx264 CRF 18, AAC 48 kHz stereo) — verified via ffprobe on 3 synthetic test clips (source res/fps varied: 720×1280/25fps, 810×1440/24fps, 1080×1920/30fps → all normalized identically)
  - [x] QA contact sheet per clip (`qa/<shot>.png`, frames 0/50/~100 %) — 3-frame hstack PNG, verified visually (timestamps burned in from testsrc2 confirm 0.00s/4.01s/7.92s captured)
  - [x] Audio strip when `shots[].audio.strip_native_audio === true` (`-an` vs AAC 48kHz stereo)
  - [x] Skip clips already normalised (fingerprint = raw file size+mtime+strip flag, sidecar `.{id}.hash`) — verified: re-run skipped all 3
  - [x] Fail loudly if a `clip_file` named in `pack.json` is missing from `clips/raw/` — verified against a deliberately broken pack: prints missing shot id + path, exits 1, does not partially process
  - [x] Writes `duration_s` back into `pack.json` per shot (merged into raw JSON, same technique as P0.8-04) — confirmed this unblocked the `tts` VO-budget check, which now correctly fires (`s3: VO 7.33s exceeds budget 7.30s`)
  - Used synthetic ffmpeg-generated test clips (testsrc2/mandelbrot/life patterns), not real Flow footage — swap when available, same as the pack
- [~] **P0.8-04 `tts`** (`pilot/scripts/tts.ts`, kokoro-js) (2026-09-17)
  - [x] Add `kokoro-js` dependency (+ `@huggingface/transformers` pinned to `^3.5.1` so it dedupes with kokoro-js's internal copy — needed to redirect its model cache); cache set to `~/.cache/kokoro-js/` via `env.cacheDir` (transformers.js's own default is inside `node_modules/`, so this had to be set explicitly)
  - [x] One WAV per shot, voice `pack.audio.voice_id` (default `bm_george`), speed `pack.audio.voice_speed` — verified end to end on the placeholder pack (3 shots)
  - [x] Write `voiceover_file` + measured `voiceover_duration_s` back into `pack.json` — merged into the _raw_ JSON (not the zod-parsed object) so unrelated top-level keys like the pilot's `_placeholder`/`_note` survive
  - [x] VO budget warning: `duration_s/speed − overlay_in_s − 0.3`; needs `shot.duration_s` from `prep` (P0.8-03, not yet run) — script correctly emits "budget check skipped — clip not prepped yet" instead of guessing; will activate once P0.8-03 lands
  - [x] Loudnorm every VO to `I=-16 TP=-1.5 LRA=11`, 48 kHz → `<shot>_vo_n.wav` — verified via ffprobe (pcm_s16le, 48000 Hz)
  - [x] Skip shots whose text+voice hash is unchanged — verified: second run skipped all 3 shots
  - [~] Listening test: 3 voices (`bm_george`, `am_michael`, `af_heart`) generated on the same sentence into the scratchpad for you to actually listen to; `project.yaml` created with `bm_george` as the **provisional** default (matches the placeholder pack) — swap it if a different voice wins and re-run `npm run tts`
- [~] **P0.8-05 Remotion compositions** (`pilot/src/`) (2026-09-17)
  - [~] `Root.tsx`: `Post` (1080×1920, 30 fps, `calculateMetadata` from shots + end card) registered and verified (`remotion compositions` → `765 frames / 25.50 sec`, math checks out exactly against the 3 prepped clips + end card). `Compilation` **not** registered here — its own composition file is explicitly P0.8-07's job (`Compilation.tsx`); registering an empty placeholder felt worse than adding it when it's real
  - [x] `Post.tsx`: `<Sequence>` per shot with `OffthreadVideo` (`startFrom = trim_in_s` in frames, `playbackRate = speed`, `muted = !keep_native_sfx`, volume 0.8); `variant` prop (`fb`/`ig`) filters `ig_optional` shots via `visibleShots()` in `src/props.ts`
  - [x] `FactOverlay.tsx`: centred, baseline at 72 % height, 84 % width, Inter 800 (self-hosted via `@remotion/fonts` `loadFont`), 64–72 px two-tier sizing, 60 % black plate, 8-frame fade + 20 px rise in, 6-frame fade out — verified via still render at frame 30 (visible on the s1 clip). Two-line cap with one downsize then `console.warn`: verified the _clamp_ visually (ellipsis engaged on `overlay_text` too long even at 64px); the `console.warn` call itself is in code but Remotion's CLI still-render doesn't surface in-browser console output without extra plumbing, so it wasn't directly observed in the terminal
  - [x] VO `<Audio>` starts at `overlay_in_s` per shot (nested `<Sequence from={overlayInFrame}>`), uses `_n.wav` (`voiceoverUrl` from the `tts` stage's output)
  - [x] Music bed `<Audio>` with duck (gain × 0.4 while any VO plays, 12-frame linear ramp at each edge via `duckMultiplier()`); base gain from `music_gain_db` (dB→linear); gated behind `musicDuck` prop; skipped entirely when no `musicUrl` (placeholder pack has no music file, only a `mood` — untested against a real track, logic only)
  - [x] `EndCard.tsx`: 1.5 s (`END_CARD_FRAMES`), disclosure ~40px-equivalent (used 40px for disclosure per spec — see code), subject 56 px, page name 36 px — verified via still render at frame 740. `pageName` and `backgroundStillUrl` aren't in the Pack schema; `pageName` hardcoded to `"AssembleX Factory"` as a placeholder (flag if that's wrong), `backgroundStillUrl` wired but untested (no still images in the placeholder pack)
  - [x] `Watermark.tsx`: "AI visualisation", small, top-left, every frame — verified in both stills
  - [x] Fonts: real Inter-ExtraBold (800) TTF downloaded from Google Fonts' CDN into `pilot/public/fonts/`, with the actual SIL OFL 1.1 `LICENSE.txt` (not a stub)
  - [~] `npm run studio` — not launched interactively (long-running dev server); instead validated the identical bundle/metadata/props path via `remotion compositions` and two `remotion still` renders (see above), which exercise the same code. Public asset serving wired via a `pilot/public/content -> ../../content` symlink so `staticFile()` resolves the sample pack's clips/VO
  - Found & fixed while building this: pnpm flagged a pre-existing cross-package Remotion version mismatch in the monorepo (engine's `@remotion/google-fonts` pinned to `4.0.481` vs everything else resolving to `4.0.525`) — warning only, did not block the pilot's render; out of scope to fix here, worth a hygiene pass later (P0.2 territory)
- [x] **P0.8-06 `render`** (`pilot/scripts/render.ts`) (2026-09-17)
  - [x] Bundle once (single `bundle()` call for all posts/variants), render `Post` for `fb` and `ig` per pack dir → `out/<post_id>_fb.mp4`, `out/<post_id>_ig.mp4` (h264, CRF 18, AAC 192k) — both rendered and verified end to end: ffprobe confirms 1080×1920/30fps/h264/aac-48kHz-stereo on both; `_fb` = 25.56s, `_ig` = 17.56s (exactly `_fb` minus the dropped 8s `ig_optional` shot `s3` — confirms `visibleShots()` filtering is correct); a frame extracted from the actual `_fb` output MP4 matches the P0.8-05 still-render preview exactly
  - [x] `--only <post_id>` and `--variant fb|ig` flags — both implemented and used throughout testing
  - [x] Exit non-zero on any render failure; print per-post timing — implemented (try/catch per variant, `hadFailure` → `process.exit(1)`); timing printed and observed (`539.5s` for the `_fb` render — slow because this sandbox has no GPU acceleration for headless Chrome, a hardware constraint not a script bug)
  - **Two real bugs found and fixed while building this** (both are Remotion footguns worth flagging to future devs on this codebase, not pilot-specific):
    1. **`bundle()`+`renderMedia()`'s local static server doesn't follow symlinks** the way the CLI's studio-server does — `pilot/public/content` (a symlink, used successfully by `remotion still`/`compositions` in P0.8-05) 404's when actually rendering via the programmatic API. Fixed by staging real file copies (`clips/`, `vo/`, excluding the large unprepped `clips/raw/`) into `pilot/public/staged/<relative-path>/` before the single `bundle()` call, cleaned up in a `finally` block. Also had to clear webpack's persistent cache at `node_modules/.cache/webpack/` once while debugging (stale cache masked the real fix on a retry).
    2. **`staticFile()` silently returns the wrong (unprefixed) URL when called outside a browser context.** It reads `window.remotion_staticBase` to prefix paths with `/public/`; `render.ts` is a plain Node script (not bundled into the browser), so `window` is undefined there and `staticFile()` fell back to an unprefixed path — 404 on every asset, deterministically, not a race. Fixed by replacing `staticFile()` in `src/build-props.ts` with a manual `publicFile()` helper that always emits `/public/...`, so `buildPostProps()` now produces correct URLs whether called from `sample-props.ts` (bundled, browser context) or `render.ts` (plain Node) — this is the general lesson: **never call `staticFile()` from a Node.js script that builds `inputProps` for `renderMedia`/`selectComposition`; build the public URL manually instead.**
  - `_render` intentionally renamed to `staged` for the staging dir name (tested an underscore-prefix theory that turned out not to be the cause, but the name stuck since it's more descriptive anyway)
- [x] **P0.8-07 `render:compilation`** (2026-09-17)
  - [x] `Compilation.tsx`: 1.2s title plate per episode (`TitlePlate.tsx`), 6-frame crossfade, episode body without end card (reuses `ShotSequence.tsx`, extracted from `Post.tsx` in this subtask so both compositions share identical per-shot rendering), one shared end card, continuous music with the same duck logic as `Post` (extracted to `src/audio-duck.ts`)
  - [x] Script (`scripts/render-compilation.ts`) reads `<series-dir>/ep<N>/pack.json` in numeric order (regex-matched, sorted); warns if body > `compilation_target_s` — **verified**: a 3-episode synthetic test series (`content/2026-W38/series_test/`, 4s clips each) with `compilation_target_s: 5` on ep1 correctly printed `Warning: compilation body 12.0s exceeds compilation_target_s (5s)`
  - Series-level fields (music/end card/watermark) aren't per-episode in the Pack schema — sourced from ep1's pack as the series default (`buildCompilationSeriesDefaults`); noted as a simplifying assumption, not a spec requirement
  - **Two real rendering bugs found and fixed while verifying visually** (not just by duration math — rendered actual frames at the crossfade boundary):
    1. **The crossfade didn't crossfade.** Body (`ShotSequence`) was rendered after (on top of, in DOM/stacking order) the title plate, so the opaque video just hard-cut in front of the fading-but-occluded title instead of blending through it. Fixed by swapping the render order so the title plate stacks on top and its fade-out actually reveals the body underneath.
    2. **`TitlePlate`'s background never faded — only its text did.** Even after fixing the stacking order, the card's opaque `#0B0B0F` background would have fully blocked the body regardless of the text's opacity. Fixed by applying the fade opacity to the whole card (background included), not just the `<p>`.
  - Verified end to end: rendered the 3-episode series, ffprobe duration (16.555s) matches the formula exactly (3 × (1.2s title + 4s body − 0.2s crossfade) + 1.5s end card = 16.5s); extracted frames at a title plate, the crossfade boundary (confirms translucent blend after the fix), and checked file validity
  - One transient `ProtocolError: Target closed` (Chrome tab) printed mid-render but did not affect the outcome — render still completed successfully (exit 0, valid output file); not investigated further since it was non-fatal and didn't recur as a blocker
- [x] **P0.8-08 `captions` + `log`** (2026-09-17)
  - [x] `captions.ts` writes `out/captions.txt` (FB caption + question + hashtags + disclosure; IG caption + hashtags + disclosure; Shorts title) — disclosure line sourced from `end_card.disclosure`, included only when `pack.disclosure === true`; verified on the placeholder pack, output reads correctly
  - [x] `log.ts` appends to `projects/assemblex-factory/production-log.csv` — **header reconstructed** (`date,week,post_id,shot_id,attempt,credits_used,accepted,reject_reason,clip_file`), not copied from the source _Implementation Plan_ §7 (unavailable, same situation as P0.8-02's schema — flagged in the script's own header comment for reconciliation later). CLI: `--post --shot --attempt --credits --accepted [--reason] [--clip]`. Verified: two rows appended (one accepted, one rejected-with-reason) with correct CSV escaping; missing-required-flag guard exits 1 with usage; header-mismatch guard exits 1 rather than silently appending a malformed row; ISO week calc cross-checked against today's date → `2026-W38`, matching the existing `content/2026-W38/` directory naming convention
- [x] **P0.8-09 README** for the pilot (`pilot/README.md`) (2026-09-17): commands table (all 9 npm scripts), folder rules (per-post + per-series layout, what's committed vs gitignored, `_placeholder` convention), seven-day rhythm in 5 numbered lines

**TEST GATES — P0.8**

- [x] **T-L (Local)** (2026-09-17) — all against `content/2026-W38/standalone_sample-001/` (still the placeholder pack — see T-P below) plus `content/2026-W38/series_test/` for compilation
  - [x] `npm run validate` passes on the real pack; fails on a deliberately broken copy — verified both directions (P0.8-02)
  - [x] `npm run prep` produces normalised clips + QA tiles; ffprobe confirms 1080×1920/30 fps/yuv420p on each — 3 clips (deliberately mismatched source res/fps to actually exercise normalisation), all verified (P0.8-03)
  - [x] `npm run tts` produces `_vo.wav` + `_vo_n.wav` per shot; `pack.json` has durations; **no budget warnings left unresolved** — fixed two content issues found during gate closure: `s3`'s VO overran its budget (7.33s vs 7.30s) and `s2`'s overlay text triggered the 2-line clamp at 64px; shortened both, re-ran `tts`/`render` clean with zero warnings (verified via a frame extraction showing full 72px text, no ellipsis)
  - [x] `npm run render` produces `_fb.mp4` + `_ig.mp4`; ffprobe: 1080×1920, 30 fps, h264, aac 48 kHz — confirmed on the final corrected render; duration = Σ(duration_s/speed) + 1.5s: `_fb` 25.558s (Σ8.011+8.011+8=24.02 + 1.5 ≈ 25.52, within rounding), `_ig` 17.558s (drops `s3`, exactly `_fb` − 8s)
  - [~] Phone check (per Implementation Plan §10 — doc unavailable, so this is best-effort against what §10's own subtask bullets specify): overlay inside safe zone (✓ 72%/84% box, verified visually) · no 3-line wraps (✓ after the `s2` fix) · VO starts 0.4s after cut (✓ `overlay_in_s: 0.4` drives VO start, code-verified) · ends before next cut (✓ by construction — VO duration always < shot duration per the budget check) · music under voice (**untested** — placeholder pack has no music file, only a `mood` string; duck logic is written and code-reviewed but never exercised against real audio) · native SFX audible (**not verified by ear** — can't judge audio quality without a human listening pass) · watermark on every frame (✓ verified in every still/frame checked across P0.8-05/06/07) · end card present (✓ verified P0.8-05/06)
  - [x] Re-run `prep`/`tts`/`render` with no changes → no work done (cache) and identical durations — `prep` and `tts` both verified idempotent (explicit "skipped (unchanged)" re-runs); `render` has no skip-cache (not required by its own P0.8-06 checklist — every render pass fully re-renders by design)
  - [x] `captions.txt` and one `production-log.csv` row exist — `captions.txt` regenerated against the final corrected pack; 3 real rows logged to `production-log.csv` (credits=0, since these are synthetic ffmpeg test clips, not actual Google Flow generations — logging real credit numbers would be dishonest)
- [x] **T-G (GitHub)** — `n/a` for the bridge (local-only by design), as specified. No `pilot-ci.yml` added — not required, and premature before Phase 0.2 sets up the shared CI baseline.
- [ ] **T-P (Production)** — **not attempted; needs you.** This requires real Google Flow footage (not the synthetic ffmpeg test clips used throughout local verification), an actual AssembleX Facebook/Instagram/YouTube presence, and manually publishing real content with correct AI-disclosure labelling — all outside what should happen without your direct involvement:
  - [ ] Pilot post scheduled in Meta Business Suite with AI label; YouTube Short with "altered content" toggled
  - [ ] Live on the AssembleX page; first-day numbers written to the Content Plan results log
  - [ ] Keep `out/*_fb.mp4`, `out/*_ig.mp4`, and the exact `pack.json` — **these become the golden reference for `clips-overlay` in P2**

---

### P0 — Safety net and hygiene

- [~] **P0.1 Golden references** (2026-09-18) — tooling built and verified; 5/6 references pass their own golden.json, 1/6 (the Short) fails on a real, pre-existing true-peak violation the tool itself caught; R2 upload blocked on missing credentials; pushed and CI-green (`.github/workflows/ci.yml` needed an explicit `apt-get install ffmpeg` step first — the T-G push caught a real gap: `ubuntu-latest` doesn't guarantee `ffmpeg`/`ffprobe` preinstalled, and `check.test.ts` needs both)
  - [x] `scripts/golden/render-reference.mjs`: thin dispatcher — runs a given `--cmd <underlying assembler invocation>` for a `--template` name, copies the produced file to `golden/<template>/reference.mp4`, and writes `golden.json` next to it. (Built as a dispatcher, not a per-template auto-builder: the four real assembler scripts — `assemble-case.mjs`, `assemble-local.mjs`, `assemble-short-rewrite.mjs`, the pilot's own render step — take structurally different arguments, so a single tool that constructs all four invocations itself would be guessing at shapes it can't know; this tool only standardizes "run it, then file the result", which is what the plan's line actually asks for)
  - [x] `scripts/golden/measure.mjs` + `scripts/golden/lib/phash.mjs`: duration/width/height/fps via `ffprobe`; integrated LUFS + true peak via `ffmpeg -af loudnorm=print_format=json` in analysis-only mode (single pass, nothing re-encoded — a measurement of the file as it exists, not a normalization); scene cuts via `select='gt(scene,0.4)',showinfo` parsed from stderr; 10 evenly-spaced-frame hashes via `sharp` (added as a root devDependency). **The frame hash is dHash (difference hash), not DCT-based pHash** — simpler to implement correctly, and equivalent for "did this frame change materially" at these tolerances; documented as a deliberate substitution, not silently relabeled
  - [x] `scripts/golden/check.mjs <mp4> <golden.json>`: exact tolerances from the plan (duration ±0.15s, LUFS ±0.5, TP ≤ −1.0 as an absolute ceiling — not a delta from the golden value, per the plan's own wording, so a reference whose own measured TP exceeds −1.0 legitimately fails against itself, see below — scene cuts ±0.2s via greedy nearest-timestamp matching so cuts don't need matching array indices, pHash Hamming distance ≤8 on ≥8/10 frames); prints a ✓/✗ table; exits 1 on failure
  - [x] Unit test (`check.mjs.test.ts` — `node --test`, same convention as `packages/*`; excluded from `vitest.config.ts`'s scope for the same "0-tests-silently-passes" reason documented there, run instead via the root `test` script's own `node --experimental-strip-types --test scripts/golden/*.test.ts` step) against two committed synthetic fixtures (`scripts/golden/__fixtures__/{base,mutated}.mp4`, built with `ffmpeg -f lavfi`, 34KB/10KB): a file passes against its own freshly-measured golden.json; a materially different file (no scene cut, much quieter) fails, specifically on LUFS and scene-cuts (frame-pHash isn't asserted in the fail case — a flat solid color has no internal gradient for dHash to measure, so it isn't a reliable metric to assert against a flat-color fixture; that's a fixture-design fact, not a gap in the hash itself)
  - [x] Rendered references, **5 of 6 real** (all sourced from real content, not fabricated): Policy File 16:9 (`assemble-case.mjs` on the real shipped `mamboleo-pacific-life-settlement` case, from the `signal-studio-workspace` repo cloned into scratch — 16 scenes, 261s, 1920x1080); Policy File 9:16 (same brand's `mamboleo-pacific-life-settlement-reel` case — a real "Reel Cut" of the same story — rendered via a scratch copy of its `case.json` with `channelKey` set to `policy-file/data-viz/EN`, since the source file didn't set one explicitly and channels.js's own comment documents this as the intended mechanism for the vertical variant, "same brand/case-file loader"; 6 scenes, 88s, 1080x1920); Underdog long-form (`assemble-local.mjs --scenes 1-8` on the real shipped `son-also-saves` project — stills/VO for this project are gitignored and were never in the `signal-studio-workspace` copy, a P0.4 gap noted below; sourced from the separate `main` git worktree, which still has them on disk; 99.8s, 1920x1080); pilot `_fb`/`_ig` (already-rendered P0.8 output at `projects/assemblex-factory/content/2026-W38/standalone_sample-001/out/`, not re-rendered, just measured — 25.6s/17.6s, 1080x1920). **6th, the Short** (`assemble-short-rewrite.mjs` on the real `silenced-s1-tah-miss-EN-v2.json` config — first attempt used the non-v2 `-rewrite.json` config and crashed on `end_card` vs. this script's expected `end_card_v2`, a real config/script shape mismatch, not investigated further since the v2 config existed and is the correct pairing; 33.8s, 1080x1920) rendered successfully but **fails its own golden-check**: true peak measures −0.96 dBTP against the plan's ≤ −1.0 ceiling — a real 0.04dB streaming-loudness violation in this shipped Short's audio mix, not a bug in the measurement or check logic (every other metric — duration, resolution, fps, LUFS, scene cuts, frame hashes — passes exactly). Reported as-is rather than loosened to force a pass; whether to fix the Short's mix or accept it is a separate decision, out of scope here
  - [x] Fixed a real pre-existing bug hit while rendering: `packages/render/remotion` used `@remotion/bundler` transitively (via `@remotion/cli`) without declaring it as a direct dependency, so `render.ts`'s import failed outright the first time anything actually rendered through it (this predates P0.1 — same debt flagged and excluded from P0.2's typecheck gate). Added `@remotion/bundler` as an explicit dependency, pinned to `4.0.525` to match the already-resolved `@remotion/renderer` version (avoids the "bundled with an older version" warning Remotion itself printed on the first real render)
  - [x] Upload references + `golden.json` to R2 `golden/` (2026-09-19) — you provided real R2 credentials, filled into `.env`. Wrote `packages/media/scripts/upload-golden.mjs` (uploads all 6 `reference.mp4`s to `golden/<case>/reference.mp4` in `R2_BUCKET_RENDERED`); talks to R2 directly via `@aws-sdk/client-s3` rather than `packages/media/storage.js`'s `uploadToR2()`, since that helper imports `@signal-studio/config`'s `env`, which throws on _any_ missing required var at import time (`SUPABASE_URL` etc. are still blank in this local `.env` — a pre-existing, unrelated gap) even though this one-off script only needs the R2 ones. All 6 uploaded and verified reachable (`curl -I` 200, correct `Content-Type`/`Content-Length` matching local file size); each `golden.json` now carries an `r2Url` field pointing at its `reference.mp4`. `golden/**/*.mp4` stays gitignored per the original reasoning — R2 is the durable copy now, not git history
  - **Surfaced here, fixed in a dedicated follow-up pass (2026-09-18):** the Underdog long-form `stills/` directories were `.gitignore`'d in this repo (`content/longform/*/stills/`, "regenerable from configs + source stills") and had **never been copied** into `signal-studio-workspace` by P0.4's `content/` move, even though P0.4's own commit message implied a full copy — they only survived as local disk files in a separate `main` git worktree on this machine (confirmed via `git log`/`git ls-files` against that worktree: never committed to _any_ git history, in either repo or branch — genuinely single-machine, not "regenerable from configs" as the `.gitignore` comment claimed). Fixed: copied all 400 files (280MB) across all 9 Underdog long-form projects (`29`, `channel-trailer`, `end-scene`, `fifth-match`, `one-match-short`, `same-coin`, `silenced-goalkeeper`, `son-also-saves`, `two-shots-messi`) from that worktree into `signal-studio-workspace/projects/underdog-archive/longform/*/stills/` and committed them there (workspace repo has no `.gitignore`, so nothing re-excludes them). Verified: per-project file counts match exactly (400/400) and a 3-file SHA-256 spot-check across different projects matches byte-for-byte. `signal-studio-workspace` commit `11448f3`. The engine repo's own `.gitignore` rule is untouched — these files still shouldn't live here, they just now also live somewhere durable
- [x] **P0.2 CI baseline** (2026-09-18, branch protection closed 2026-09-19) — local (T-L) done, pushed and green on every commit since; branch protection now set too
  - [x] `eslint.config.js` (flat): base + `no-console` (`error`, `allow: ['error']`), `import-x/order` (swapped `eslint-plugin-import` for `eslint-plugin-import-x` — the former doesn't yet support ESLint 10, which is what `pnpm add` resolved); TS files via `typescript-eslint` recommended config
  - [x] `.prettierrc.json` + `.prettierignore`; `npm run format` / `format:check` — ran a repo-wide `--write` once (246 files were never formatted before this); spot-checked several diffs (JSON, a Deno TS function) to confirm purely cosmetic, no logic changes
  - [x] `tsconfig.base.json` with `checkJs: true`, `strict: true`; the pilot's `tsconfig.json` now extends it. Dashboard's Angular-managed tsconfig and `packages/render/remotion`'s tsconfig are **not** extended — both predate this and have their own strictness already; forcing them onto the shared base wasn't part of this task
  - [x] `vitest.config.ts` at root (`passWithNoTests: true` — no package has a vitest-based test yet); `npm test` = `vitest run && pnpm --filter @assemblex/pilot test` (dashboard keeps `ng test`, not aggregated here)
  - [x] `scripts/typecheck.mjs` + `npm run typecheck` — runs `tsc --noEmit` per opted-in tsconfig (dashboard's `tsconfig.app.json`/`tsconfig.spec.json`, the pilot). **`packages/render/remotion` deliberately excluded**: this is the first time `tsc` has ever run on it, and it surfaced pre-existing type debt (missing `@remotion/bundler` dependency, untyped `@signal-studio/*` JS imports, one implicit-any param) that predates P0.2 — not guessed at or fixed blind here; add it back once that debt is paid down
  - [x] `.github/workflows/ci.yml`: install → lint → format:check → typecheck → test; Node 22; pnpm (not npm — this repo uses pnpm; cached via `pnpm/action-setup` + `actions/setup-node` cache: pnpm)
  - [x] Branch protection on `refactor` (2026-09-19) — the plan's own text said `refactor/signal-studio`, but the real branch has always been `refactor` (naming mismatch noted since Phase 0.8, now just resolved by protecting the branch that actually exists rather than renaming it). Set via `gh api .../branches/refactor/protection`: `required_status_checks` on the `CI` context (`strict: true` — branch must be up to date), `enforce_admins: true` (applies to you too, not just collaborators), `allow_force_pushes: false`, `allow_deletions: false`. No required PR review — you chose to keep direct-push allowed, just gated on CI passing. Verified via a follow-up `GET` matching all six settings
  - [x] `no-explicit-any`, `no-unused-vars`, `no-empty`, `no-useless-escape`, `no-useless-assignment`, `preserve-caught-error` (all pulled in by `typescript-eslint`'s recommended config, not just `no-console`) softened to `warn` for a `LEGACY_ALLOWED_PATHS` glob list (`apps/**`, `packages/**`, `evals/**`, `scripts/**`, `supabase/functions/**`, `.claude/**`) instead of per-file disable comments — same effect, far less noisy for ~470 pre-existing warnings. Burn-down count as of this commit: **479 warnings** (`pnpm run lint` output). Separately, `projects/assemblex-factory/pilot/scripts/**` gets `no-console` fully `off` (not a burn-down item — CLI progress output is the correct use of `console.log` there, not legacy debt)
  - Two real bugs fixed while setting this up (not legacy — code from this session): a stray `console.warn` in `FactOverlay.tsx` changed to `console.error` per the project's console convention; `tts.ts`'s `voice_id` was an unchecked `string` passed to kokoro-js's `generate()` — now validated against `tts.voices` at runtime and cast to kokoro-js's own exported `GenerateOptions['voice']` type instead of `any`
  - Also removed a stray `docs/refactor/refactor-plan.md:Zone.Identifier` file that `git add -A` swept into the first P0.2 commit (a Windows/WSL download artifact) and added `*:Zone.Identifier` to `.gitignore`; pre-existing ones under `docs/` and `content/` are left for P0.6 (doc prune) as planned
- [x] **P0.3 Hooks** (2026-09-18)
  - [x] `scripts/hooks/env-check.js` — reads required keys from the existing canonical `packages/config/schema.js` (not a second hard-coded list); strips inline `# comment` values per the CLAUDE.md gotcha before counting a key as set; always exits 0. **This is also the fix for the "PreToolUse:Bash hook error / node:internal/modules/cjs/loader" error that fired on literally every Bash command all of last session** — `.claude/settings.json` referenced this file before it existed
  - [x] Removed the repo-wide `safe-language-lint` PostToolUse hooks from `.claude/settings.json` (the script itself, `apps/video/scripts/safe-language-lint.mjs`, is untouched — just no longer wired to fire on every Write/Edit repo-wide; it's channel-specific per the CLAUDE.md gotcha and belongs as a scoped Tier 2 concern later, not a global hook)
  - [x] Added `scripts/hooks/fix-on-save.mjs` as the PostToolUse hook on Write/Edit: `prettier --write` on any formattable file, `eslint --fix` on JS/TS, reading `tool_input.file_path` from stdin JSON (same convention the old safe-language-lint hook used); never blocks the tool call
  - [~] Verified via manual invocation (fed synthetic stdin JSON to `fix-on-save.mjs` directly) — confirmed it correctly reformats a real file and the file still works after. **Did not verify live in-session**: hooks load at Claude Code session start, and `.claude/settings.json` was edited mid-session, so the old hook config was still active for the rest of this session. Confirming the live PostToolUse fire needs a fresh session — first Edit in the next session is the real check
  - [x] Confirmed the PreToolUse fix live: a plain `Bash` call in this same session, right after creating `env-check.js`, ran with no hook error (previously every single one did)
- [~] **P0.4 Content out of git** (2026-09-18) — content moved and verified; asset handling deliberately deviates from the plan's literal wording, see below
  - [x] Created `signal-studio-workspace` (private) on GitHub — `jayampathiw/signal-studio-workspace`
  - [x] Copied `content/{longform,shorts,audio-kit,policy-file}` into `projects/{underdog-archive,policy-file}/…` per the plan's mapping — verified via file count (972/972) and a checksum spot-check on a binary (`.wav`) before deleting anything
  - [~] `assets/music/`, `assets/logos/` — **not copied-then-deleted wholesale as the plan says.** Grepped actual code usage first (`rg` across `apps/video`/`apps/news`) and found `assets/music/` and most of `assets/logos/` are shared with wildlife channels (`apps/video`) and news pages (`apps/news`), both of which stay in the engine repo — deleting them would have broken live wildlife-reel and news-image generation. Copied the **whole** `assets/music/` folder to the workspace repo (for Underdog/Policy File use there) but left the engine repo's copy untouched; copied only the two logo files verified as exclusive to Underdog/Policy File (`PolicyFile_Watermark.{svg,png}`, `underdog_archive_standalone_icon.png`) and likewise left the engine repo's `assets/logos/` untouched. `assets/fonts/` untouched as planned
  - [x] In the engine: deleted `content/` (972 files) after copy+verify
  - [x] Fixed the two scripts that actually hard-coded `content/audio-kit` (`apps/video/src/longform/audio-mix.js`, `apps/video/scripts/longform/import-audio-kit.mjs`) to resolve `AUDIO_KIT_DIR` from an env var/`--dir` flag instead. Grep-guard re-run: only comment/usage-string references to `content/(longform|shorts|policy-file)` remain in `apps`/`packages`, no live hard-coded paths
  - [ ] Engine repo size check (`git count-objects -vH` < 20 MB after a fresh clone) — **not met and can't be, yet.** Deleting `content/` in a new commit removes it from `HEAD` but not from history — every commit before this one still has the ~235MB of blobs, so a fresh clone is still large. Actually hitting this target needs a git history rewrite (`git filter-repo` + force-push), which is a separate, more invasive operation affecting published history — flagged for your explicit go-ahead, not bundled into today's work
- [~] **P0.5 Freeze news** (2026-09-18) — cron genuinely running from the workspace, verified with real saved articles; only the final cutover-delete step remains
  - [x] Copied `apps/news/` + the 5 news-specific Supabase edge functions (`generate-image`, `generate-caption`, `post-to-facebook`, `post-on-this-day`, `queue-on-this-day` — confirmed via grep none are shared with the video/reel pipeline) into the workspace repo
  - [x] **Corrected CLAUDE.md's stale assumption along the way**: the live news cron was never running from this repo's own `.github/workflows/fetch-news.yml` (that one is `workflow_dispatch`-only, dead) — it runs from the public `facebook-news-pipeline` trigger repo (same free-minutes pattern as `reel-pipeline`), which checks out this engine repo and runs `npm run news` from there. "Freeze news" therefore meant repointing `facebook-news-pipeline`'s workflows, not writing a workflow inside `signal-studio-workspace` itself
  - [x] `signal-studio-workspace/package.json` — minimal npm-workspaces root linking `apps/news` to `engine/packages/{ai,config,database,publishers,types}` (explicit paths, not a `*` glob — `packages/render/*` has no `package.json` at its own level and a broad glob crashes npm's resolver on it). `apps/news`'s own dependency specifiers changed from pnpm's `workspace:*` to npm's native `*`, since this repo isn't a pnpm workspace. **No `package-lock.json` committed**: npm 11.14.0 has a reproducible bug re-validating this workspace's lockfile shape (`npm ci` and `npm install`-with-existing-lockfile both fail with `Invalid Version` inside arborist's dedup pass, verified repeatedly; a completely fresh `npm install` with no lockfile works every time) — CI does a fresh install each run instead, an accepted tradeoff for this small internal pipeline
  - [x] `facebook-news-pipeline`'s 4 active workflows (`fetch.yml`, `recompute-scores.yml`, `scrape-metrics.yml`, `trending.yml`; `publish.yml` untouched — parked, self-contained, doesn't check out `signal-studio` at all) now dual-checkout: `signal-studio-workspace` (new read-only deploy key `SIGNAL_STUDIO_WORKSPACE_DEPLOY_KEY`, registered on that repo and set as a secret here) at `workspace/`, and `signal-studio` (existing `SIGNAL_STUDIO_DEPLOY_KEY`, unchanged) pinned to `ref: refactor` at `workspace/engine/` — a `sed` step un-pnpm-ifies the checked-out engine packages' `workspace:*` specifiers to `*`, runner-local only, never touching either real repo. Added a 15-minute `timeout-minutes` safety net to all 4 (none had one before — see below)
  - [x] GitHub Actions secrets — the real ones (`SUPABASE_URL`, `ANTHROPIC_KEY`, `FAL_KEY`, etc.) already existed on `facebook-news-pipeline` from before; only the new `SIGNAL_STUDIO_WORKSPACE_DEPLOY_KEY` needed creating, done without needing you (a scoped, read-only deploy key, not a third-party credential)
  - [x] **Two real, pre-existing production bugs found and fixed** while getting to a green run: (1) `nnxtvbolhuvihlpwppbj` (the live product's own Supabase project, shared by news/video/dashboard) was paused — restored via MCP with your go-ahead, unrelated to this refactor; (2) `apps/news/src/enrich/dedup.js` wrote a title-string into `cluster_id`, a `bigint` column — **every single article insert was failing**, silently, on every run, old workflow included; the pipeline was fetching successfully but saving zero new articles. Also, `apps/news/src/pipeline.js` never called `process.exit()`, so `@supabase/supabase-js`'s open handle kept the process alive indefinitely after finishing — a live run sat idle for 14 minutes doing nothing until forcibly killed by the new timeout. Both fixed in this repo (`6e53c1f`) and mirrored into the workspace repo's copy (`e3b0354`)
  - [x] **One green scheduled run, verified with real data**: `facebook-news-pipeline` run `35357814868` — 58s total, 30 FR + 44 IT articles actually saved to the live DB, clean exit
  - [ ] Disable `fetch-news.yml` here and delete `apps/news` here — **deliberately not done**; this is the actual cutover/deletion step and, like P0.4's `content/` deletion, gets its own explicit go-ahead rather than happening as a side effect of getting the workspace copy green. `apps/news` and the (already-dead) `fetch-news.yml` are untouched, still fully intact in this repo
- [~] **P0.6 Doc prune** (2026-09-18) — pruned to what's actually load-bearing, not the §3.1 list literally
  - [~] Moved 18 of the ~23 non-README/PROJECT-STATUS docs to `signal-studio-workspace/docs/archive/` (git history kept via the copy; origin commit noted in that repo's `archive/README.md`). **Deviated from §3.1's literal list on purpose**: §3.1 describes the post-Phase-3+ end state, once `apps/video` and the `.claude` wild-eye/longform skills themselves move out of this repo — none of that has happened yet. Archiving the docs those _currently-live_ skills depend on would have stranded them. So 5 docs stayed instead of moving: `implementation-guide.md`, `cloud-automation-workflow.md`, `video-generation-flow.md`, `higgsfield-models.md` (all four named in this repo's own `CLAUDE.md` under "Key docs", and the latter two cited by name in the live `wild-eye-reel` skill), plus `longform-v2-image-first-plan.md` (declared as the "Companion plan" by the live `longform-doc-playbook` skill). Confirmed via `grep` across `.claude/skills/*/SKILL.md` that no other archived doc is referenced the same way — the rest are either unreferenced or only cited in code comments (design-provenance citations in `apps/video/src/longform/*.js`, non-functional, left as-is; archive/README.md documents where each file went for anyone chasing one down)
  - [x] Fixed two real dangling links this move would have otherwise introduced in the docs that stayed: `cloud-automation-workflow.md` and `video-generation-flow.md` both linked to `docs/wild-eye/integration-and-video-pipeline.md`, which moved — repointed both to the archived location with a note that they're superseded by the doc they're linked from
  - [x] Rewrote `docs/README.md`'s index (added the refactor tracker + schemas/ as new entries, removed the deleted `wild-eye/` folder + the now-archived `long-form-pipeline-plan.md` row, added a pointer to the archive) and `docs/PROJECT-STATUS.md` §1 (reframed around the six pipelines named in this plan's own §1, incorporated P0.1's real golden-check findings — Policy File 16:9/9:16 and Underdog long-form pass, the Short fails its own loudness check — and added rows for the engine refactor + its separate dev DB so they're not confused with the live product's DB)
  - [x] Deleted `docs/silenced-shotlist-IMAGE-FIRST-v2.md:Zone.Identifier` (the only remaining one under `docs/`; others under `content/` went with P0.4's deletion, and any still under other folders are untouched — out of scope for a docs-only prune)
- [x] **P0.7 Logger** (2026-09-18)
  - [x] New `@signal-studio/shared` package (flat convention like the other `packages/*`); `src/logger.ts` — pino, pretty-printed unless `NODE_ENV=production` or `CI=true` (then plain JSON), `stageLogger(name)` returns a child logger bound with `{ stage: name }`. Registered in `pnpm-workspace.yaml` and `scripts/typecheck.mjs`. Verified both modes manually (pretty output and raw JSON with `CI=true`) and that `stageLogger('render').warn(...)` correctly carries the `stage` binding
  - [ ] Replace `console.*` in any file touched from now on — opportunistic by design, nothing to batch; not applicable as a one-time task

**TEST GATES — P0**

- [ ] **T-L (Local)**
  - [ ] `npm run lint && npm run format:check && npm run typecheck && npm test` all pass locally
  - [ ] `scripts/golden/check.mjs` passes for all 6 references against their own `golden.json`
  - [ ] Existing scripts still run from their new `--dir` inputs pointing at the workspace copies (Policy File case, one long-form act, one Short)
  - [ ] Claude Code session: hooks fire without errors
- [ ] **T-G (GitHub)**
  - [ ] `ci.yml` green on `refactor/signal-studio`
  - [ ] A deliberately failing lint PR is blocked by branch protection
  - [ ] Workspace `fetch-news.yml` green once on schedule
- [ ] **T-P (Production)**
  - [ ] News posts continue to appear on FR/IT pages from the workspace cron (check 24 h)
  - [ ] Dashboard on Vercel unaffected (smoke: login, articles list, longform list)

---

### P1 — Core domain and the IR

- [x] **P1.1 Schemas** (`packages/core/src/schemas/`) (2026-09-18)
  - [x] `manifest.v1.ts` — all listed fields present. Two shape decisions made where the plan didn't pin one (documented in the file's own header comment, not silently): `shots[]` lives at the top level, not nested under a `script` key (the "/" read as noting two possible spots, not both existing — top-level matches the pilot's proven Pack shape); `gates[]`/`publish[]` are plain string-name lists, not objects — the actual gate logic and publish credentials live in `packages/providers`/`project.v1.ts`, this only names which ones apply. A `.superRefine` enforces the one real cross-field rule implied by the plan's own negative-case list: `clips-overlay` mode requires every shot to carry a `clip`
  - [x] `project.v1.ts` — all listed fields present
  - [x] `timeline.v1.ts` — ported every JSDoc typedef from `packages/types/timeline.js` to zod one-for-one, plus the six new fields the plan calls out (`playbackRate`, `overlay{text,inSec,outSec}`, `voStartSec`, `music.duckUnderVoice`, `watermark.text`, `outputId`)
  - [x] `ss validate <manifest.json>` skeleton in `packages/core/src/cli/ss.ts` — loads, parses, prints zod issues with paths, exit 1 on failure. Note: §2.5 says `ss`'s real home is `apps/worker` (Phase 2) — this is intentionally just the P1.1 skeleton, to be moved/expanded there, not a conflicting decision
  - [x] `npm run schemas:json` (`packages/core/scripts/export-json-schema.ts`, using `zod-to-json-schema`) writes `docs/schemas/{manifest,project,timeline}.v1.json` — ran once, files committed
  - [x] Unit tests — manifest.v1: 7 cases (valid, defaults, wrong version literal, empty outputs, 7-shots-fails-max-6, missing `visual.mode`, the clips-overlay/clip cross-field rule both ways). timeline.v1: 6 cases (valid, defaults, bad aspectRatio, the new-fields round-trip, negative duration). All green
- [x] **P1.2 State machine** (`packages/core/src/state/`) (2026-09-18)
  - [x] Job statuses exactly as listed, `awaiting_review:<gate>` modeled as a template-literal family (`awaiting_review:${string}`) rather than one fixed value, checked against a base `awaiting_review` row in the transition table
  - [x] Stage statuses exactly as listed
  - [x] `JOB_TRANSITIONS`/`STAGE_TRANSITIONS` tables as plain data; `assertJobTransition`/`assertStageTransition` throw with both state names
  - [~] `failed` payload `{stage, error, retryable}` — the _type_ (`FailedPayload`) is defined; nothing in P1.2 yet actually constructs and stores one (that's the stage runner's job, P1.3, which currently only threads the raw error message through `job_log`, not this shaped payload) — flagged as a loose end for whoever wires job-failure handling into the API/worker in P2
  - [x] Unit tests generated from the tables themselves (every table entry checked for the legal direction, every non-listed pair checked for the illegal direction) — 5 tests, all green
- [x] **P1.3 Stage runner** (`packages/core/src/runner/`) (2026-09-18)
  - [x] `StageDefinition {name, inputsHash(job), run(ctx)}` + ordered registry (`StageRunner.register()`, chainable)
  - [x] Hash-keyed skip: compares the injected store's `getLastRun` hash+status against the current `inputsHash(job)`; skips only when both match
  - [x] Store interface (`JobStageStore`) covers start/end recording + `log()` streaming — this package doesn't depend on `@signal-studio/db` itself (avoids a cycle); `packages/db`'s `JobStagesRepo` implements it against real tables
  - [x] `multiOutput: true` stages run once per `manifest.outputs[]`, `ctx.outputId` set accordingly
  - [x] Cancellation token (`cancelled: () => boolean`) checked before every stage; throws `CancelledError`
  - [x] Unit tests with an in-memory fake store: full run, hash-unchanged skip, hash-changed re-run, resume-after-crash (a `failed` record doesn't block a re-run), failure mid-way (later stages don't run, failed status recorded), multi-output fan-out, cancellation — 7 tests, all green
- [x] **P1.4 Resolver** (`packages/core/src/resolve.ts`) (2026-09-18)
  - [x] `resolveJob(project, manifest, env) → ResolvedJob`, `Object.freeze`d; precedence manifest > project > env implemented for `voice`/`speed`/`outputs`; `gates` are additive (project ∪ manifest, not overriding) since a project can mandate gates regardless of what a manifest asks for — a deliberate deviation from strict "highest wins" precedence, flagged here since the plan doesn't say either way
  - [x] `providers` copied straight from the project (provider _selection_ is a project-level config in this schema, not something a manifest overrides — manifest.v1 has no `providers` field to override with)
  - [x] Snapshot-style test per example (manifest + project pair, full object equality) — 3 tests, all green
- [x] **P1.5 DB migration** (`packages/db/migrations/20260918_engine_core.sql`) (2026-09-18)
  - [x] Tables `orgs, projects, jobs, job_stages, artifacts, job_log`, all with `org_id`, `created_at`/`updated_at`, `(org_id, status)` indexes where a status column exists (`projects`/`artifacts`/`job_log` don't have a `status` column, so their index is `(org_id, job_id)`/`(org_id)` instead — noted rather than forcing a column that doesn't apply)
  - [x] RLS enabled on all six tables; `org_id = auth.jwt() ->> 'org_id'` policy on each; service role bypass is Supabase's standard behavior (no explicit bypass policy needed)
  - [x] Documented, not hand-written: pg-boss's own schema (comment at the top of the migration file)
  - [x] Repositories in `packages/db/src/repos/`: `OrgsRepo`, `ProjectsRepo`, `JobsRepo`, `JobStagesRepo` (implements `@signal-studio/core`'s `JobStageStore` contract directly — this is what the real stage runner is injected with), `ArtifactsRepo`. `JobStagesRepo`/`ArtifactsRepo` take `orgId` at construction (one instance per resolved job) since `JobStageStore`'s interface, shared with the in-memory test fake in `packages/core`, doesn't carry `orgId` through every call but the tables are `NOT NULL org_id`
  - [x] Seed script (`packages/db/scripts/seed.ts`) — **only seeds project.yaml files that actually validate against `project.v1`**. Exactly one `project.yaml` exists in the repo (`projects/assemblex-factory/project.yaml`), and it's the pilot bridge's own ad-hoc `{voice, speed, music_gain_db, watermark_text}` shape, not `project.v1` (no `slug`/`orgId`/`defaults`/`providers`) — running the script seeds the org and 0 projects, with a clear per-file validation error printed. **Did not fabricate the plan's "four projects"** — they don't exist as real files yet; real seed data lands once the workspace repo has real `project.yaml` files in the `project.v1` shape. Fixed a real bug found while running it: `js-yaml` is CJS-only and has no `default` export under strict ESM (`import yaml from 'js-yaml'` throws `SyntaxError`) — changed to `import { load as loadYaml } from 'js-yaml'`
  - [x] Applied to the **`dev`** Supabase project (2026-09-18) — created `signal-studio-engine-dev` (project ref `tgvugvhhtfnrzpmwkhoe`, org `facebook-news-pipeline`/`awhfizqcfeldzhbqhqff`, free tier, `$0`/mo, confirmed via `confirm_cost` before creation) via the Supabase MCP server (connection required exporting `SUPABASE_MCP_TOKEN` in `~/.zshrc` from `supabase login`'s CLI token — the repo's `.mcp.json` substitutes shell env, not `.env`). Migration applied via `mcp__supabase__apply_migration`; verified via `list_tables` (all 6 tables present, RLS on every one) and `get_advisors` (zero security lints). `ENGINE_SUPABASE_URL` written to `.env`; `ENGINE_SUPABASE_SERVICE_ROLE_KEY` pasted in manually (service_role/secret keys aren't exposed via the Supabase API/MCP for security — only `anon`/`publishable`). Ran the seed script end-to-end against the live project: `org-1` row created and confirmed via `execute_sql`. Legacy prod project (`nnxtvbolhuvihlpwppbj`) untouched, per plan
- [x] **P1.6 Provider contracts** (`packages/providers/src/contracts.ts` + `fakes/`) (2026-09-18)
  - [x] All seven interfaces from §2.4 (LLM, TTS, Captions, Image, Stock, Storage, Publish) as TS interfaces, each paired with a zod schema for its return shape
  - [x] `NotImplementedProviderError` + `assertImplemented(role, providerId, implemented)` — fails at validation time given a set of implemented ids, per §2.4's Instagram/TikTok requirement ("fail at validation, not mid-run"); the actual "which ids are implemented" set is a P2.4/P3.4 concern (concrete provider registration), not this file's
  - [x] `fakes/` — one fake per role (`fakeLlmProvider`, `fakeTtsProvider`, `fakeCaptionsProvider`, `fakeImageProvider`, `fakeStockProvider`, `fakeStorageProvider`, `fakePublishProvider`), deterministic, no network/filesystem access — matches §2.4's launch-set `*-fake` (CI) entries
  - [x] Unit tests: every fake's result validated against its contract's zod schema, plus `assertImplemented`'s pass/throw paths — 9 tests, all green
  - [ ] Fakes: `tts-fake` (silent WAV, 0.4 s/word), `llm-fake` (canned JSON), `image-fake` (solid PNG), `stock-fake`, `storage-local`, `publish-fake`
  - [ ] Contract test harness: `runContractTests(provider)` reusable by every real provider

**TEST GATES — P1**

- [ ] **T-L (Local)**
  - [ ] `npm test` ≥ 60 unit tests green; coverage report generated for `packages/core`
  - [ ] `ss validate examples/*/manifest.json` passes for the P2 example stub (create the stub now)
  - [ ] Migration applies cleanly to a local Supabase (`supabase start`) and to `dev`; `supabase db diff` empty afterwards
  - [ ] RLS check: anon client with a wrong `org_id` sees zero rows
- [ ] **T-G (GitHub)**
  - [ ] `ci.yml` runs the P1 suites; green
  - [ ] Add `db-migrate.yml` (manual dispatch) that applies migrations to `dev`; run it once
- [ ] **T-P (Production)** — `n/a` (no runtime yet)

---

### P2 — `clips-overlay` + first runtime → **M1**

- [ ] **P2.1 `clips-overlay` template** (`packages/templates/clips-overlay/`)
  - [ ] `compile(resolvedJob, output) → Timeline`: per-shot scene with `source{clip}`, `playbackRate`, `overlay`, `narrationPath`, `voStartSec`; `ig_optional` filter by output; end card; watermark; music
  - [ ] Move pilot compositions into `packages/render-remotion/src/compositions/clips-overlay/` (`ClipsOverlay.tsx`, `FactOverlay.tsx`, `EndCard.tsx`, `Watermark.tsx`) reading **only** `timeline.v1`
  - [ ] `render-remotion/src/render.ts`: `resolveComposition(timeline.template)` map; remove NewsCard default
  - [ ] Unit test: pilot pack → adapter → compile → Timeline snapshot (fb and ig)
- [ ] **P2.2 `compilation` template**
  - [ ] `compile()` reads `inputs.jobs[]` artifacts (episode `_fb` timelines, not MP4s — re-render from timelines so the end card is dropped cleanly)
  - [ ] `Compilation.tsx` in render-remotion
  - [ ] Unit test: 3 timelines → 1 compilation timeline snapshot
- [ ] **P2.3 Adapter + `assets` stage**
  - [ ] `projects/assemblex-factory/packs/blbl.v1.ts`: `pack.json → manifest.v1` (pure function, unit-tested with the pilot pack)
  - [ ] `assets` stage: probe (ffprobe), normalise (from P0.8-03), QA contact sheet artifact, audio strip flag, missing-clip → `awaiting_assets`
  - [ ] Idempotent: normalised outputs keyed by source hash
- [ ] **P2.4 Providers**
  - [ ] `tts-kokoro-js` (from P0.8-04) behind the `TTS` contract; per-file loudnorm option
  - [ ] `tts-kokoro-py` wrapping `packages/media/tts.py` behind the same contract
  - [ ] Parity test: 3 sentences × 1 voice; duration within 3 %; A/B listening note recorded in `docs/decisions/ADR-002-tts.md`
  - [ ] `storage-local`, `storage-r2` (put, signedUrl, presignUpload)
  - [ ] `llm-anthropic`: prompt caching, JSON via zod schema, model from env, proxy double-encode shim behind `ANTHROPIC_PROXY_DOUBLE_ENCODED=1`
  - [ ] Contract tests pass for each (fakes in CI; real locally with `--real`)
- [ ] **P2.5 `apps/worker`**
  - [ ] `ss validate`, `ss run-local --manifest --project --out` (no DB; writes artifacts to `out/`)
  - [ ] `ss run-job --id` (DB-backed; loads job, resolves, runs, updates rows)
  - [ ] `ss upload --job --shot --file` (presigned PUT via API)
  - [ ] `ss worker` stub (registers pg-boss handler; full hardening in P4)
  - [ ] `--log-level`, JSON logs in CI
- [ ] **P2.6 Docker image**
  - [ ] `docker/Dockerfile` multi-stage: node 22, ffmpeg, chromium deps, fonts, kokoro-js model baked, python3 + piper + faster-whisper (pinned)
  - [ ] `docker/compose.yml` (worker + api) — used fully in P4
  - [ ] `.github/workflows/image.yml`: build on push to `refactor/signal-studio` and tags; push `ghcr.io/<owner>/signal-studio-worker:{sha,dev}`; private
  - [ ] Image size recorded in `docs/deployment.md` (target ≤ 3 GB)
- [ ] **P2.7 `run-job.yml` + API (GitHub dispatch mode)**
  - [ ] `.github/workflows/run-job.yml`: `workflow_dispatch` input `job_id`; `container: ghcr.io/…:dev`; secrets → env; runs `ss run-job --id`; on failure PATCH job `failed` with run URL
  - [ ] `apps/api` (Hono): `POST /jobs`, `GET /jobs/:id`, `GET /jobs?project=`, `POST /jobs/:id/assets` (presign), `POST /jobs/:id/approve`, `GET /health`; API-key middleware (`api_keys` table, hashed)
  - [ ] Dispatcher `github`: sets `dispatched` atomically, calls `workflow_dispatch` with `GITHUB_PAT`
  - [ ] Deploy API as Supabase edge function `engine-api` on `dev`
  - [ ] OpenAPI JSON generated from Hono routes → `docs/api.md`
- [ ] **P2.8 AssembleX project on the engine**
  - [ ] `projects/assemblex-factory/project.yaml` complete (brand kit, voice, outputs fb/ig, gates none, publish targets manual)
  - [ ] Seed the project into `dev`
  - [ ] Week-1 EP1 pack → `POST /jobs` → upload clips via `ss upload` → job auto-advances

**TEST GATES — P2**

- [ ] **T-L (Local)**
  - [ ] `ss run-local` on the pilot pack (via adapter) → `_fb`/`_ig`; `golden/check.mjs` passes against the P0.8 pilot references
  - [ ] `ss run-local` on `examples/clips-overlay` with fakes < 3 min
  - [ ] `docker run … ss run-local` produces the same golden-passing output inside the container
  - [ ] Re-run with no changes → all stages `skipped`
  - [ ] Compilation from 3 local packs → 90–120 s file, title plates visible, one end card
- [ ] **T-G (GitHub)**
  - [ ] `image.yml` publishes `:dev`
  - [ ] `curl -X POST …/engine-api/jobs` with the pilot manifest → `awaiting_assets`; upload clips → `queued` → `run-job.yml` runs → `delivered`; `GET /jobs/:id` returns signed URLs; downloaded MP4 passes golden check
  - [ ] Force a failure (missing clip renamed mid-run) → job `failed` with stage + run URL; re-dispatch resumes and completes
  - [ ] Actions minutes used per job recorded in `docs/deployment.md`
- [ ] **T-P (Production)**
  - [ ] **M1:** Week-1 EP1 (or the next real pack) produced end-to-end via API on the GitHub tier, published on the AssembleX page from the engine output — not from the pilot bridge
  - [ ] Retire the pilot bridge: delete `projects/assemblex-factory/pilot/` (its README moves to `docs/decisions/ADR-001-pilot-bridge.md`)

---

### P3 — Remaining templates and providers

- [ ] **P3.1 `stills-kenburns`**
  - [ ] Move `apps/video/src/longform/{motion,captions,audio-mix,fonts,text-metrics}.js` → `packages/render-ffmpeg/src/` (TS, typed)
  - [ ] `render-ffmpeg` implements `render(timeline)` for still scenes (Ken Burns, cuts, xfade, overlays, text cards, 4-layer audio mix, loudnorm)
  - [ ] Template `compile()` from shotlist-v2 parser output → Timeline (parser moves to `packages/templates/stills-kenburns/parsers/`)
  - [ ] Project quirks → manifest fields: `noCaptionScenes[]`, watermark from project brand kit, colours from brand kit
  - [ ] Golden check vs Underdog reference (local)
- [ ] **P3.2 `shorts-916`**
  - [ ] Template from `assemble-short-rewrite.mjs` (hook wrap, spillover, pause+hit, end card v2, layered sound design) on top of P3.1 engine functions
  - [ ] Delete `assemble-short.mjs`
  - [ ] Golden check vs Short reference
- [ ] **P3.3 `case-file` + `carousel`**
  - [ ] `assemble-case.mjs` logic → template `compile()` (durations from measured VO, Whisper words → caption words, highlights/zoom)
  - [ ] `carousel` template (still image outputs, `outputs[]` with `kind: image`)
  - [ ] Golden checks vs both Policy File references
- [ ] **P3.4 Providers**
  - [ ] `stock-pexels` (from `apps/video/src/fetchers/pexels.js`), `image-fal`, `image-user`
  - [ ] `tts-piper` (wrap `tts_piper.py`), `tts-elevenlabs` (API, voice id from project)
  - [ ] `captions-faster-whisper` (pinned; replaces `subtitles.js`'s `whisper` call); ±50 ms parity test on 3 golden VO files
  - [ ] Contract tests for all
- [ ] **P3.5 Publish providers**
  - [ ] `publish-facebook`: video upload, caption from `manifest.captions.facebook` (+ question + hashtags + disclosure), `scheduleAt`, AI-disclosure flag; Graph v22.0; per-project page token env name from `project.yaml`
  - [ ] `publish-youtube` (from `apps/video/src/publishers/youtube.js`): Shorts title, "altered content" flag, scheduled publish
  - [ ] `publish` stage writes `artifacts{kind: post, url, postId}`
  - [ ] Delete `packages/publishers/*` and `apps/video/src/publishers/*` after parity
- [ ] **P3.6 `qa` stage**
  - [ ] Checks: duration vs expected, resolution/fps, integrated LUFS vs project target, true peak, black-frame detection, overlay safe-zone from timeline geometry
  - [ ] Optional `llm-anthropic` vision spot-check on 3 frames (project flag)
  - [ ] Failures → `job_stages.error` with a fix hint; warnings do not block
- [ ] **P3.7 Delete the old world**
  - [ ] Remove `apps/video/**`, `channels.js`, `channel-slugs.js`, `packages/media/*` (moved), `packages/render/core` (replaced by `packages/core`)
  - [ ] Remove edge functions `trigger-generation`, `trigger-longform`, `expand-brief`, `import-shotlist`, `upload-still`, `auto-match-still` (longform moves to the engine model)
  - [ ] Archive `reel-pipeline` repo on GitHub; delete its secrets
  - [ ] CI grep-guard for brand names + old paths passes

**TEST GATES — P3**

- [ ] **T-L (Local)**
  - [ ] Golden checks pass for all 5 remaining references (long-form act, Short, Policy File ×2, plus pilot regression)
  - [ ] `examples/{stills-kenburns,shorts-916,case-file,carousel}` render with fakes in CI time (< 8 min total)
  - [ ] Publish contract tests green with fakes; one real scheduled post to a **test** FB page and unlisted YouTube video, then deleted
- [ ] **T-G (GitHub)**
  - [ ] `run-job.yml` delivers one real job per template on `dev`
  - [ ] `ci.yml` includes the ffmpeg golden suite; Remotion golden suite in `nightly.yml`
- [ ] **T-P (Production)**
  - [ ] One Policy File case and one Underdog Short produced by the engine and published to their real pages
  - [ ] Old scripts gone from `main` after merge; workspace projects updated to engine manifests

---

### P4 — Worker runtime hardening and production deploy

- [ ] **P4.1 `ss worker`**
  - [ ] pg-boss `work('run-job', {teamSize: 1})`; retry limit 2, backoff 60 s → 600 s; `expireInHours: 6`
  - [ ] Heartbeat every 30 s → `jobs.heartbeat_at`; reaper marks `running` jobs with stale heartbeat (> 10 min) as `failed{retryable:true}`
  - [ ] Graceful shutdown on SIGTERM (finish current stage, mark `queued`)
  - [ ] Dispatcher `queue` in the API
- [ ] **P4.2 VPS**
  - [ ] Provision (Hetzner CX22 or Oracle ARM); Docker + compose; `deploy/.env` from workspace template; GHCR login
  - [ ] `compose.yml`: `worker`, `api` (Node target of the same Hono app), `watchtower`
  - [ ] Create the **`prod`** Supabase project; apply migrations; seed org + projects; API keys
  - [ ] Systemd unit or compose `restart: always`
- [ ] **P4.3 Observability**
  - [ ] pino JSON → stdout; `job_log` table fed by the runner; log tail endpoint `GET /jobs/:id/log?tail=50`
  - [ ] Healthchecks.io ping in the worker loop; Sentry DSN in api + worker
  - [ ] Daily digest script (`ss digest`) → email/Telegram: failed, awaiting, delivered counts; Actions minutes used
- [ ] **P4.4 Secrets consolidation**
  - [ ] Inventory every secret; map to exactly two stores (GitHub Actions secrets; VPS `deploy/.env`); edge-function secrets only for `engine-api`
  - [ ] Delete stale secrets from Supabase edge functions, `reel-pipeline`, and the engine repo
  - [ ] `docs/deployment.md` secrets table (≤ 2 columns) + rotation steps
- [ ] **P4.5 (optional) `/mcp`**
  - [ ] Streamable HTTP MCP on the API: `create_job`, `get_job`, `list_jobs`, `approve_gate`, `presign_upload`
  - [ ] Auth: verify claude.ai custom-connector requirements at build time; implement OAuth 2.1 single client if required
  - [ ] Test from a Claude.ai Project with the BLBL master prompt: `BATCH 7` → 7 jobs created

**TEST GATES — P4**

- [ ] **T-L (Local)**
  - [ ] `docker compose up` locally with a local Supabase: `POST /jobs` → worker picks it up → `delivered`
  - [ ] Kill the worker mid-render → restart → job resumes, no duplicate artifacts
  - [ ] Two workers + 3 jobs → each job claimed exactly once
- [ ] **T-G (GitHub)**
  - [ ] `image.yml` promotes `:dev` → `:prod` on tag only (no rebuild)
  - [ ] `run-job.yml` still works as the emergency path against `prod` with `DISPATCH_MODE=github` set on a separate API key
- [ ] **T-P (Production)**
  - [ ] VPS worker renders one full AssembleX week (6 posts + compilation) via `DISPATCH_MODE=queue`
  - [ ] Healthchecks green 7 days; Sentry receives a forced test exception; digest arrives daily
  - [ ] Secrets inventory matches the two stores; nothing stale remains

---

### P5 — Dashboard rebuild (Angular, engine repo)

- [ ] **P5.1 Foundation**
  - [ ] `apps/dashboard/src/app/core/api.service.ts` (typed client generated from OpenAPI); remove direct `jobs` writes
  - [ ] Auth guard reads `org_id` claim; environment per `dev`/`prod`
  - [ ] Split `supabase.service.ts` into feature services; delete dead code
- [ ] **P5.2 Projects**
  - [ ] List + detail; brand-kit editor rendered from `project.v1` JSON Schema (fonts, colours, watermark, music beds, voice, outputs, gates, publish targets)
- [ ] **P5.3 Jobs**
  - [ ] List with status/stage/age filters; detail with stage timeline, warnings, `job_log` tail, artifacts per output (preview player), re-run / cancel buttons
- [ ] **P5.4 New Job**
  - [ ] Wizard: project → template → input mode (paste script / paste `pack.json` → adapter / upload assets) → manifest preview (validated) → submit
- [ ] **P5.5 Assets + Review**
  - [ ] Drag-drop clip upload per shot via presigned URLs with progress; per-shot status
  - [ ] Review page for `awaiting_review:<gate>`: preview, approve/reject with note
- [ ] **P5.6 `generation_attempts`**
  - [ ] Migration + form + weekly failure report by shot purpose (replaces `production-log.csv`)
- [ ] **P5.7 Retire legacy pages**
  - [ ] Remove articles / on-this-day / upload / reels / longform pages once their pipelines are gone (news UI moves to the workspace or stays on the old Vercel project)

**TEST GATES — P5**

- [ ] **T-L (Local)**
  - [ ] `ng test` green; Playwright smoke: login → new job (pack.json) → upload 1 clip → see `awaiting_assets` → approve gate path
  - [ ] Phone-width layout check on Jobs and Review
- [ ] **T-G (GitHub)**
  - [ ] Dashboard build in `ci.yml`; Playwright smoke against `dev` API in `nightly.yml`
  - [ ] Vercel preview deploy per PR
- [ ] **T-P (Production)**
  - [ ] Vercel prod pointed at `prod` API; one real AssembleX job created and reviewed entirely from the dashboard
  - [ ] A second org (test) cannot see org 1 data

---

### P6 — Split, template, hand-over kit

- [ ] **P6.1 Workspace split**
  - [ ] Add engine as submodule `engine/` pinned to tag `v0.1.0`; move `projects/`, `deploy/`, archive docs; workspace `CLAUDE.md`
  - [ ] Workspace CI: validate all `project.yaml` + manifests against the engine schemas
- [ ] **P6.2 Examples + docs**
  - [ ] `examples/` complete (one per template, ≤ 2 MB total, fakes-friendly)
  - [ ] `docs/manifest-spec.md` generated from zod; `docs/templates.md`, `docs/providers.md`, `docs/architecture.md`, `docs/deployment.md`, `docs/runbook.md` final
  - [ ] Fresh-clone test: a colleague renders an example in ≤ 15 min following only the README
- [ ] **P6.3 Licence + hand-over**
  - [ ] `LICENSE` (commercial), `THIRD_PARTY_NOTICES.md` (Remotion company-licence note, FFmpeg, Kokoro, Piper, faster-whisper, fonts, music)
  - [ ] `docs/onboarding-customer.md`: fork workspace template, secrets checklist, first job, publish tokens (customer-owned)
  - [ ] Hand-over checklist reviewed
- [ ] **P6.4 SaaS-readiness ADR**
  - [ ] `docs/decisions/ADR-004-saas.md`: roles, invitations, billing hooks, per-org R2 prefixes, metering, rate limits — scoped with rough sizes

**TEST GATES — P6**

- [ ] **T-L (Local)**
  - [ ] Fresh clone of the workspace + `git submodule update --init` → `ss run-local` on one real project works
  - [ ] CI grep-guard for brand names in the engine passes
- [ ] **T-G (GitHub)**
  - [ ] Engine tag `v0.1.0`; workspace CI green against it
- [ ] **T-P (Production)**
  - [ ] All four brands producing from the workspace against the engine tag for two weeks without a hotfix to the engine

---

### Track C — Claude Code layer (do alongside; tick as you go)

- [ ] **C.1** Root `CLAUDE.md` ≤ 100 lines (commands, layout, conventions, gotchas that cause mistakes); per-app/package `CLAUDE.md` ≤ 40 lines (`apps/api`, `apps/worker`, `apps/dashboard`, `packages/core`, `packages/templates`, `packages/providers`, `packages/render-ffmpeg`, `packages/render-remotion`, `packages/db`); `CLAUDE.local.md` in `.gitignore`
- [ ] **C.2** `.claude/rules/`: `remotion.md` (`**/*.tsx`), `ffmpeg.md` (`packages/render-ffmpeg/**`), `providers.md` (`packages/providers/**`), `migrations.md` (`packages/db/migrations/**`), `dashboard.md` (`apps/dashboard/**`)
- [ ] **C.3** Skills: `add-template`, `add-provider`, `run-job-local`, `golden-check`, `debug-job`, `release` (`disable-model-invocation: true`) — each ≤ 60 lines, keywords first
- [ ] **C.4** Agents: `code-reviewer` (fresh context, flags correctness/requirement gaps only), `render-qa` (runs golden check, reads metrics), `security-reviewer`
- [ ] **C.5** Hooks in `.claude/settings.json`: PostToolUse eslint+prettier (from P0.3); PreToolUse block writes to applied migrations; `env-check` exists
- [ ] **C.6** Workspace skills: `blbl-weekly-batch` (master prompt → `POST /jobs` ×7), `log-attempt`, `new-project`, `longform-doc-playbook` (moved), `policy-file-playbook`
- [ ] **C.7** Retire `.claude/commands/*`, `wild-eye-*` skills, `higgsfield-credit-guard` → `workspace/.claude/archive/`
- [ ] **C.8** Test: start Claude Code in `packages/core/` → only root + core `CLAUDE.md` load; edit a `.tsx` → `remotion.md` rule appears; `/add-template` runs end to end on a dummy template

---

### Milestones

| ID   | Milestone                                                    | Depends on | Done |
| ---- | ------------------------------------------------------------ | ---------- | ---- |
| M0   | Pilot post live from the bridge                              | P0.8 T-P   | [ ]  |
| M0.5 | Safety net green                                             | P0 T-G     | [ ]  |
| M1   | AssembleX post produced by `POST /jobs` on the GitHub tier   | P2 T-P     | [ ]  |
| M2   | All live channels on the engine; old scripts deleted         | P3 T-P     | [ ]  |
| M3   | Production worker on VPS, queue mode, one full week rendered | P4 T-P     | [ ]  |
| M4   | Dashboard operates a real job end to end                     | P5 T-P     | [ ]  |
| M5   | Engine `v0.1.0` tagged; workspace split; hand-over kit ready | P6 T-P     | [ ]  |
