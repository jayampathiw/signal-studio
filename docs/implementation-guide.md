# Signal Studio — Implementation Guide

> **Audience:** Any developer joining or working on Signal Studio.
> **Last analysed:** 2026-06-26 against `main`.
> **Stale as of 2026-09-18 (P0.5):** `apps/news` moved to the private `signal-studio-workspace` repo. Every `apps/news/...` path below refers to that repo now, not this one. See `docs/refactor/refactor-plan.md`'s P0.5 entry for the real current architecture (this doc hasn't been re-walked section by section for it).
> **Companion docs:** `docs/PROJECT-STATUS.md` (progress tracker), `docs/cloud-automation-workflow.md`, `docs/video-generation-flow.md`, `docs/higgsfield-models.md`, `CLAUDE.md`. Index: `docs/README.md`.

This guide is the single onboarding reference. It explains _what the system does_, _how the pieces fit_, _where everything lives_, and _how to run, extend, and debug it_.

---

## 1. Critical context — read this first

Signal Studio is a **self-contained monorepo** that does all the real work: data ingestion, AI generation, rendering, storage, database, and the review dashboard.

Two **external, public GitHub repositories exist only as automation triggers** — they are _entry points_, not implementation:

| External repo            | Visibility               | Role                                                                                                               | What it actually contains                                                                                                      |
| ------------------------ | ------------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `reel-pipeline`          | public                   | Hosts the GitHub Actions workflow that runs the AI **video** generation agent in the cloud                         | A `generate.yml` workflow + a thin `runner.sh`. It checks out _this_ repo via a deploy key and runs the skills that live here. |
| `facebook-news-pipeline` | public _(legacy origin)_ | Historical origin of the **news** pipeline; the news automation now runs from this repo's own `.github/workflows/` | Effectively superseded — the news GitHub Actions live in `signal-studio/.github/workflows/fetch-news.yml`.                     |

> **Why public repos as triggers?** GitHub Actions minutes are free and unlimited on public repos. The heavy, private logic stays in `signal-studio` (private) and is checked out at job runtime via an SSH deploy key. Compute is free; secrets stay private.

**The one-sentence mental model:**

> `reel-pipeline` (public) is a doorbell. When rung (cron or manual dispatch), it pulls `signal-studio` (private) into a free cloud VM and runs a Claude Code agent that drives Higgsfield + Supabase. Everything the agent knows and does is defined _here_.

---

## 2. Project overview

Signal Studio is a **multi-channel AI content publishing platform**. It produces two fundamentally different kinds of content from one codebase and one database:

1. **News posts** (`apps/news`) — RSS / NewsAPI ingestion → Claude captions → fal.ai composite images → Facebook pages (France 🇫🇷, Italy 🇮🇹).
2. **Short-form video / reels** (`apps/video` + `.claude` skills) — a brief concept → Claude scene prompts → Higgsfield AI image+video generation → vision-gated, continuity-checked clips → SEO package → `rendered` asset, ready to publish to Facebook / Instagram / YouTube / TikTok.

A third surface ties them together:

3. **Review dashboard** (`apps/dashboard`) — an Angular SPA on Vercel where a human reviews articles and reels, expands briefs, triggers generation, edits scene prompts, and copies publish packages.

The platform is organised around **channels**. A channel key has the shape `<niche>/<style>/<LANG>` (e.g. `wildlife/intimacy/EN`). The flagship AI-video channel is **Wild Capture** (internal brand "Wild Eye"), channel key `wildlife/intimacy/EN`.

### Core design goals

- **Cloud-to-cloud automation** — the AI video pipeline runs with _zero_ local-machine involvement. GitHub runner ↔ Anthropic ↔ Higgsfield ↔ Supabase.
- **Cost safety** — hard credit guards and a cheap storyboard preview before any expensive video credits are spent.
- **Quality gates** — every generated frame is vision-reviewed and continuity-checked before the next (costlier) step.
- **Idempotent resume** — a crashed or cancelled generation run resumes exactly where it stopped; completed scenes are never re-paid for.
- **Channel reuse** — adding a new AI-video channel is "write one skill pair + knowledge files + one cron line", inheriting the entire platform stack.

---

## 3. Architecture & design

### 3.1 The three runtime planes

```
┌─────────────────────────────────────────────────────────────────────┐
│  INTERACTIVE PLANE  (developer at claude.ai/code or Claude Code CLI) │
│  • runs the same .claude/skills + agents by hand                     │
│  • Higgsfield via OAuth MCP, Supabase via MCP                        │
└─────────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────────┐
│  AUTOMATED PLANE  (GitHub Actions, unattended)                       │
│  • news:  signal-studio/.github/workflows/fetch-news.yml (cron 30m)  │
│  • video: reel-pipeline/generate.yml → checks out signal-studio →    │
│           claude --print "run wild-eye-reel skill for id=N"          │
└─────────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────────┐
│  SERVERLESS PLANE  (Supabase Edge Functions, Deno)                   │
│  • expand-brief, trigger-generation, generate-image, generate-caption│
│  • post-to-facebook, queue/post-on-this-day, analyze-upload          │
│  • called by the dashboard; some call out to GitHub / Anthropic / fal│
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                ┌───────────────────────────┐
                │  Supabase Postgres (state) │
                │  articles · content_items  │
                │  render_queue · *_log      │
                └───────────────────────────┘
```

All three planes read/write the **same Supabase project** (`nnxtvbolhuvihlpwppbj`). The database is the single source of truth and the coordination bus between planes.

### 3.2 The 3-tier skills architecture (AI video)

This is the central design principle for the video pipeline. Every Claude skill/agent belongs to exactly one tier. (Full spec: `docs/cloud-automation-workflow.md §2`.)

```
Tier 1 — Official Higgsfield skills   (installed at runtime; never modified by us)
   ↓ wrapped by
Tier 2 — Platform skills/agents        (apply to ALL channels)
   ↓ wrapped by
Tier 3 — Channel skills                (one set per channel)
```

