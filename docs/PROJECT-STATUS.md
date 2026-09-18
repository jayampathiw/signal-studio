# Signal Studio — Project Status & Roadmap

> **The single source of truth for "what's built, what's pending."**
> Supersedes the old `completion-plan.md`. Update this file at the end of any session that changes scope.
>
> **Last updated:** 2026-09-18 (§1 only — refreshed as part of the engine refactor's P0.6 doc prune; other sections carry their original dates unless noted, and haven't been re-verified this pass)
> **Branch:** `refactor` (engine refactor work); `main` for everything not yet merged from it — see `docs/refactor/refactor-plan.md` for the live tracker

---

## How to read this

| Mark | Meaning                                     |
| ---- | ------------------------------------------- |
| ✅   | Done — implemented and in the codebase      |
| 🔄   | In progress / partially done                |
| ⬜   | Pending — not started                       |
| 🐞   | Known bug — implemented but broken          |
| ⏸️   | Deferred by decision (out of scope for now) |

Status is tracked per **area**. Each area links to where the work lives. Deep detail lives in the companion docs (see `docs/README.md`).

---

## 1. At-a-glance

Per `docs/refactor/refactor-plan.md` §1, this product is **six pipelines, three orchestrators, one DB** — that framing is repeated here since it's the clearest inventory of what actually runs.

