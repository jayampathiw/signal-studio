# signal-studio — Claude Code Guide

## What this is

Monorepo for a multi-channel AI content publishing platform. Consolidated from `facebook-news-pipeline` and `reels-pipeline`. It produces two kinds of content from one codebase + one database: **news posts** (`apps/news`) and **AI-generated reels** (`apps/video` + `.claude` skills), reviewed via the **dashboard** (`apps/dashboard`).

**Full onboarding reference:** `docs/implementation-guide.md` — read it for architecture, data flow, schema, and workflows. This file is the quick operating guide.

## Trigger repos vs. implementation (important)

This repo is **self-contained** — all real logic lives here. Two **public** GitHub repos exist only as free-runner automation triggers, not implementation:

- `reel-pipeline` (public) — hosts `generate.yml`; on dispatch it checks out *this* repo via a deploy key and runs `claude --print "run wild-eye-reel for id=N"`. The video generation logic it executes is all here (`.claude/skills`, `apps/video`).
- `facebook-news-pipeline` (public) — legacy origin of the news pipeline; the live news automation now runs from this repo's own `.github/workflows/fetch-news.yml`.

Public repos are used because GitHub Actions minutes are free/unlimited on them; the private logic stays here and is pulled in at runtime.

## Apps

| App | Path | What it does |
|---|---|---|
| news | `apps/news/` | RSS/NewsAPI → Claude captions → fal.ai images → Facebook (FR, IT) |
| video | `apps/video/` | Stock/AI-image scenes → FFmpeg or Remotion → MP4 → all platforms |
| dashboard | `apps/dashboard/` | Angular review UI (Vercel) |

## Shared packages

| Package | Import | Does |
|---|---|---|
| `@signal-studio/ai` | `packages/ai/` | Claude client + image-gen provider chain |
| `@signal-studio/render-core` | `packages/render/core/` | Engine interface + `render()` |
| `@signal-studio/render-ffmpeg` | `packages/render/ffmpeg/` | FFmpeg + Ken Burns + concat |
| `@signal-studio/render-remotion` | `packages/render/remotion/` | Remotion (React/TS) compositions |
| `@signal-studio/media` | `packages/media/` | Kokoro TTS, Whisper subtitles, R2 storage |
| `@signal-studio/database` | `packages/database/` | Supabase client + CRUD |
| `@signal-studio/publishers` | `packages/publishers/` | Facebook / IG / YT / TT |
| `@signal-studio/config` | `packages/config/` | Root .env loader + validation |
| `@signal-studio/types` | `packages/types/` | Shared JSDoc typedefs |

## AI / Claude integration

- Client: `packages/ai/claude.js` — configurable `ANTHROPIC_BASE_URL` + `ANTHROPIC_MODEL`
- Default: direct Anthropic + `claude-haiku-4-5-20251001` + prompt caching
- Proxy mode: set `ANTHROPIC_BASE_URL=https://api.oneprovider.dev` + `ANTHROPIC_MODEL=claude-sonnet-4-6`
- oneprovider.dev double-encodes JSON responses — the `parseResponse()` shim handles this
- Versioned prompt files: `prompts/system/`, `prompts/tasks/`, loaded via `packages/ai/prompts.js`

## Channels & content lifecycle

- **Channel registry:** `apps/video/src/config/channels.js`. Key shape is `<niche>/<style>/<LANG>` (e.g. `wildlife/intimacy/EN`). Almost all per-channel behaviour is data here, not branching code.
- **`renderer` per-channel value** (not a directory split):
  - `renderer: 'reel'` → stock-footage path via `packages/render/ffmpeg` (Kokoro TTS + Whisper + Ken Burns + FFmpeg concat). Driven by `rendererConfig`.
  - `renderer: 'higgsfield'` → AI generation via `.claude` skills + Higgsfield MCP. Driven by the `formats` map (`11s` / `21s` / `portrait`) + model defaults.
  - `packages/render/remotion` (React/TS) is also available as an engine.
- **Reel status lifecycle** (`content_items.status`): `brief → storyboard → generating → rendered → publishing → posted`; off-ramps `blocked` / `failed` (reason in `status_note`).
- **Generation config precedence:** per-reel `gen_config` jsonb (dashboard Config tab) → channel default in `channels.js`.
- **Slug → channel:** `apps/video/src/config/channel-slugs.js` maps `wild-eye` → `wildlife/intimacy/EN` + skill name.

## .claude skills — 3-tier architecture (AI video)

Every skill/agent is exactly one tier (full spec: `docs/cloud-automation-workflow.md`):
- **Tier 1** — official Higgsfield skills (`npx skills add higgsfield-ai/skills`); never modified.
- **Tier 2** — platform-wide, apply to all channels: `higgsfield-credit-guard` skill; `image-quality-gate`, `continuity-checker`, `seo-writer`, `performance-analyst` agents.
- **Tier 3** — one set per channel: `wild-eye-reel` (orchestrator) + `wild-eye-brief`.

Rule: anything used by ≥2 channels → promote to Tier 2; channel-specific → Tier 3; Tier 1 untouched.

## Supabase edge functions

Deno functions in `supabase/functions/*` called by the dashboard. Key ones: `expand-brief` (Claude writes `scenes`, `brief`→`storyboard`), `trigger-generation` (dispatches `reel-pipeline` via GitHub API — needs `GITHUB_PAT` secret), `generate-image` / `generate-caption` / `post-to-facebook` (news). `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are auto-injected; other secrets via `supabase secrets set`.

## MCP servers

- Root `.mcp.json`: supabase, github, context7, sequential-thinking, filesystem, memory
- Higgsfield: available automatically on claude.ai/code (OAuth MCP) — no local config needed
- Per-app `.mcp.json`: reserved for future niche servers; empty at launch

## Runtime modes

| Mode | Where | How |
|---|---|---|
| Interactive | claude.ai / Claude Code | MCP servers; run `.claude` skills by hand |
| Automated (news) | GitHub Actions (this repo) | `.github/workflows/fetch-news.yml`, cron 30m → `npm run news` |
| Automated (video) | GitHub Actions (`reel-pipeline`) | dispatch → checkout this repo → `claude --print` runs `wild-eye-reel` |

## Facebook API

Always use `https://graph.facebook.com/v22.0`. v19 deprecated May 2026.