| Tier   | Examples (file)                                                                                                                                      | Scope                                                                   |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **T1** | `higgsfield:generate` (`npx skills add higgsfield-ai/skills`)                                                                                        | Higgsfield mechanics only — model selection, job polling                |
| **T2** | `.claude/skills/higgsfield-credit-guard/SKILL.md`; agents `.claude/agents/{image-quality-gate,continuity-checker,seo-writer,performance-analyst}.md` | Platform-wide rules: credit ceiling, vision gate, continuity, SEO       |
| **T3** | `.claude/skills/wild-eye-reel/SKILL.md`, `.claude/skills/wild-eye-brief/SKILL.md`                                                                    | One channel: cavy-only rules, format formulas, CTA phrasing, scheduling |

**Promotion rule:** anything used by ≥2 channels moves up to Tier 2; anything channel-specific stays Tier 3; Tier 1 is never edited.

> Note: the `image-quality-gate` agent is registered at the Claude Code harness level (it appears in available agent types) and referenced by the skills; the `.claude/agents/` directory holds `continuity-checker`, `image-quality-gate`, `seo-writer`, and `performance-analyst`.

### 3.3 Data flow — a reel from concept to `rendered`

```
[dashboard]  user creates brief  ──▶ content_items row, status='brief', scenes='[]'
     │
     │  user clicks "Generate Scene Prompts"
     ▼
[edge fn expand-brief]  Claude writes scenes jsonb  ──▶ status='storyboard'
     │
     │  user reviews/edits prompts (Scenes tab), tweaks Config tab (gen_config)
     │  user clicks "Run Generation Pipeline"
     ▼
[edge fn trigger-generation]  dispatches GitHub workflow_dispatch
     │     (channel=wild-eye, content_id=N) → repos/jayampathiw/reel-pipeline
     ▼
[reel-pipeline runner]  checkout signal-studio (deploy key) →
     claude --print "run wild-eye-reel for id=N"
     ▼
[wild-eye-reel skill]  (Tier 3 orchestrator)
     1. credit-guard          (T2)  abort if < 50 credits
     2. load brief + knowledge files
     3. storyboard image      (T1)  + advisory vision gate (T2)  ── status='generating'
     4. per scene:
        a. start frame        (T1)
        b. image-quality-gate (T2)  HARD gate: pass / retry / blocked
        c. continuity-checker (T2)  hard conflict → blocked
        d. video clip         (T1)  (scenario-3 also passes end_image)
        e. write scene → scenes jsonb
     5. seo-writer            (T2)  → seo jsonb
     6. [21s only] assemble-reel.mjs → FFmpeg concat → R2 → rendered_video_url
     7. status='rendered'   ── STOP (no upload)
     ▼
[dashboard]  user reviews rendered video, copies caption package, posts manually
             (or clicks Mark as Posted → status='posted')
```

### 3.4 Status lifecycle (the `content_items.status` state machine)

```
brief → storyboard → generating → rendered → publishing → posted
                          │
                          └──▶ blocked   (vision gate fails twice, or hard continuity conflict)
                          └──▶ failed    (terminal error, e.g. 21s assembly failed)
```

| Status                  | Set by                   | Meaning                                                                 |
| ----------------------- | ------------------------ | ----------------------------------------------------------------------- |
| `brief`                 | user / brief script      | Concept only; `scenes='[]'`                                             |
| `storyboard`            | expand-brief / skill     | Scene prompts written; storyboard image generated                       |
| `generating`            | skill                    | Row claimed (concurrency guard); per-scene generation in progress       |
| `rendered`              | skill                    | All scenes done, SEO written, `rendered_video_url` set; publisher-ready |
| `publishing` / `posted` | publish step / dashboard | Upload in progress / live                                               |
| `blocked`               | skill                    | On hold; `status_note` holds the reason; needs a human decision         |
| `failed`                | skill / publish          | Terminal error; `status_note` holds the reason                          |

`status_note` (renamed from `open_thread` in migration 102) is non-null whenever a human needs to act.

### 3.5 Idempotency & concurrency

- **Concurrency guard:** the skill flips `status='generating'` before any per-scene work. A second runner or interactive session that reads `generating` skips the row.
- **Idempotent resume:** scenes with `scene_status='video_done'` (or `'image_done'` for portrait) are skipped on re-run; a scene whose `vision_check.status==='pass'` is not re-gated. Re-running a crashed job spends no new credits on completed work. (See `wild-eye-reel/SKILL.md` "Recovery / resume".)

---

## 4. Technology stack

| Layer                        | Technology                                                                                                                 | Where / version                                                    |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Runtime                      | Node.js ≥ 20 (ESM only, `"type":"module"`)                                                                                 | root `package.json` `engines`                                      |
| Monorepo                     | npm workspaces (no pnpm/lerna)                                                                                             | root `package.json` `workspaces`                                   |
| AI captions/scripts          | Anthropic Claude via `@anthropic-ai/sdk`                                                                                   | `packages/ai/claude.js`; default model `claude-haiku-4-5-20251001` |
| AI image (news)              | fal.ai (primary) → Cloudflare Workers AI → Google AI (fallbacks); Pollinations (free)                                      | `packages/ai/image-gen/*`                                          |
| AI image+video (reels)       | Higgsfield (MCP tools `generate_image`/`generate_video`)                                                                   | models in `docs/higgsfield-models.md`                              |
| Video render                 | FFmpeg (`packages/render/ffmpeg`) + Remotion (`packages/render/remotion`, React/TS)                                        | engine is per-channel config                                       |
| TTS / subtitles              | Kokoro TTS + Whisper (`packages/media`)                                                                                    | `renderers/tts.py`                                                 |
| Object storage               | Cloudflare R2 (S3-compatible via `@aws-sdk/client-s3`)                                                                     | `packages/media/storage.js`                                        |
| Database / auth / serverless | Supabase (Postgres + Edge Functions in Deno + Storage)                                                                     | project `nnxtvbolhuvihlpwppbj`                                     |
| Dashboard                    | Angular 21 (standalone components, signals) + Tailwind                                                                     | `apps/dashboard`                                                   |
| Dashboard hosting            | Vercel (SPA rewrite)                                                                                                       | `apps/dashboard/vercel.json`                                       |
| Automation                   | GitHub Actions (public-repo free runners)                                                                                  | `.github/workflows/`, external `reel-pipeline`                     |
| Stock footage                | Pexels / Pixabay                                                                                                           | `apps/video/src/fetchers/pexels.js`                                |
| Publishing                   | Facebook/IG/YT/TikTok Graph & Data APIs                                                                                    | `packages/publishers/*`                                            |
| Agent orchestration          | Claude Code skills + subagents (`.claude/`)                                                                                | Tier 2/3 skills & agents                                           |
| MCP servers                  | supabase, github, context7, sequential-thinking, filesystem, memory (+ higgsfield OAuth, notion, playwright at user level) | `.mcp.json`                                                        |

