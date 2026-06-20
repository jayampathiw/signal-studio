# content-platform — Claude Code Guide

## What this is

Monorepo for a multi-channel AI content publishing platform. Consolidated from `facebook-news-pipeline` and `reels-pipeline`.

## Apps

| App | Path | What it does |
|---|---|---|
| news | `apps/news/` | RSS/NewsAPI → Claude captions → fal.ai images → Facebook (FR, IT) |
| video | `apps/video/` | Stock/AI-image scenes → FFmpeg or Remotion → MP4 → all platforms |
| dashboard | `apps/dashboard/` | Angular review UI (Vercel) |

## Shared packages

| Package | Import | Does |
|---|---|---|
| `@content-platform/ai` | `packages/ai/` | Claude client + image-gen provider chain |
| `@content-platform/render-core` | `packages/render/core/` | Engine interface + `render()` |
| `@content-platform/render-ffmpeg` | `packages/render/ffmpeg/` | FFmpeg + Ken Burns + concat |
| `@content-platform/render-remotion` | `packages/render/remotion/` | Remotion (React/TS) compositions |
| `@content-platform/media` | `packages/media/` | Kokoro TTS, Whisper subtitles, R2 storage |
| `@content-platform/database` | `packages/database/` | Supabase client + CRUD |
| `@content-platform/publishers` | `packages/publishers/` | Facebook / IG / YT / TT |
| `@content-platform/config` | `packages/config/` | Root .env loader + validation |
| `@content-platform/types` | `packages/types/` | Shared JSDoc typedefs |

## AI / Claude integration

- Client: `packages/ai/claude.js` — configurable `ANTHROPIC_BASE_URL` + `ANTHROPIC_MODEL`
- Default: direct Anthropic + `claude-haiku-4-5-20251001` + prompt caching
- Proxy mode: set `ANTHROPIC_BASE_URL=https://api.oneprovider.dev` + `ANTHROPIC_MODEL=claude-sonnet-4-6`
- oneprovider.dev double-encodes JSON responses — the `parseResponse()` shim handles this
- Versioned prompt files: `prompts/system/`, `prompts/tasks/`, loaded via `packages/ai/prompts.js`

## Video render engine selection

Engine is a **per-channel config value** in `apps/video/src/config/channels.js` — not a directory split:
- `engine: 'ffmpeg'` → `packages/render/ffmpeg` (Kokoro TTS + Whisper + Ken Burns + FFmpeg concat)
- `engine: 'remotion'` → `packages/render/remotion` (React compositions, starts with `<NewsCard/>`)
- Register the engine by importing it at the top of `apps/video/src/pipeline.js`

## MCP servers

- Root `.mcp.json`: supabase, github, context7, sequential-thinking, filesystem, memory
- Higgsfield: available automatically on claude.ai/code (OAuth MCP) — no local config needed
- Per-app `.mcp.json`: reserved for future niche servers; empty at launch

## Runtime modes

| Mode | Where | How |
|---|---|---|
| Interactive | claude.ai / Claude Code | MCP servers |
| Automated | WSL + GitHub Actions | packages/* REST calls + Supabase edge functions |

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

## Key docs

- Architecture: `docs/platform-consolidation/monorepo-structure.md`
- Master plan: `docs/master-plan.md`
- Phase plan: `docs/platform-consolidation/plan.md`