## AI model for captions/scripts

`claude-haiku-4-5-20251001` — 70% cheaper than Sonnet, fast enough, prompt caching enabled.
Override via `ANTHROPIC_MODEL` for proxy/Sonnet sessions.

## Code conventions

- ESM (`import`/`export`) everywhere in Node.js code — no CommonJS
- TypeScript only in `apps/dashboard` (Angular) and `packages/render/remotion`
- No comments unless explaining a non-obvious constraint
- No `console.log` in production paths — `console.error` for errors
- Per-page credentials: `FB_PAGE_ID_XX` / `FB_ACCESS_TOKEN_XX` suffix pattern

## Supabase project

Shared across all apps: `nnxtvbolhuvihlpwppbj`

## Known gotchas

- **SEO → publish caption mismatch (live bug).** `wild-eye-reel` writes the caption to the `seo` jsonb (`{title, description, hashtags}`), but `packages/publishers/facebook.js` still reads `ai_caption` (`{intro, question, cta}`) + the `hashtags` column. Publishing a Wild Eye reel today posts a **blank caption**. Make the publisher `seo`-aware (fallback to `ai_caption` for legacy news rows). See `docs/PROJECT-STATUS.md` §6.1.
- **21s `rendered_video_url` is NULL until assembly.** The generator leaves it NULL for 21s (3 separate clips); `apps/video/scripts/assemble-reel.mjs` (skill Step 6.5) stitches them via FFmpeg → R2. Requires `ffmpeg` on PATH + `R2_*` env. Publishers hard-throw on missing `rendered_video_url`.
- **Four separate secret stores.** Root `.env` (local), `signal-studio` GitHub Actions secrets (news/video workflows), Supabase edge-function secrets, and **`reel-pipeline` repo secrets** (the cloud video runner) are all independent. `trigger-generation` needs `GITHUB_PAT` (with `actions:write` on `reel-pipeline`) set in **Supabase**. `reel-pipeline` needs its own set: `SIGNAL_STUDIO_DEPLOY_KEY`, `ANTHROPIC_API_KEY`/`ANTHROPIC_BASE_URL`/`ANTHROPIC_MODEL`, `SUPABASE_MCP_TOKEN`, `HIGGSFIELD_AUTH_TOKEN`, `R2_*`. `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` are auto-injected into edge functions — don't set them manually.
- **`.env` is a template — many values are blank placeholders with inline comments** (e.g. `GITHUB_PAT=    # GitHub Personal Access Token`). Never blindly copy a `.env` value into a secret: a naive `grep|cut` captures the *comment* as the value (this is what caused the dashboard 502). Strip inline comments and verify the value is non-empty / well-formed before setting.
- **Cloud `claude` CLI + proxy Anthropic key.** If `ANTHROPIC_KEY` is a proxy key (non-`sk-ant-`), the `reel-pipeline` runner must **forward `ANTHROPIC_BASE_URL` + `ANTHROPIC_MODEL`** to the `claude` CLI (done in `generate.yml`'s "Run generation" env) — the CLI defaults to `api.anthropic.com` otherwise.
- **Higgsfield CLI credentials path.** CLI v0.2.x stores auth at `~/.config/higgsfield/credentials.json` (JSON: `access_token` + `refresh_token`), **not** `~/.higgsfield/credentials`. The `HIGGSFIELD_AUTH_TOKEN` secret must hold the full `credentials.json`, restored to that path on the runner.
- **oneprovider.dev double-encodes responses.** When `ANTHROPIC_BASE_URL` is the proxy, responses come back as a JSON string. Use `parseResponse()` (`packages/ai/claude.js`) / `getText()` (edge fns) — never read `content[0].text` raw.
- **`env` validation throws at import.** `packages/config/env.js` throws if any of `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_KEY`, `FAL_KEY` is missing. Add new vars to `packages/config/schema.js`.
- **Scenario-3 (21s) video model must support `end_image`.** `seedance_2_0`, `kling3_0`, `wan2_7`, `cinematic_studio_3_0`, `seedance_1_5` do; `kling3_0_turbo` does **not** (dashboard disables it for 21s).
- **Safe-language lint lives in two places.** `apps/video/scripts/safe-language-lint.mjs` and the `UNSAFE_TERMS` array in `reel-detail-dialog.component.ts` must stay in sync.
- **`expand-brief` failure reverts to `brief`.** On unparseable Claude JSON it stores the raw output (truncated) in `status_note` and resets `status='brief'` — check `status_note` to debug.
- **Stale schema ref:** `apps/video/src/utils/content-item.js` references `fb_video_id` (only `fb_post_id` exists). Harmless (unused by `publish.js`).

## Key docs

- **Implementation guide (start here):** `docs/implementation-guide.md`
- Cloud automation / 3-tier skills: `docs/cloud-automation-workflow.md`
- Reel generation lifecycle (scenes, scenarios, status): `docs/video-generation-flow.md`
- Higgsfield model IDs + params: `docs/higgsfield-models.md`
- **Progress tracker / known bugs / roadmap:** `docs/PROJECT-STATUS.md`
- Docs index: `docs/README.md`