**Facebook API version:** always `https://graph.facebook.com/v22.0` (v19 deprecated May 2026).

---

## 5. File structure & organization

```
signal-studio/
├── apps/
│   ├── news/                 # News pipeline (RSS/NewsAPI → captions → FB)
│   │   └── src/
│   │       ├── pipeline.js           # orchestrator: ingest → dedup → validate → save
│   │       ├── ingestion/{rss,newsapi}.js
│   │       ├── enrich/                # dedup, clustering, scoring, criticality, image composite
│   │       ├── config/                # pillars, slots, sources, historical-stories
│   │       ├── services/{ai,wikipedia}.js
│   │       ├── validators/contentValidator.js
│   │       └── scripts/               # generate-caption, generate-image, publish-slot, …
│   │
│   ├── video/                # AI-video pipeline + Wild Eye knowledge
│   │   ├── knowledge/wild-eye/        # house-style.md, script-library.md, seo-examples.md
│   │   ├── scripts/
│   │   │   ├── create-brief.mjs       # single source of truth for brief creation (AI + INSERT)
│   │   │   ├── assemble-reel.mjs      # 21s: FFmpeg concat → R2 → rendered_video_url
│   │   │   ├── safe-language-lint.mjs # Higgsfield-flagged term substitutions
│   │   │   └── tracker.mjs            # performance logging → content_items.metrics + CSV
│   │   └── src/
│   │       ├── pipeline.js            # stock-footage channels orchestrator (ingest→generate)
│   │       ├── config/
│   │       │   ├── channels.js        # CHANNEL registry (the heart of channel config)
│   │       │   └── channel-slugs.js   # slug ('wild-eye') → channel_key + skill mapping
│   │       ├── fetchers/pexels.js
│   │       ├── publishers/            # per-app FB/IG/YT/TT (mirror packages/publishers)
│   │       ├── renderers/{reel.js,tts.py}
│   │       └── scripts/               # ingest, generate-reel, process-queue, publish
│   │
│   └── dashboard/            # Angular 21 review SPA (Vercel)
│       └── src/app/
│           ├── core/supabase.service.ts   # ALL data access + edge-fn calls + TS models
│           ├── reels/reel-detail-dialog.component.ts  # 5-tab reel editor
│           ├── reels/reel-list.component.ts
│           └── articles/article-detail-dialog.component.ts
│
├── packages/                # Shared workspace libraries (@signal-studio/*)
│   ├── ai/                   # claude.js (chat + caching + double-encode shim) + image-gen/*
│   ├── config/              # env.js (dotenv loader + required-key validation) + schema.js
│   ├── database/            # supabase.js (anon + service clients) + articles.js + briefs.js
│   ├── media/               # storage.js (R2 upload), Kokoro TTS, Whisper
│   ├── publishers/          # facebook.js (implemented) + instagram/youtube/tiktok (stubs)
│   ├── render/
│   │   ├── core/            # engine interface + render()
│   │   ├── ffmpeg/          # concat.js, kenburns.js (Ken Burns + concat demuxer)
│   │   └── remotion/        # React/TS compositions (starts with NewsCard)
│   └── types/              # shared JSDoc typedefs
│
├── supabase/
│   ├── functions/          # Deno Edge Functions (see §7)
│   └── migrations/         # 001–022 (news), 100–102 (content_items/wild-eye), dated (metrics, gen_config)
│
├── .claude/
│   ├── skills/             # higgsfield-credit-guard (T2), wild-eye-reel + wild-eye-brief (T3)
│   ├── agents/             # continuity-checker, image-quality-gate, seo-writer, performance-analyst (T2)
│   ├── commands/           # interactive slash commands (/new-11s-reel, /wild-seo, /log-reel, …)
│   └── settings.json       # harness config
│
├── docs/                   # architecture + this guide + planning
├── prompts/system/         # versioned system prompts (content-system.v1.md)
├── evals/                  # eval harness (run.js + cases/scorecards/traces)
├── productions/            # per-production output workspace (template/)
├── .github/workflows/      # fetch-news.yml (cron 30m), fetch-reels.yml (manual)
├── .mcp.json               # project MCP servers
├── .env / .env.example     # root env (loaded by packages/config)
└── CLAUDE.md               # agent operating guide (authoritative conventions)
```

### Why this layout

