# signal-studio — Claude Code Guide

## What this is

Monorepo for a multi-channel AI content publishing platform, built around the new **engine** (`apps/worker` + `apps/api`, driven by `ss` — see below) and its dashboard console (`apps/dashboard`'s `/engine/*` routes). Historically this repo also hosted two legacy pipelines — **AI-generated reels** (Wild Eye, `apps/video`) and their review UI, and the review UI for **news posts** (generation itself lives in the private `signal-studio-workspace` repo, moved there in P0.5) — but both pipelines were permanently stopped and fully retired on 2026-09-28 (P3.7/P5.7): code deleted, `reel-pipeline` archived + secrets deleted, 6 orphaned Supabase edge functions deleted, and a real cross-repo dependency break in `facebook-news-pipeline`/`signal-studio-workspace` fixed at its root cause. See `docs/refactor/refactor-plan.md`'s P3.7 entry for the full detail.

**Full onboarding reference:** `docs/implementation-guide.md` — read it for architecture, data flow, schema, and workflows. This file is the quick operating guide.

## Trigger repos vs. implementation (important)

Video logic is **self-contained here**; news logic moved to `signal-studio-workspace` in P0.5. Two **public** GitHub repos exist only as free-runner automation triggers, not implementation:

- `reel-pipeline` (public) — **archived 2026-09-28.** It hosted `generate.yml`, which checked out this repo via a deploy key and ran `claude --print "run wild-eye-reel for id=N"` against `.claude/skills`/`apps/video` — both deleted from this repo the same day. All 15 of its GH Actions secrets deleted, the repo itself archived, and the `reel-pipeline CI` deploy key it used (registered on this repo) removed too.
- `facebook-news-pipeline` (public) — dual-checkouts `signal-studio-workspace` (`apps/news`, at `workspace/`) and this repo (for `packages/{ai,config,database,types}`, pinned to `ref: refactor`, at `workspace/engine/`) — note `publishers` was dropped from that list on 2026-09-28: `packages/publishers` was deleted from this repo, and the fix (removing the dependency from `signal-studio-workspace`'s `apps/news/package.json` + root `workspaces`, and deleting its one real importer — a dead script with zero actual invocations) was made directly in that private repo. **Posting itself is currently stopped** (an operational decision) — the workflows and code still exist and are technically triggerable, just not scheduled/run right now.

Public repos are used because GitHub Actions minutes are free/unlimited on them; the private logic is pulled in at runtime.

## Apps

| App       | Path              | What it does                                                      |
| --------- | ----------------- | ----------------------------------------------------------------- |
| worker    | `apps/worker/`    | The engine's job runner — `ss worker`/`ss run-job`, all templates |
| api       | `apps/api/`       | Hono API backing the dashboard + `/mcp` (P4.5)                    |
| dashboard | `apps/dashboard/` | Angular console — `/engine/*` routes only (Vercel)                |

`news` (RSS/NewsAPI → Claude captions → fal.ai images → Facebook FR/IT) lives in `signal-studio-workspace/apps/news` — see that repo, not here; posting is currently stopped (see "Trigger repos" above). `apps/video` (the old Wild Eye reel pipeline) was deleted from this repo on 2026-09-28 — permanently stopped, not moved anywhere.

## Shared packages

| Package                          | Import                      | Does                                      |
| -------------------------------- | --------------------------- | ----------------------------------------- |
| `@signal-studio/ai`              | `packages/ai/`              | Claude client + image-gen provider chain  |
| `@signal-studio/render-core`     | `packages/render/core/`     | Engine interface + `render()`             |
| `@signal-studio/render-ffmpeg`   | `packages/render/ffmpeg/`   | FFmpeg + Ken Burns + concat               |
| `@signal-studio/render-remotion` | `packages/render/remotion/` | Remotion (React/TS) compositions          |
| `@signal-studio/media`           | `packages/media/`           | Kokoro TTS, Whisper subtitles, R2 storage |
| `@signal-studio/database`        | `packages/database/`        | Supabase client + CRUD                    |
| `@signal-studio/publishers`      | `packages/publishers/`      | Facebook / IG / YT / TT                   |
| `@signal-studio/config`          | `packages/config/`          | Root .env loader + validation             |
| `@signal-studio/types`           | `packages/types/`           | Shared JSDoc typedefs                     |

## AI / Claude integration

- Client: `packages/ai/claude.js` — configurable `ANTHROPIC_BASE_URL` + `ANTHROPIC_MODEL`
- Default: direct Anthropic + `claude-haiku-4-5-20251001` + prompt caching
- Proxy mode: set `ANTHROPIC_BASE_URL=https://api.oneprovider.dev` + `ANTHROPIC_MODEL=claude-sonnet-4-6`
- oneprovider.dev double-encodes JSON responses — the `parseResponse()` shim handles this
- Versioned prompt files: `prompts/system/`, `prompts/tasks/`, loaded via `packages/ai/prompts.js`

## Job lifecycle (the engine)

The engine's content model is templates + manifests, not the old Wild Eye "channels" concept (that whole system — `apps/video/src/config/channels.js`/`channel-slugs.js`, the Higgsfield 3-tier `.claude` skills, `content_items.status` — was deleted 2026-09-28 along with `apps/video`). See `docs/implementation-guide.md` and `docs/video-generation-flow.md` for the current model: `jobs.status` lifecycle (`created → queued → dispatched → running → awaiting_review → running → delivered`, off-ramps `failed`/`blocked`), `packages/templates/*` (one per template: `clips-overlay`, `stills-kenburns`, `shorts-916`, `case-file`, `carousel`, `compilation`), and `manifest.v1` (`packages/core/src/schemas`) as the per-job config, resolved via `apps/worker/src/deps.ts`'s `TemplateHandler` registry.

## Supabase edge functions

Deno functions in `supabase/functions/*` (legacy project). **`trigger-generation`, `trigger-longform`, `expand-brief`, `import-shotlist`, `upload-still`, `auto-match-still` were deleted for real on 2026-09-28** — their only caller was the legacy dashboard's `supabase.service.ts`, which was deleted along with the Wild Eye review pages. The remaining ones (`generate-image`, `generate-caption`, `post-to-facebook`, `queue-on-this-day`, `post-on-this-day`, `analyze-upload`) back the news pipeline in `signal-studio-workspace`, which is still wired up even though posting is currently stopped. `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are auto-injected; other secrets via `supabase secrets set`.

## MCP servers

- Root `.mcp.json`: supabase, github, context7, sequential-thinking, filesystem, memory
- `apps/api`'s own `/mcp` (P4.5) — Streamable HTTP MCP server exposing the engine's `create_job`/`get_job`/`list_jobs`/`approve_gate`/`presign_upload` tools; see `docs/deployment.md` for the live connector URL/auth setup
- Per-app `.mcp.json`: reserved for future niche servers; empty at launch
- Higgsfield MCP is no longer used — it backed the now-deleted Wild Eye/`apps/video` pipeline only

## Runtime modes

| Mode                  | Where                                     | How                                                                                                |
| --------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Interactive           | claude.ai / Claude Code                   | MCP servers (root `.mcp.json`, `apps/api`'s `/mcp`); `ss` CLI by hand                              |
| Production (engine)   | Hetzner CX23 (`docker/compose.prod.yml`)  | `worker` polls the queue continuously; `api` serves the dashboard + `/mcp`, both `restart: always` |
| Automated (news)      | GitHub Actions (`facebook-news-pipeline`) | hourly cron → dual-checkout `signal-studio-workspace` + this repo — **currently stopped**          |
| ~~Automated (video)~~ | ~~GitHub Actions (`reel-pipeline`)~~      | **Retired 2026-09-28** — Wild Eye/`apps/video` deleted; `reel-pipeline` archived, secrets deleted  |

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

## Git workflow

`main` is the stable branch, only updated at real merge points; `refactor` is the active development branch. As of 2026-09-29, **`refactor` is protected — direct pushes are rejected** (`GH006`). All changes land via PR:

- Branch off `refactor`: `<type>/<short-desc>` (e.g. `feat/mcp-tls`, `fix/watchtower-filter`, `chore/grep-guard`)
- One branch per logical unit of change (a feature, a fix, a deletion pass) — not per tiny edit. A pure-docs tweak with no CI-relevant code (e.g. a tracker percentage update) can skip the branch/PR and go straight to a PR anyway, since direct push is blocked regardless
- Open a PR into `refactor`, wait for the `ci` check to pass (required — the job id in `ci.yml` is lowercase `ci`, which must match the branch protection context exactly, case-sensitive), then merge (`gh pr merge --squash --delete-branch`)
- Branches auto-delete on merge (`delete_branch_on_merge` repo setting) — no manual cleanup needed
- No required review count (solo repo) — the gate is CI passing, not approval
- Verified working end-to-end 2026-09-29: a direct push to `refactor` was rejected, and a real PR (branch → push → CI green → squash-merge → auto-delete) completed successfully

## Supabase project

Shared across all apps: `nnxtvbolhuvihlpwppbj`

## Known gotchas

- **Three remaining separate secret stores (legacy news path only, down from four)**: root `.env` (local), `signal-studio` GitHub Actions secrets, and Supabase edge-function secrets are all independent. The fourth, **`reel-pipeline` repo secrets**, was deleted along with that repo's archival on 2026-09-28 (see "Trigger repos" above). `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` are auto-injected into edge functions — don't set them manually. See `docs/deployment.md` for the engine's own (separate, simpler) secret stores.
- **`.env` is a template — many values are blank placeholders with inline comments** (e.g. `GITHUB_PAT=    # GitHub Personal Access Token`). Never blindly copy a `.env` value into a secret: a naive `grep|cut` captures the _comment_ as the value (this is what caused the dashboard 502). Strip inline comments and verify the value is non-empty / well-formed before setting.
- **oneprovider.dev double-encodes responses.** When `ANTHROPIC_BASE_URL` is the proxy, responses come back as a JSON string. Use `parseResponse()` (`packages/ai/claude.js`, still used by the news pipeline) / `getText()` (edge fns) — never read `content[0].text` raw.
- **`packages/config`'s `env.js` validation throws at import (legacy path only).** Throws if any of `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_KEY`, `FAL_KEY` is missing — but nothing in `apps/worker`/`apps/api` imports `@signal-studio/config` at all (confirmed by grep, not assumed); only `packages/ai`/`media`/`database` do, which the news pipeline still depends on. `packages/config/schema.js`'s `optional` list still has a lot of dead Wild-Eye-channel entries (`FB_PAGE_ID_NATURE_PULSE` etc.) from before 2026-09-28's deletion — harmless, just stale, not yet pruned.

## Key docs

- **Implementation guide (start here):** `docs/implementation-guide.md`
- Cloud automation / 3-tier skills: `docs/cloud-automation-workflow.md`
- Reel generation lifecycle (scenes, scenarios, status): `docs/video-generation-flow.md`
- Higgsfield model IDs + params: `docs/higgsfield-models.md`
- **Progress tracker / known bugs / roadmap:** `docs/PROJECT-STATUS.md`
- Docs index: `docs/README.md`