| Pipeline                                     | State | Summary                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| News                                         | ✅    | Live (cron every 30 min) from `apps/news/` in this repo; FR/IT FB tokens pending. **Not yet cut over to `signal-studio-workspace`** — P0.5 copied the code there but didn't wire secrets or a scheduled run; still running from here, unchanged                                                                                                                                                                                                                                                                                                        |
| Stock-footage reels                          | ⏸️    | Dormant, as of the original 2026-06-26 status — not touched by the refactor work to date                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Wild Eye (Higgsfield agent-driven reels)     | ✅/🐞 | Generation validated end-to-end 2026-06-26 (reel #26); cloud automation wired + validated same date. Status not re-verified since — see §5 below for the original detail. **Known bug**: SEO→publish caption mismatch still open (§6.1)                                                                                                                                                                                                                                                                                                                |
| Long-form stills documentary (Underdog)      | 🔄    | 26 scripts written, 6 videos shipped. **P0.1 (2026-09-18) rendered a real golden reference from the shipped `son-also-saves` project (scenes 1–8) and it passes** all tolerances (duration, loudness, scene cuts, frame hashes). Also surfaced a real gap: this project's `stills/` are gitignored and were never copied into `signal-studio-workspace` by P0.4 — they only survive on one machine's stray git worktree; needs a dedicated fix. Design-history docs for this pipeline were archived to `signal-studio-workspace/docs/archive/` in P0.6 |
| 9:16 Shorts                                  | 🔄/🐞 | **P0.1 (2026-09-18) rendered a real golden reference from the shipped `silenced-s1-tah-miss-EN-v2` config** — renders correctly, but **fails its own loudness check**: true peak measures −0.96 dBTP against the −1.0 dBTP ceiling, a real pre-existing mastering issue in this shipped Short's audio mix, not yet fixed                                                                                                                                                                                                                               |
| Policy File (Remotion, `case-file` template) | ✅    | **P0.1 (2026-09-18) rendered real golden references for both 16:9 and 9:16** (`mamboleo-pacific-life-settlement` case and its `-reel` variant) — both pass every tolerance                                                                                                                                                                                                                                                                                                                                                                             |

| Supporting area                                                                         | State | Summary                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Platform foundation (monorepo, packages, config)                                        | ✅    | Complete and stable                                                                                                                                                                                                                          |
| Database & migrations (live product)                                                    | ✅    | Schema applied to `nnxtvbolhuvihlpwppbj` (the product's own DB, separate from the engine refactor's own dev DB below)                                                                                                                        |
| Engine refactor — core domain + DB (P1)                                                 | ✅    | `packages/core`, `packages/db`, `packages/providers` built and tested; migration applied to a **new**, separate dev Supabase project (`signal-studio-engine-dev`) — see `docs/refactor/refactor-plan.md` P1.5. Product DB above is untouched |
| Dashboard (Angular/Vercel)                                                              | ✅    | Articles + reels, 5-tab reel editor                                                                                                                                                                                                          |
| Supabase edge functions                                                                 | ✅    | All 8 implemented & deployed                                                                                                                                                                                                                 |
| Publishing (Facebook)                                                                   | 🐞    | Works for news; **blank caption bug** for Wild Eye reels                                                                                                                                                                                     |
| Publishing (IG / YT / TikTok)                                                           | ⬜    | Stubs that throw                                                                                                                                                                                                                             |
| Future channels (Sports, Cartoon)                                                       | ⬜    | Stubbed in config + cron comments                                                                                                                                                                                                            |
| Engine refactor overall (`signal-studio` → sellable engine + `signal-studio-workspace`) | 🔄    | Phase 0 hygiene mostly done (P0.1–P0.3, P0.7 complete; P0.4/P0.5 partial — content moved, news not cut over; P0.6 in progress); Phase 1 (core domain/IR) complete. Live tracker: `docs/refactor/refactor-plan.md`                            |

**The one critical blocker before the first publishable Wild Eye reel:** the SEO→publish caption bug (§6.1). **For the refactor itself:** the git-history rewrite needed to actually shrink the engine repo below the plan's 20MB target is still pending explicit sign-off (a force-push affecting published history).

---

## 2. Platform foundation — ✅ complete

| Item                                                        | Status | Where                               |
| ----------------------------------------------------------- | ------ | ----------------------------------- |
| npm-workspaces monorepo (ESM, Node ≥20)                     | ✅     | root `package.json`                 |
| Env loader + required-key validation                        | ✅     | `packages/config/{env,schema}.js`   |
| Claude client (proxy + caching + double-encode shim)        | ✅     | `packages/ai/claude.js`             |
| Image-gen provider chain (fal → CF → Google → Pollinations) | ✅     | `packages/ai/image-gen/*`           |
| Supabase clients (anon + service)                           | ✅     | `packages/database/supabase.js`     |
| R2 storage upload                                           | ✅     | `packages/media/storage.js`         |
| FFmpeg render (concat + Ken Burns)                          | ✅     | `packages/render/ffmpeg/*`          |
| Remotion engine (NewsCard composition)                      | ✅     | `packages/render/remotion/*`        |
| Shared types                                                | ✅     | `packages/types/`                   |
| Channel registry                                            | ✅     | `apps/video/src/config/channels.js` |

---

## 3. Database & migrations — ✅ complete

| Item                                                                      | Status | Where                            |
| ------------------------------------------------------------------------- | ------ | -------------------------------- |
| News schema (articles, metrics, clustering, scoring, on-this-day)         | ✅     | `migrations/001`–`022`           |
| `content_items` table                                                     | ✅     | `migrations/100`                 |
| Wild Eye extensions (`format`, `scenes`, `slot`, `seo`, status CHECK)     | ✅     | `migrations/101`                 |
| Generic brief (nullable channel-config cols; `open_thread`→`status_note`) | ✅     | `migrations/102`                 |
| `metrics` jsonb column                                                    | ✅     | `20260623…_metrics_column.sql`   |
| `gen_config` jsonb column                                                 | ✅     | `20260625_gen_config_column.sql` |

> Migration 100/101/102 applied-state on the live DB was asserted in the original plan; re-verify with an `information_schema` query if anything looks off.

---

## 4. News pipeline — ✅ complete (tokens pending)

| Item                                      | Status | Where                                              |
| ----------------------------------------- | ------ | -------------------------------------------------- |
| RSS + NewsAPI ingestion                   | ✅     | `apps/news/src/ingestion/*`                        |
| Dedup + clustering + scoring + validation | ✅     | `apps/news/src/enrich/*`, `validators/*`           |
| Caption + image generation                | ✅     | `apps/news/src/scripts/*`, edge fns                |
| Facebook publishing (FR, IT)              | ✅     | `packages/publishers/facebook.js`                  |
| GitHub Actions cron (every 30 min)        | ✅     | `.github/workflows/fetch-news.yml`                 |
| GitHub Actions secrets                    | ✅     | set 2026-06-26                                     |
| **FB page tokens for FR/IT**              | ⏸️     | empty in `.env`/secrets — user has a separate plan |

---

## 5. Wild Capture (Wild Eye) — the AI video channel

Channel key `wildlife/intimacy/EN`. This is the flagship and the most active area.

### 5.1 Generation pipeline (brief → `rendered`) — ✅ code-complete

| Item                                                            | Status | Where                                                                |
| --------------------------------------------------------------- | ------ | -------------------------------------------------------------------- |
| Channel config (models, formats, defaults)                      | ✅     | `channels.js` `wildlife/intimacy/EN`                                 |
| Knowledge files (house-style, script-library, seo-examples)     | ✅     | `apps/video/knowledge/wild-eye/*`                                    |
| Brief creation (AI checks + INSERT)                             | ✅     | `apps/video/scripts/create-brief.mjs`, `packages/database/briefs.js` |
| Orchestrator skill (Tier 3)                                     | ✅     | `.claude/skills/wild-eye-reel/SKILL.md`                              |
| Brief skill (Tier 3)                                            | ✅     | `.claude/skills/wild-eye-brief/SKILL.md`                             |
| Credit guard (Tier 2)                                           | ✅     | `.claude/skills/higgsfield-credit-guard/SKILL.md`                    |
| Vision gate agent (Tier 2)                                      | ✅     | `.claude/agents/image-quality-gate.md`                               |
| Continuity checker (Tier 2)                                     | ✅     | `.claude/agents/continuity-checker.md`                               |
| SEO writer (Tier 2)                                             | ✅     | `.claude/agents/seo-writer.md`                                       |
| Performance analyst (Tier 2)                                    | ✅     | `.claude/agents/performance-analyst.md`                              |
| Two-phase scenario-3 (start+end chain) order                    | ✅     | `wild-eye-reel/SKILL.md` Step 4                                      |
| Safe-language lint (+ PostToolUse hook)                         | ✅     | `apps/video/scripts/safe-language-lint.mjs`                          |
| 21s auto-stitch (FFmpeg concat → R2)                            | ✅     | `apps/video/scripts/assemble-reel.mjs` (skill Step 6.5)              |
| Per-reel `gen_config` resolution (gen_config → channel default) | ✅     | skill Step 4                                                         |
| Performance tracker                                             | ✅     | `apps/video/scripts/tracker.mjs`                                     |
| Higgsfield model IDs confirmed                                  | ✅     | `docs/higgsfield-models.md`                                          |
| Interactive commands (`/new-*`, `/wild-*`, `/log-reel`)         | ✅     | `.claude/commands/*`                                                 |

### 5.2 Dashboard control surface — ✅ complete

| Item                                                    | Status | Where                                                 |
| ------------------------------------------------------- | ------ | ----------------------------------------------------- |
| Reels list + channel/page strip                         | ✅     | `apps/dashboard/src/app/reels/reel-list.component.ts` |
| 5-tab reel editor (Overview/Scenes/Config/SEO/Pipeline) | ✅     | `reel-detail-dialog.component.ts`                     |
| "Generate Scene Prompts" → expand-brief                 | ✅     | edge fn `expand-brief`                                |
| "Run Generation Pipeline" → trigger-generation          | ✅     | edge fn `trigger-generation`                          |
| Config tab → `gen_config` write                         | ✅     | Config tab                                            |
| Inline safe-language lint suggestions                   | ✅     | `UNSAFE_TERMS` in component                           |

### 5.3 Cloud automation (`reel-pipeline` trigger) — ✅ wired + validated

Provisioned end-to-end 2026-06-26. Started from a dashboard **502**; root-caused and fixed across Supabase secrets, reel-pipeline secrets, and two `reel-pipeline` code bugs. The cloud agent now authenticates and generates.

| Item                                                           | Status | Notes                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `trigger-generation` dispatches to `jayampathiw/reel-pipeline` | ✅     | edge fn implemented                                                                                                                                                                                                                                      |
| `reel-pipeline` public repo + `generate.yml` workflow          | ✅     | both exist; workflow accepts `channel` + `content_id`                                                                                                                                                                                                    |
| `SIGNAL_STUDIO_DEPLOY_KEY` on reel-pipeline                    | ✅     | set 2026-06-23                                                                                                                                                                                                                                           |
| Supabase `GITHUB_PAT` secret                                   | ✅     | Re-set 2026-06-26 with the gh token; dispatch confirmed working (200 OK, run `28244323043` triggered).                                                                                                                                                   |
| `reel-pipeline` secret `ANTHROPIC_API_KEY` + proxy forwarding  | ✅     | Set 2026-06-26 (proxy key, `api.contactboxtools.me`). `generate.yml` patched to forward `ANTHROPIC_BASE_URL` + `ANTHROPIC_MODEL` (commit `b564b66`). **Proxy validated** — the cloud `claude` agent authenticated and ran (reached `generating`).        |
| `reel-pipeline` secret `SUPABASE_MCP_TOKEN`                    | ✅     | Set 2026-06-26 from `.env` (`sbp_…`).                                                                                                                                                                                                                    |
| `reel-pipeline` secret `HIGGSFIELD_AUTH_TOKEN`                 | ✅     | Set 2026-06-26 from `~/.config/higgsfield/credentials.json` (full JSON: access + refresh tokens).                                                                                                                                                        |
| `reel-pipeline` secrets `R2_*` (×5)                            | ✅     | Set 2026-06-26 from `.env`.                                                                                                                                                                                                                              |
| 🐞 `runner.sh` `$GITHUB_WORKSPACE` bug                         | ✅     | Fixed in commit `b564b66` (backslash made Node import the literal path → "Cannot find module" → garbled prompt).                                                                                                                                         |
| 🐞 Higgsfield creds path/format                                | ✅     | Fixed in commit `4fdc7d0`. CLI v0.2.x reads `~/.config/higgsfield/credentials.json` (JSON), **not** `~/.higgsfield/credentials` (raw token) as the workflow originally wrote.                                                                            |
| **First live end-to-end generation run**                       | ✅     | **Interactive (reel #26):** credit-guard → start frame → vision gate 8/10 → 11s video w/ audio → SEO → rendered. **Cloud (reel #27):** dispatched, agent authenticated, claimed the row → `generating` (full green render in flight at time of writing). |

**Cloud dispatch history 2026-06-26:**

- Run `28244323043` (#27): **failed** at _Run generation_ — empty `ANTHROPIC_API_KEY`/`SUPABASE_MCP_TOKEN`/`HIGGSFIELD_AUTH_TOKEN` + the `runner.sh` `$GITHUB_WORKSPACE` bug. This run produced the diagnosis.
- Run `28247384659` (#27): after all fixes — passed every setup step incl. **Restore Higgsfield auth** + **Determine channel**, reached **Run generation**; agent authenticated (proxy ✓), credit-guard ran, claimed #27 → `generating`. The cloud path is operational.

### 5.4 Publishing — 🐞 / ⏸️

| Item                                    | Status | Notes                                             |
| --------------------------------------- | ------ | ------------------------------------------------- |
| FB publish for Wild Eye reels           | 🐞     | **blank caption bug** — see §6.1                  |
| `rendered_video_url` for 11s / portrait | ✅     | set by skill Step 6                               |
| `rendered_video_url` for 21s            | ✅     | via `assemble-reel.mjs` (verify on first 21s run) |
| `FB_ACCESS_TOKEN_WILD_CAPTURE`          | ⏸️     | page id pre-filled; token pending (separate plan) |

---

## 6. Known bugs — must fix

### 6.1 🐞 SEO → publish caption mismatch (blocks the first publishable reel)

`wild-eye-reel` writes the caption to the **`seo` jsonb** (`{title, description, hashtags}`), but `packages/publishers/facebook.js` reads `ai_caption` (`{intro, question, cta}`) + the `hashtags` column. **Confirmed still present** (`facebook.js` has zero references to `seo`). A published Wild Eye reel goes out with a **blank caption**.

**Fix:** make `facebook.js` SEO-aware — read caption/hashtags from `seo` when present, fall back to `ai_caption`/`hashtags` for legacy news rows. Enforce the Wild Eye CTA at publish time (reels end exactly `Follow for more hidden moments from the wild.`; portraits end with a question). Keep `apps/video/test/caption-smoke.mjs` green.

### 6.2 🐞 (latent) stale schema reference

`apps/video/src/utils/content-item.js` `platformStatusCols` references `fb_video_id`, which does not exist (only `fb_post_id`). Harmless (unused by `publish.js`) — clean up opportunistically.

---

## 7. Pending / roadmap

### 7.1 Next milestone — first live validation run

1. Confirm `reel-pipeline` repo + `generate.yml` + secrets + deploy key (§5.3).
2. Use the cheapest path: an **11s** brief (1 scene = 1 image + 1 video credit).
3. Dispatch via dashboard "Run Generation Pipeline" (or GitHub Actions → Run workflow).
4. Capture the Actions log; debug the known first-run unknowns:
   - `higgsfield account balance` output parsing (credit-guard).
   - Headless `--dangerously-skip-permissions` + Supabase MCP startup.
   - Storyboard / start-frame prompt phrasing vs the vision gate (expect 1–2 refinement cycles).
5. After one green 11s run, validate a **21s** scenario-3 chain + `assemble-reel.mjs`.

### 7.2 Deferred features (designed, not built)

| Feature                                       | Status             | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Human storyboard approval gate                | ⏸️                 | GitHub Environments approval or Slack webhook; pause after storyboard, resume on approval                                                                                                                                                                                                                                                                                                                                                     |
| `chapter_chain` long-form format              | ⬜                 | 10–300+ linked clips in chapters + narration + auto FFmpeg assembly; needs `target_duration_sec` + `chapters` jsonb columns + new orchestrator skill (`docs/video-generation-flow.md §1.4`)                                                                                                                                                                                                                                                   |
| IG / YT / TikTok publishers                   | ⬜                 | `packages/publishers/{instagram,youtube,tiktok}.js` throw; richer drafts under `apps/video/src/publishers/`                                                                                                                                                                                                                                                                                                                                   |
| Sports channel                                | ⬜                 | stubbed in `channel-slugs.js` + cron comments                                                                                                                                                                                                                                                                                                                                                                                                 |
| Cartoon channel                               | ⬜                 | stubbed                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Underdog Archive — Spanish (Mexico) narration | ✅ voice finalized | `football/documentary/es-MX` channel, `narrationProvider: 'piper'`, voice `es_MX-claude-high` (Kokoro's Spanish is Castilian-only, no LatAm accent). Piper wired as second TTS engine (`packages/media/tts_piper.py`, `piper-tts` in `requirements.txt`). Tried and rejected as too flat: es-AR (`es_AR-daniela-high`), es-MX `ald-medium`. No `platforms`/publishing creds wired yet — that's the next step before this channel can go live. |

### 7.3 New secrets needed when those go live

```
# Wild Capture on IG/YT/TT
IG_USER_ID_WILD_CAPTURE=        IG_ACCESS_TOKEN_WILD_CAPTURE=
YT_CLIENT_ID_WILD_CAPTURE=      YT_CLIENT_SECRET_WILD_CAPTURE=   YT_REFRESH_TOKEN_WILD_CAPTURE=
TT_CLIENT_KEY_WILD_CAPTURE=     TT_CLIENT_SECRET_WILD_CAPTURE=   TT_ACCESS_TOKEN_WILD_CAPTURE=
```

---

## 8. Adding a new AI-video channel (reuse checklist)

Tier 1 & Tier 2 require **zero changes** (`docs/cloud-automation-workflow.md §10`):

1. ⬜ Write `<channel>-brief` + `<channel>-reel` skills (Tier 3) in `.claude/skills/`.
2. ⬜ Add `apps/video/knowledge/<channel>/{house-style,script-library,seo-examples}.md`.
3. ⬜ Register the channel in `channels.js` and the slug in `channel-slugs.js` (+ the `trigger-generation` `CHANNEL_SLUG` map).
4. ⬜ Add a migration only if new columns are needed (rare — schema is generic).
5. ⬜ Add cron entries to `reel-pipeline/generate.yml`; test with `workflow_dispatch` first.

---

## 9. Operational state (secrets & repos)

| Store                                       | Status | Notes                                                                                                                                                                                                  |
| ------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Root `.env`                                 | 🔄     | core keys present; FB FR/IT/Wild Capture tokens pending                                                                                                                                                |
| GitHub Actions secrets (`signal-studio`)    | ✅     | 18 secrets set 2026-06-26 (FB FR/IT empty by choice)                                                                                                                                                   |
| Supabase edge-function secrets              | ✅     | incl. `GITHUB_PAT` (critical for trigger-generation)                                                                                                                                                   |
| `reel-pipeline` repo + secrets + deploy key | ✅     | All 10 secrets set 2026-06-26 (`SIGNAL_STUDIO_DEPLOY_KEY`, `ANTHROPIC_API_KEY`/`BASE_URL`/`MODEL`, `SUPABASE_MCP_TOKEN`, `HIGGSFIELD_AUTH_TOKEN`, `R2_*`). 2 code fixes pushed (`b564b66`, `4fdc7d0`). |

---

## 10. Milestone history

- **2026-06-21** — Wild Eye integration: channel config, migration 101, knowledge files migrated from `temp/Wild Eye/`.
- **2026-06-22** — Cloud automation architecture finalised (3-tier skills).
- **2026-06-23** — Dashboard reels UI (tab-based detail), channel slug registry, tracker/IG/YT/TT scaffolds, `metrics` column.
- **2026-06-25** — Per-reel `gen_config` + dashboard Config tab; model wiring.
- **2026-06-26** — GitHub + Supabase secrets configured; consolidated documentation (`implementation-guide.md`, this status doc, `docs/README.md`).
- **2026-06-26** — **First reel generated end-to-end (interactive):** reel #26 "She Stopped Mid-Step. The Mist Kept Moving. 🌫️" (11s) — `nano_banana_2` start frame → vision gate 8/10 → `seedance_2_0_mini` 11s/720p video with natural audio → SEO → `rendered`. Validated the full creative pipeline.
- **2026-06-26** — **Cloud automation wired + validated.** Diagnosed the dashboard 502 (Supabase `GITHUB_PAT` held a `.env` comment), set all 10 `reel-pipeline` secrets, fixed 2 `reel-pipeline` bugs (`runner.sh` `$GITHUB_WORKSPACE`; Higgsfield creds path/format — commits `b564b66`, `4fdc7d0`), and forwarded the Anthropic proxy. Cloud run `28247384659` (#27) authenticated and reached `generating` — the `reel-pipeline` path is operational and the dashboard "Run Generation Pipeline" button works.

---

_Keep §1 (at-a-glance) and §6 (bugs) current — they are what a returning developer reads first._