- **apps/** = entry points and channel-specific logic; **packages/** = everything reusable across apps. Apps depend on packages via the `@signal-studio/*` workspace aliases, never the reverse.
- **`channels.js` is the spine.** Almost every behavioural difference between channels (renderer, models, formats, platforms, watermark, CTA) is data in this one file rather than branching code.
- **`.claude/` is executable architecture** — the skills are not docs, they are the program the cloud agent runs.

---

## 6. Implementation details — key features

### 6.1 Channel registry (`apps/video/src/config/channels.js`)

Each entry is keyed by `channel_key`. Two shapes coexist:

- **Stock-footage channels** (NaturePulse, NatureFrame, France, Italy): carry `fetchers[]`, `renderer:'reel'`, and a `rendererConfig` (duration, clips, narration, voice, music, CTA).
- **AI-video channel** (`wildlife/intimacy/EN`): carries `source:'higgsfield'`, `renderer:'higgsfield'`, model defaults (`imageModel`, `videoModel`, `imageRes`, `videoRes`, `aspectRatio`, `generateAudio`), and a `formats` map (`11s` / `21s` / `portrait`) instead of `rendererConfig`.

`getChannel(key)` throws on unknown keys; `listEnabledPlatforms(channel)` returns the platforms to publish to. The Wild Eye block's model defaults are the _fallback_ layer for generation config (see §6.5).

### 6.2 Config & env (`packages/config`)

- `env.js` loads the root `.env` (via dotenv), then validates `schema.required` (`SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_KEY`, `FAL_KEY`) and **throws at import time** if any are missing.
- `env` is a `Proxy` over `process.env`, so any code does `import { env } from '@signal-studio/config'` and reads `env.WHATEVER`.
- `schema.js` is the canonical inventory of every env var (required + optional). Update it when adding a new integration.

### 6.3 Claude client (`packages/ai/claude.js`)

- Single shared `Anthropic` client; `MODEL = env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001'`.
- Supports proxy routing: set `ANTHROPIC_BASE_URL=https://api.oneprovider.dev` + `ANTHROPIC_MODEL=claude-sonnet-4-6`.
- **oneprovider.dev double-encodes responses** as a JSON string — `parseResponse()` unwraps it. `extractJson()` pulls JSON out of fenced or noisy completions. Edge functions duplicate this shim (`getText()` in `expand-brief`).
- Prompt caching is enabled by passing `system` as message blocks.

### 6.4 Brief creation (`apps/video/scripts/create-brief.mjs` + `packages/database/briefs.js`)

One script, two entry points (interactive skill `wild-eye-brief`, or CLI). Flow:

- **Phase 1 (AI):** species/concept check (cavy-only rule), format recommendation, curiosity-gap title (1 emoji, <10 words), 21s tension-arc check. Rejections exit non-zero with a JSON reason.
- **Phase 2 (deterministic):** slot validation (no Tue/Wed/Thu for Reels), near-duplicate check (last 30 days), then `createBrief()` INSERTs the row (`status='brief'`, `scenes='[]'`).

(Full spec: `docs/video-generation-flow.md §0`.)

### 6.5 Generation config resolution (precedence)

The skill resolves each generation parameter as **per-reel `gen_config` → channel default**:

```
imageModel  = gen_config.imageModel  ?? channel.imageModel   // 'nano_banana_pro'
videoModel  = gen_config.videoModel  ?? channel.videoModel   // 'seedance_2_0'
imageRes    = gen_config.imageRes    ?? channel.imageRes      // '2k'
videoRes    = gen_config.videoRes    ?? channel.videoRes      // '720p'
aspectRatio = gen_config.aspectRatio ?? channel.aspectRatio   // '9:16'
generateAudio = channel.generateAudio                          // true
```

`gen_config` is the per-row jsonb column (migration `20260625_gen_config_column.sql`), written by the dashboard **Config tab**. Canonical model IDs live in `docs/higgsfield-models.md`. **Scenario-3 (21s) constraint:** the video model must support the `end_image` role — `seedance_2_0`, `kling3_0`, `wan2_7`, `cinematic_studio_3_0`, `seedance_1_5` do; `kling3_0_turbo` does **not** (the dashboard disables it for 21s).

### 6.6 The three generation scenarios

Set per-scene during brief expansion; this single field drives how the skill generates each scene (full detail: `docs/video-generation-flow.md §2.2`):

- **Scenario 1 — storyboard-direct** (`transition:'panel'`): storyboard panel → video reference; no dedicated start frame, no start-frame vision gate.
- **Scenario 2 — start-frame only / cut** (`transition:'fresh'`): fresh start frame per scene; previous clip's `final_frame_url` used only as a _character_ reference; the cut happens in assembly.
- **Scenario 3 — start+end chain** (`transition:'fresh'`→`'chain'`): each clip's end frame _is_ the next scene's start frame. Runs **two-phase**: generate ALL start frames first (Phase A), then all videos (Phase B). The chain only works if every start frame exists before any video.

11s defaults to one scenario-3 scene; 21s defaults to three scenario-3 scenes (a scene becomes scenario 2 where the concept demands an angle cut); portrait is `image_only`.

### 6.7 Vision gate & continuity (Tier 2 agents)

- **`image-quality-gate`** runs after every generated frame. For storyboards it is **advisory** (never blocks — the storyboard is the human review point). For start/end frames it is a **HARD gate**: `pass` (score ≥7) proceeds; `retry` (score <7, attempt 1) regenerates the same frame; `blocked` (score <7, attempt ≥2) sets `scene_status='blocked'`, `status='blocked'`, writes `status_note`, and STOPs. **No video credits are spent until the start frame passes.**
- **`continuity-checker`** runs after the gate passes: `none`→proceed, `soft`→log & proceed (cloud), `hard`→block. It also reviews multi-panel storyboards for cross-scene contradictions (same animal, consistent location, plausible lighting progression) _before_ any video credits.

### 6.8 Credit guard (Tier 2)

`higgsfield-credit-guard` runs at session start and (cloud mode) before each scene. `<50` credits → STOP and reset to `storyboard`; `50–200` → force 720p; `>200` → proceed. Returns a session config object consumed by the orchestrator. Higgsfield has no live credit meter mid-generation, so this is the primary cost safety.

### 6.9 21s assembly (`apps/video/scripts/assemble-reel.mjs`)

The cloud agent produces three separate clips for a 21s reel. Step 6.5 of the skill calls this script: it downloads the 3 `clip_url`s, concatenates them with the FFmpeg concat demuxer (`packages/render/ffmpeg/concat.js`), uploads the stitched MP4 to R2 (`packages/media/storage.js → uploadToR2`), writes `rendered_video_url`, and prints `{id, rendered_video_url}`. On failure it exits 1 and the skill sets `status='failed'`. Requires `ffmpeg` on PATH and the `R2_*` env vars.

### 6.10 Dashboard reel editor (`apps/dashboard/src/app/reels/reel-detail-dialog.component.ts`)

A standalone Angular component (signals-based) with five tabs:

- **Overview** — status-colored header; context-aware CTAs: "Generate Scene Prompts" (brief) / "Run Generation Pipeline" (storyboard) with a live GitHub Actions run link.
- **Scenes** — per-scene `image_prompt` + structured `video_prompt` editors, duration/scenario/transition selectors, existing-asset strip (start frame with vision score overlay + clip player), a **safe-language lint** that suggests Higgsfield-safe substitutions inline, and per-scene/Save-all dirty tracking.
- **Config** — platform (Higgsfield), image model + resolution + aspect, video model + resolution (hidden for portrait; 21s disables non-`end_image` models). Saves to `gen_config`; "Reset to channel defaults" clears it.
- **SEO** — title/description/hashtags with copy buttons (reads `seo` jsonb, falls back to legacy `ai_caption`).
- **Pipeline** — rendered video player, per-scene Higgsfield job IDs, per-platform status rows.

All persistence goes through `SupabaseService` (`updateContentItemScenes`, `updateContentItemFields`, `expandBrief`, `triggerGeneration`).

### 6.11 News pipeline (`apps/news/src/pipeline.js`)

For each country in `config/sources.js`: fetch RSS + NewsAPI in parallel → in-batch dedup → DB dedup (title similarity > 0.7) → `validateArticle()` (drops absolute violations, routes others to `blocked`/`manual_review`) → cluster detection/annotation → `saveArticles()`. Caption/image generation and publishing are separate scripts (and edge functions) so a human can review in the dashboard between stages.

---

## 7. Database schema

One Supabase Postgres database backs everything. The two pipelines do not share rows.

### 7.1 Core tables

| Table               | Purpose                                                                        |
| ------------------- | ------------------------------------------------------------------------------ |
| `articles`          | News pipeline rows (ingested stories, captions, FB post status)                |
| `content_items`     | Reels/video rows (briefs → rendered assets) **and** legacy stock-footage reels |
| `render_queue`      | Pending/processing render jobs                                                 |
| `on_this_day_posts` | "On this day" historical FB posts                                              |
| `reels_log`         | Performance/topic-hash log for near-duplicate checks                           |
| `post_metrics`      | Time-series FB metrics snapshots (`+1h`/`+24h`/`+7d`)                          |

### 7.2 `content_items` — key columns (Wild Eye relevant)

From `migrations/100_content_items.sql` + `101_wild_eye.sql` + `102_generic_brief.sql` + dated migrations:

| Column                                                                     | Type               | Notes                                                                                              |
| -------------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------- |
| `id`                                                                       | bigserial PK       |                                                                                                    |
| `channel_key`                                                              | text               | `'wildlife/intimacy/EN'`                                                                           |
| `niche`/`style`/`language`/`source_type`/`source_clips`/`target_platforms` | text/jsonb         | **nullable since 102** (channel config lives in `channels.js`, not rows)                           |
| `title` / `description`                                                    | text               | brief concept                                                                                      |
| `format`                                                                   | text               | `'11s'` / `'21s'` / `'portrait'`                                                                   |
| `status`                                                                   | text CHECK         | `brief, storyboard, generating, pending, rendering, rendered, publishing, posted, failed, blocked` |
| `scenes`                                                                   | jsonb `'[]'`       | progressively populated per scene (canonical shape: `docs/video-generation-flow.md §6`)            |
| `gen_config`                                                               | jsonb              | per-reel generation overrides (dashboard Config tab)                                               |
| `status_note`                                                              | text               | renamed from `open_thread`; non-null = needs human attention                                       |
| `seo`                                                                      | jsonb              | `{title, description, hashtags[]}` — **written by the generator**                                  |
| `ai_caption`                                                               | jsonb              | `{intro, question, cta}` — legacy news/pexels caption shape                                        |
| `hashtags`                                                                 | text[]             | legacy hashtag column                                                                              |
| `slot` / `scheduled_for`                                                   | text / timestamptz | posting slot                                                                                       |
| `rendered_video_url` / `rendered_at`                                       | text / timestamptz | final asset                                                                                        |
| `metrics`                                                                  | jsonb              | performance log (dated migration)                                                                  |
| `fb_*`/`ig_*`/`yt_*`/`tt_*`                                                | text/timestamptz   | denormalized per-platform publish status                                                           |

A `set_updated_at()` trigger maintains `updated_at`.

### 7.3 `scenes` jsonb shape (per element)

```jsonc
{
  "scene_num": 1,
  "duration_sec": 11,
  "scenario": 3,
  "transition": "fresh", // generation strategy per scene
  "image_prompt": "flowing prose…",
  "video_prompt": {
    "composition": "...",
    "style": "...",
    "cameraMotion": "...",
    "subjects": "...",
    "action": "...",
    "location": "...",
    "audioCues": "...",
    "lighting": "...",
    "durationSec": 11,
  },
  "storyboard_url": "…", // scene 1 only, after Step 3
  "higgsfield_image_job": "…",
  "start_frame_url": "…",
  "higgsfield_video_job": "…",
  "clip_url": "…",
  "final_frame_url": "…", // scenario 2 only (character ref for next scene)
  "vision_check": { "status": "pass", "score": 8, "attempts": 1, "issues": [] },
  "scene_status": "pending|image_done|video_done|blocked",
}
```

### 7.4 Migrations

- `001`–`022` — news pipeline evolution (SEO fields, tags, captions, metrics, clustering, scoring, on-this-day).
- `100` — creates `content_items`.
- `101` — Wild Eye extensions (`format`, `scenes`, `open_thread`, `slot`, `scheduled_for`, `seo`; extended status CHECK).
- `102` — drops NOT NULL from channel-config columns; renames `open_thread`→`status_note`.
- `20260623…_metrics_column.sql` — adds `metrics` jsonb.
- `20260625_gen_config_column.sql` — adds `gen_config` jsonb.

Apply with: `supabase db query --linked -f supabase/migrations/<file>.sql` (or `supabase db push`).

> **Known schema/code mismatch to watch:** `apps/video/src/utils/content-item.js` `platformStatusCols` historically referenced `fb_video_id` (only `fb_post_id` exists). Harmless (unused by `publish.js`) but noted in `docs/PROJECT-STATUS.md §6.2`.

---

## 8. API documentation — Supabase Edge Functions

All functions are Deno, live in `supabase/functions/<name>/index.ts`, share CORS headers, and are called by the dashboard via `SupabaseService` with the user's access token (falling back to the anon key). `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected by Supabase; other secrets are set via `supabase secrets set`.

| Function                                 | Method / body             | Does                                                                                                                                                               | Calls out to              |
| ---------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- |
| `expand-brief`                           | POST `{content_item_id}`  | Claude expands a `brief` row into `scenes` jsonb, advances to `storyboard`; reverts to `brief` with `status_note` on parse/AI failure                              | Anthropic                 |
| `trigger-generation`                     | POST `{content_item_id}`  | Validates `status='storyboard'`, maps `channel_key`→slug, dispatches `generate.yml` `workflow_dispatch` to `jayampathiw/reel-pipeline`, returns the queued run URL | GitHub API (`GITHUB_PAT`) |
| `generate-image`                         | POST `{article_id}`       | Generates a news composite image                                                                                                                                   | fal.ai / CF / Google      |
| `generate-caption`                       | POST `{article_ids[]}`    | Claude SEO captions for articles                                                                                                                                   | Anthropic                 |
| `post-to-facebook`                       | POST `{article_ids[]}`    | Publishes articles to FB pages                                                                                                                                     | Graph v22.0               |
| `analyze-upload`                         | POST `{rawText, country}` | Parses pasted text into structured article candidates                                                                                                              | Anthropic                 |
| `queue-on-this-day` / `post-on-this-day` | POST                      | Build + publish "on this day" posts                                                                                                                                | Anthropic / Graph         |

**`trigger-generation` channel map** (mirrors `channel-slugs.js`):
`wildlife/intimacy/EN → wild-eye`, plus stubbed `wildlife/{factual,listicle,cinematic,silent}/EN`. Dispatch payload: `{ ref:'main', inputs:{ channel, content_id } }` → `repos/jayampathiw/reel-pipeline/actions/workflows/generate.yml/dispatches`.

**Dashboard data-access surface** (`apps/dashboard/src/app/core/supabase.service.ts`): `getContentItems`, `getContentItemStats`, `updateContentItemStatus/Scenes/Fields`, `expandBrief`, `triggerGeneration`, `queueRender`, plus the article equivalents. The TS interfaces `ContentItem`, `ContentItemScene`, `GenConfig` here are the authoritative front-end data model.

---

## 9. Setup & environment

### 9.1 Prerequisites

- Node ≥ 20, npm. (`pnpm` is the user's global preference but this repo uses npm workspaces.)
- `ffmpeg` on PATH (for FFmpeg renderer + 21s assembly).
- Optional: Supabase CLI, GitHub CLI (`gh`), Higgsfield CLI (cloud credit checks), Python (TTS).

### 9.2 Install & configure

```bash
git clone git@github.com:jayampathiw/signal-studio.git
cd signal-studio
npm install                 # installs all workspaces
cp .env.example .env        # then fill in values
```

### 9.3 Environment variables (root `.env`)

Loaded by `packages/config/env.js`. **Required (throws if missing):** `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_KEY`, `FAL_KEY`.

Grouped optional keys (see `.env.example` + `packages/config/schema.js`):

- **Claude routing:** `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL`
- **Image fallbacks:** `CF_ACCOUNT_ID`, `CF_API_TOKEN`, `GOOGLE_AI_KEY`, `IMAGE_PROVIDER`, `POLLINATIONS_TOKEN`
- **R2:** `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_RENDERED`, `R2_BUCKET_INBOX`, `R2_PUBLIC_BASE_URL`
- **Stock:** `PEXELS_API_KEY`, `PIXABAY_API_KEY`, `NEWSAPI_KEY`
- **Facebook (per-page suffix):** `FB_PAGE_ID_FR/IT/NATURE_PULSE/NATURE_FRAME/WILD_CAPTURE` + matching `FB_ACCESS_TOKEN_*`
- **IG/YT/TT (per-page):** `IG_*`, `YT_*`, `TT_*`
- **MCP/local:** `GITHUB_PAT`, `CONTEXT7_API_KEY`, `SUPABASE_MCP_TOKEN`

> **Per-page credential pattern:** `FB_PAGE_ID_<SUFFIX>` / `FB_ACCESS_TOKEN_<SUFFIX>`, where `<SUFFIX>` comes from `channel.platforms.facebook.envKey` in `channels.js`. Publishers read `env[\`FB_PAGE_ID_${suffix}\`]` dynamically.

### 9.4 Where secrets live (four separate stores)

| Store                                             | Set how                                            | Holds                                                                                                                                                     |
| ------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root `.env`                                       | local file                                         | everything, for local runs (⚠️ a template — many keys are blank placeholders with inline comments)                                                        |
| **GitHub Actions secrets** (`signal-studio` repo) | `gh secret set …`                                  | news + video workflow keys (Supabase, Anthropic, FAL, FB, R2, Pexels)                                                                                     |
| **Supabase Edge Function secrets**                | `supabase secrets set …`                           | `ANTHROPIC_KEY`, `FAL_KEY`, **`GITHUB_PAT`** (critical for trigger-generation; needs `actions:write` on reel-pipeline), FB keys, image fallbacks          |
| **`reel-pipeline` repo secrets**                  | `gh secret set … --repo jayampathiw/reel-pipeline` | `SIGNAL_STUDIO_DEPLOY_KEY`, `ANTHROPIC_API_KEY` + `ANTHROPIC_BASE_URL` + `ANTHROPIC_MODEL` (proxy), `SUPABASE_MCP_TOKEN`, `HIGGSFIELD_AUTH_TOKEN`, `R2_*` |

(Supabase auto-injects `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` into edge functions — do not set those manually. All `reel-pipeline` secrets were provisioned 2026-06-26 — see `docs/PROJECT-STATUS.md §5.3`.)

### 9.5 Run things locally

```bash
npm run news        # node apps/news/src/pipeline.js  — full news ingest cycle
npm run video       # node apps/video/src/pipeline.js — stock-footage channels
npm run evals       # node evals/run.js
npm run bootstrap   # scripts/bootstrap.js

# Dashboard
cd apps/dashboard && npm install && npm start   # ng serve

# Create an AI-video brief (cheapest test path)
node apps/video/scripts/create-brief.mjs \
  --channel "wildlife/intimacy/EN" \
  --concept "A guinea pig waking at dawn in her burrow" \
  --format 11s

# Run the reel generation interactively (claude.ai/code):  /new-wild-reel <id>
```

---

## 10. Deployment & pipeline

### 10.1 News automation (`.github/workflows/fetch-news.yml`)

Cron every 30 min (+ manual dispatch). Steps: checkout → Node 22 → `npm ci` → `npm run news`, with Supabase/Anthropic/FAL/CF/Google/NewsAPI/FB env from `secrets.*`. This runs from _this_ repo's Actions — `facebook-news-pipeline` is the legacy origin and not the live trigger.

### 10.2 Reel automation (the `reel-pipeline` doorbell)

`fetch-reels.yml` here is manual-only/placeholder; the live video trigger is the **external** `reel-pipeline` repo:

```
dashboard "Run Generation Pipeline"
   → edge fn trigger-generation
   → POST workflow_dispatch {channel, content_id} to jayampathiw/reel-pipeline
   → reel-pipeline/generate.yml on ubuntu-latest:
        checkout reel-pipeline
        checkout signal-studio → /workspace/content   (SIGNAL_STUDIO_DEPLOY_KEY)
        npm i -g @anthropic-ai/claude-code @higgsfield/cli
        npx skills add higgsfield-ai/skills            (Tier 1)
        restore HIGGSFIELD_AUTH_TOKEN → ~/.higgsfield/credentials
        claude --print --mcp-config mcp.cloud.json --dangerously-skip-permissions \
          "Run the wild-eye-reel skill for content_items.id=<id>"
   → skill writes assets to Supabase, sets status='rendered', STOPS (no upload)
```

Cost is effectively $0 (free public-repo runner; Higgsfield covered by plan; ~$0.01–0.05 Anthropic per reel). Full spec + cron slots: `docs/cloud-automation-workflow.md §4–5`.

### 10.3 Dashboard deploy (Vercel)

`apps/dashboard/vercel.json`: `buildCommand: npm run build`, `outputDirectory: dist/dashboard/browser`, SPA rewrite of everything to `/index.html`. Supabase URL + anon key are compiled in via `src/environments/environment.prod.ts` (no Vercel env vars needed — the anon key is public by design, protected by RLS).

### 10.4 Supabase deploy

Edge functions: `supabase functions deploy <name>`. Migrations: `supabase db push` (or per-file `db query --linked -f`). Secrets: `supabase secrets set KEY=value`.

---

## 11. Key workflows (step-by-step)

### 11.1 Create → render a Wild Eye reel (happy path)

1. **Brief** — dashboard "New reel" or `create-brief.mjs` → `content_items` row, `status='brief'`.
2. **Expand** — Overview → "Generate Scene Prompts" → `expand-brief` writes `scenes`, `status='storyboard'`.
3. **Review** — Scenes tab: read/edit prompts (safe-language lint suggests fixes); Config tab: optionally override models → saves `gen_config`.
4. **Run** — Overview → "Run Generation Pipeline" → `trigger-generation` dispatches the cloud job; the run URL appears.
5. **Generate** — `wild-eye-reel` does credit-guard → storyboard → per-scene (frame → vision gate → continuity → video) → SEO → (21s) assemble → `status='rendered'`.
6. **Publish** — Pipeline tab: watch the rendered video; "Copy package"; post to Facebook; "Mark as Posted" → `status='posted'`.

### 11.2 Recover a blocked reel

Read `status_note` → fix the offending `image_prompt`/`video_prompt` in the Scenes tab (or edit the concept) → reset `status` to `storyboard` → re-run. Scenes already `video_done` (and frames with `vision_check.pass`) are skipped; no credits re-spent.

### 11.3 News cycle

Cron (or `npm run news`) ingests + dedups + validates + saves articles → human reviews in the dashboard → `generate-caption` / `generate-image` → `post-to-facebook`.

### 11.4 Add a new AI-video channel

(Per `docs/cloud-automation-workflow.md §10` — Tier 1 & Tier 2 unchanged.)

1. Write `<channel>-brief` + `<channel>-reel` skills (Tier 3) in `.claude/skills/`.
2. Add `apps/video/knowledge/<channel>/{house-style,script-library,seo-examples}.md`.
3. Register the channel in `channels.js` and the slug in `channel-slugs.js` (+ the edge-fn `CHANNEL_SLUG` map).
4. Add a Supabase migration only if new columns are needed (rare — schema is generic).
5. Add cron entries to `reel-pipeline/generate.yml`; test with `workflow_dispatch` first.

---

## 12. Common tasks & maintenance

| Task                             | How                                                                                                                                       |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Add an env var                   | add to `packages/config/schema.js` (required or optional) + `.env.example` + relevant secret store(s)                                     |
| Add a Higgsfield model           | update `docs/higgsfield-models.md` + the `IMAGE_MODELS`/`VIDEO_MODELS` arrays in `reel-detail-dialog.component.ts` (note `endImage` flag) |
| Change generation defaults       | edit the `wildlife/intimacy/EN` block in `channels.js`                                                                                    |
| Adjust house rules / prompts     | edit `apps/video/knowledge/wild-eye/*.md` and/or `wild-eye-reel/SKILL.md`                                                                 |
| Add a safe-language substitution | `apps/video/scripts/safe-language-lint.mjs` **and** the `UNSAFE_TERMS` array in the dashboard component (keep in sync)                    |
| Inspect a run                    | dashboard Pipeline tab (job IDs, run URL) or the GitHub Actions log of the dispatched run                                                 |
| Re-run a stuck generation        | reset `status` to `storyboard`, re-dispatch (idempotent)                                                                                  |

### Debugging tips

- **Empty caption on publish** — known live bug: generator writes `seo` jsonb but the FB publisher reads `ai_caption`/`hashtags`. Make `facebook.js` SEO-aware (`docs/PROJECT-STATUS.md §6.1`).
- **21s won't publish** — `rendered_video_url` is NULL until `assemble-reel.mjs` runs (Step 6.5). Ensure `ffmpeg` + `R2_*` are present in the runner.
- **expand-brief returns unparseable JSON** — the raw output is stored (truncated) in `status_note` and the row reverts to `brief`; inspect and retry.
- **trigger-generation 500 "GITHUB_PAT not configured"** — set the `GITHUB_PAT` secret in **Supabase Edge Functions** (needs `repo`+`workflow` scope).
- **Proxy JSON weirdness** — remember the oneprovider.dev double-encoding; use `parseResponse`/`getText`.

---

## 13. Dependencies & external integrations

| Service                                          | Used for                                                  | Auth                                                      | Code                                 |
| ------------------------------------------------ | --------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------ |
| Anthropic Claude                                 | captions, brief expansion, scene prompts, agent reasoning | `ANTHROPIC_KEY` (+ optional proxy)                        | `packages/ai/claude.js`, edge fns    |
| Higgsfield                                       | reel image+video generation; credit checks                | OAuth MCP (interactive) / `HIGGSFIELD_AUTH_TOKEN` (cloud) | skills + MCP tools                   |
| fal.ai                                           | news composite images (primary)                           | `FAL_KEY`                                                 | `packages/ai/image-gen/fal.js`       |
| Cloudflare Workers AI / Google AI / Pollinations | image fallbacks                                           | `CF_*` / `GOOGLE_AI_KEY` / `POLLINATIONS_TOKEN`           | `packages/ai/image-gen/*`            |
| Cloudflare R2                                    | rendered video/asset storage                              | `R2_*`                                                    | `packages/media/storage.js`          |
| Supabase                                         | Postgres, Edge Functions, Storage, Auth                   | service role / anon / `SUPABASE_MCP_TOKEN`                | `packages/database/*`, `supabase/*`  |
| GitHub Actions                                   | free cloud runners (news + reel triggers)                 | `GITHUB_PAT` / deploy key                                 | `.github/workflows`, `reel-pipeline` |
| Pexels / Pixabay                                 | stock footage                                             | `PEXELS_API_KEY` / `PIXABAY_API_KEY`                      | `apps/video/src/fetchers`            |
| NewsAPI + RSS                                    | news ingestion                                            | `NEWSAPI_KEY`                                             | `apps/news/src/ingestion`            |
| Facebook / IG / YouTube / TikTok                 | publishing                                                | per-page tokens                                           | `packages/publishers/*`              |
| Vercel                                           | dashboard hosting                                         | —                                                         | `apps/dashboard/vercel.json`         |

**Publisher status:** `facebook.js` is fully implemented (feed posts, video upload, multi-photo, generic `postContent`). `instagram.js`, `youtube.js`, `tiktok.js` in `packages/publishers/` are **stubs that throw** (deferred until those pages launch); fuller implementations exist under `apps/video/src/publishers/` per the roadmap (`docs/PROJECT-STATUS.md §7.2`).

---

## 14. Testing strategy

Testing is **light and pragmatic** — there is no enforced coverage gate in this repo despite the global preference.

- **Evals harness** — `npm run evals` (`evals/run.js`) with `evals/cases/{news,video}`, `evals/scorecards`, `evals/traces` (scaffolded; populate per channel).
- **Smoke tests** — `apps/video/test/caption-smoke.mjs` (asserts a Wild-Eye-shaped row yields a non-empty caption — the regression guard for the SEO→publish mapping). Run with `node apps/video/test/caption-smoke.mjs`.
- **Vision/continuity as runtime QA** — the `image-quality-gate` and `continuity-checker` agents are effectively automated quality tests embedded in the pipeline, blocking bad output before spend.
- **Manual verification** — the dashboard is the human review surface; `verify`/`run` Claude skills exist for driving the app.

When adding tests, mirror the smoke-test style (plain `.mjs`, asserts via `process.exit`) or add eval cases; wire a `test` script into the relevant workspace `package.json`.

---

## 15. Feature plans — pending work

From `docs/PROJECT-STATUS.md` and the cloud-automation backlog:

### Near-term (code, no live-run dependency)

- **Phase 1 — SEO→publish fix:** make `packages/publishers/facebook.js` read from the `seo` jsonb (fallback to `ai_caption`/`hashtags`); enforce the Wild Eye CTA at publish time (reels end exactly `Follow for more hidden moments from the wild.`; portraits end with a question); keep the caption smoke test green.
- **Phase 2 — 21s auto-stitch:** already wired via `assemble-reel.mjs` + skill Step 6.5; validate `ffmpeg` + `R2_*` in the runner on first live run.

### Operational (manual)

- **Phase 3 — enablement: ✅ done (2026-06-26).** `reel-pipeline` repo + `generate.yml` + `runner.sh` live; deploy key + all 10 secrets set; two runner bugs fixed (`b564b66`, `4fdc7d0`).
- **Phase 4 — first live validation: ✅ done (2026-06-26).** Interactive run rendered reel #26 (11s); cloud run `28247384659` (#27) authenticated through the Anthropic proxy and reached `generating`. **Still to validate:** a 21s scenario-3 chain + `assemble-reel.mjs` stitch, and a fully green cloud render → `rendered`. Live tracker: `docs/PROJECT-STATUS.md §5.3`.

### Deferred (needs architecture)

- **Human storyboard approval gate** — GitHub Environment approval or a Slack button; pause after storyboard, resume on approval.
- **`chapter_chain` long-form format** — 10–300+ linked clips grouped into chapters with narration (Kokoro/Higgsfield) and automated FFmpeg assembly; needs `target_duration_sec` + `chapters` jsonb columns and a new orchestrator skill (`docs/video-generation-flow.md §1.4`).
- **Additional channels** — Sports, Cartoon (stubbed in `channel-slugs.js` + cron comments).
- **IG/YT/TT publishers for Wild Capture** — implement the stubs + add `*_WILD_CAPTURE` secrets when those platforms go live.

### Implemented since the original plan

Channel slug registry, `tracker.mjs` performance logging, `metrics` + `gen_config` columns, the dashboard 5-tab reel editor + Config tab, the two-phase scenario-3 generation order, and the 21s assembly script.

---

## 16. Glossary

| Term                    | Meaning                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------- |
| Channel key             | `<niche>/<style>/<LANG>`, e.g. `wildlife/intimacy/EN`; primary key into `channels.js` |
| Channel slug            | short name used by the cloud trigger, e.g. `wild-eye` → mapped in `channel-slugs.js`  |
| Wild Eye / Wild Capture | brand / Facebook page name for the flagship AI-video channel                          |
| Brief                   | a `content_items` row with `status='brief'` — concept only                            |
| Scenario 1/2/3          | per-scene generation strategy (storyboard-direct / cut / start+end chain)             |
| Vision gate             | the `image-quality-gate` agent — hard gate on frames, advisory on storyboards         |
| Tier 1/2/3              | Higgsfield official / platform-wide / channel-specific skills                         |
| `gen_config`            | per-reel jsonb generation overrides (dashboard Config tab)                            |
| `status_note`           | human-readable reason a row is `blocked`/`failed` (was `open_thread`)                 |

---

_Mainteners: keep this guide in sync with `channels.js`, `wild-eye-reel/SKILL.md`, the edge-function set, and the migration list — those four are the load-bearing surfaces. When the SEO→publish fix lands, update §12/§15 accordingly._
