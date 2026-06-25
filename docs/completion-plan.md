# Signal Studio — Completion Plan

**Status as of:** 2026-06-23 (updated session 2)
**Branch:** `rename-to-signal-studio`
**Scope:** What remains to take the Wild Capture (Wild Eye) channel from "generation code-complete" to "posting live."

---

## TL;DR

The **brief → `rendered`** generation path is genuinely code-complete and internally coherent. The orchestrator (`wild-eye-reel`) is well-specified: idempotent resume, two-phase chaining for scenario 3, hard vs. advisory vision gates, credit guard. The brief script, `briefs.js`, migrations 100–102, and channel config all line up.

The risk is **not** in generation. It's at the **`rendered` → posted boundary**, which was built against a different caption schema than the generator writes. Two real bugs block publishing, plus the pipeline has never run live.

---

## Critical findings from the review

### 1. SEO → publish field mismatch (LIVE BUG — posts empty captions)

`wild-eye-reel` Step 5 writes the caption package to the **`seo` jsonb** column as `{title, description, hashtags}`.

But the publisher reads different fields:

- `apps/video/src/publishers/facebook.js:27` reads `contentItem.ai_caption` (`{intro, question, cta}`)
- `apps/video/src/publishers/facebook.js:29` reads `contentItem.hashtags` (the `text[]` column)

**Neither is ever populated by Wild Eye.** Publishing a rendered Wild Eye reel today uploads the video with a **blank description and no hashtags**. The generation and publish halves were built against two different caption schemas.

Confirmed against schema: `supabase/migrations/100_content_items.sql:20-21` defines `ai_caption jsonb` and `hashtags text[]`; `supabase/migrations/101_wild_eye.sql:52-54` adds the separate `seo jsonb` column that the orchestrator actually writes.

### 2. 21s `rendered_video_url` is NULL by design — 21s reels are unpublishable

`wild-eye-reel` Step 6 sets `rendered_video_url` only for:

- `11s` → `scenes[0].clip_url` (single clip)
- `portrait` → `scenes[0].start_frame_url` (image is the asset)
- `21s` → **NULL** (3 clips in `scenes[0,1,2].clip_url` need stitching first)

`apps/video/src/scripts/publish.js:23` and `apps/video/src/publishers/facebook.js:23` both hard-throw on a missing `rendered_video_url`. So the entire **21s format — the "drives follows" format — cannot reach a post.** `packages/render/ffmpeg/concat.js` exists but nothing wires it to the Wild Eye scenes array.

### 3. No `wild-eye` slug → `channel_key` registry (latent coupling, low urgency)

The workflow passes `CHANNEL=wild-eye`; `reel-pipeline/scripts/runner.sh` builds a prompt referencing "channel wild-eye" and the `${CHANNEL}-reel` skill. The skill itself hardcodes `wildlife/intimacy/EN` (`.claude/skills/wild-eye-reel/SKILL.md:22`). It works for this one channel by naming coincidence, but there's no mapping layer for a second channel (sports/cartoon are already stubbed in the `generate.yml` cron comments).

### 4. Known unknowns (untested live)

- The orchestrator + cloud runner have **never executed against a live brief**.
- First run will surface real Higgsfield CLI flag names (`--end-image`, `higgsfield account balance` output parsing in `higgsfield-credit-guard`).
- Headless `--dangerously-skip-permissions` MCP behavior is unverified.
- Storyboard / start-frame prompt phrasing is unverified.
- Migrations 100/101/102 applied-state on the live DB (`nnxtvbolhuvihlpwppbj`) is asserted but not verified.

### 5. Minor (harmless, clean up opportunistically)

`apps/video/src/utils/content-item.js:24` (`platformStatusCols`) references `fb_video_id`, which does not exist in schema 100 (only `fb_post_id`). It is unused by `publish.js`, so harmless.

---

## The plan — phases

> Sequencing: code fixes first (cheap, remove guaranteed failures, no live-run dependency) → operational gate → live validation → genuinely-deferred polish.

### Phase 0 — Pre-flight verification (no code) — Task #1

- Confirm migrations 100/101/102 are applied on `nnxtvbolhuvihlpwppbj`. Query `information_schema` for the `status_note`, `scenes` (jsonb), and `format` columns + the extended status CHECK (must include `brief`/`storyboard`/`generating`/`blocked`).
- Confirm `npm install` resolves clean on Node 20 (the cloud runner does a fresh install).

### Phase 1 — Fix the SEO→publish bug (code) — Task #2

- Make `facebook.js` **SEO-aware**: read caption/hashtags from the `seo` jsonb when present, falling back to `ai_caption`/`hashtags` for legacy news/pexels rows.
- Mapping: FB `description` = `seo.description` + hashtag line; FB `title` = `seo.title`.
- Enforce the Wild Eye house rule at publish time: reel `description` must end exactly `Follow for more hidden moments from the wild.`; portraits end with a question. (Nothing enforces this today.)
- Add a smoke test asserting a Wild-Eye-shaped row produces a non-empty caption.
- **Pure code, no live-run dependency.**

### Phase 2 — 21s auto-stitch assembly in pipeline (code) — Task #3

**Decision: auto-stitch inside the pipeline** (chosen 2026-06-23).

- Add a Step 6.5 to `wild-eye-reel`: pull `scenes[0..2].clip_url`, download, concatenate via `packages/render/ffmpeg/concat.js`, upload the stitched MP4 to R2 via `packages/media/storage.js`, then write `rendered_video_url`.
- This adds **FFmpeg + R2** to the cloud run — ensure `ffmpeg` is installed in the `reel-pipeline` GitHub Actions workflow and R2 credentials are available as secrets.
- Validate that `11s` / `portrait` paths still set `rendered_video_url` as before.

### Phase 3 — Operational enablement (manual / yours) — Task #4

**signal-studio** (branch already pushed as of 2026-06-23 — remote switched to SSH):
```bash
# Open the PR:
# https://github.com/jayampathiw/signal-studio/pull/new/rename-to-signal-studio
# Merge rename-to-signal-studio → main.
```

**reel-pipeline** (repo does not yet exist on GitHub):
```bash
# 1. Create the public repo on github.com (via web UI or gh CLI):
#    Name: reel-pipeline   Visibility: public   No README

# 2. Add the remote and push:
cd ~/projects/personal/reel-pipeline
git remote add origin git@github.com:jayampathiw/reel-pipeline.git
git push -u origin main
```

**Secrets to add to `reel-pipeline` repo** (Settings → Secrets → Actions):
| Secret | Value |
|---|---|
| `ANTHROPIC_API_KEY` | Your Anthropic key |
| `SUPABASE_MCP_TOKEN` | Your Supabase personal access token |
| `HIGGSFIELD_AUTH_TOKEN` | Contents of `~/.higgsfield/credentials` |
| `SIGNAL_STUDIO_DEPLOY_KEY` | SSH private key that matches a deploy key on signal-studio |
| `R2_ACCOUNT_ID` | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | R2 access key |
| `R2_SECRET_ACCESS_KEY` | R2 secret key |
| `R2_BUCKET_RENDERED` | R2 bucket name for rendered assets |
| `R2_PUBLIC_BASE_URL` | Public base URL for the R2 bucket |

**Deploy key on signal-studio** (Settings → Deploy keys):
- Generate with: `ssh-keygen -t ed25519 -C "reel-pipeline-deploy" -f ~/.ssh/reel_pipeline_deploy`
- Add the **public** key to signal-studio as a read-only deploy key
- Add the **private** key as `SIGNAL_STUDIO_DEPLOY_KEY` secret in reel-pipeline

**Local `.env`** (only needed at publish, can defer):
```
FB_PAGE_ID_WILD_CAPTURE=<your page id>
FB_ACCESS_TOKEN_WILD_CAPTURE=<your token>
```

### Dashboard UI — Session 2 work (completed 2026-06-23)

**Reels page — page/channel strip (mirrors articles country-strip):**
- Sticky pill strip immediately below navbar: 🌿 All · 👁️ Wild Capture · 🌿 NaturePulse · 🎬 NatureFrame · 🇫🇷 France Aujourd'hui · 🇮🇹 Vivere in Italia
- Clicking a page filters the full list to that page's channel keys and adds a colored top-border accent to the content area
- Per-page accent colors: Wild Capture=#00cc70, NaturePulse=#2d9b5c, NatureFrame=#7c3aed, FR=#0055a4, IT=#009246
- Files: `apps/dashboard/src/app/reels/reel-list.component.ts`, `src/styles.css` (added `.ca-wild`, `.ca-nature`, `.ca-frame`)

**Reel detail popup — refactored to tab-based component (mirrors article-detail-dialog):**
- New file: `apps/dashboard/src/app/reels/reel-detail-dialog.component.ts`
- Status-colored gradient header (brief=indigo, generating=orange, rendered=blue, posted=green, blocked/failed=red)
- 4 tabs: **Overview** (format/scenes/style stats, slot, dates, ID), **Scenes** (full-width start frames with vision check score overlay, clip video players, per-scene status badges), **SEO** (title/description/hashtags with copy buttons + "Copy full caption package" CTA), **Pipeline** (rendered video player, Higgsfield job IDs per scene, platform status rows)
- Footer: Mark as Posted (if rendered) · Copy package (if rendered_video_url) · Delete · Close
- `reel-list.component.ts` now renders `<app-reel-detail>` instead of inline panel HTML

**Light theme contrast fixes:**
- `--ink-text-2`: #8892a8 → #5a6480
- `--ink-text-3`: #bcc4d4 → #8896b0
- `.detail-panel` shadow override for light mode
- `.ink-navbar` light-mode background

**Content item #25 created:**
- Title: "The Sound Hasn't Come Yet. She Already Knows. 👂"
- channel: `wildlife/intimacy/EN`, format: `11s`, status: `brief`
- This is the **test candidate for Phase 4** — cheapest possible run (1 scene, 1 image + 1 video credit)

### Phase 4 — First live validation run (joint — the real debugging) — Task #5

**Blocked on Phase 3**: needs `.env` populated, reel-pipeline repo live, and secrets added.

**Step-by-step runbook once Phase 3 is done:**

```bash
# 1. Create a .env from the example and fill in at minimum:
#    SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_KEY
cp .env.example .env
# (fill in the values)

# 2. Install dependencies
npm install

# 3. Create an 11s brief (cheapest path — 1 scene, 1 video credit)
node apps/video/scripts/create-brief.mjs \
  --channel "wildlife/intimacy/EN" \
  --concept "A guinea pig waking at dawn in her burrow, light filtering through roots" \
  --format 11s
# → prints { id, title, format, slot }

# 4a. Interactive run (from claude.ai/code):
#     /new-wild-reel <id>

# 4b. Cloud run (after reel-pipeline is live):
#     Go to github.com/jayampathiw/reel-pipeline → Actions → Generate Reel → Run workflow
#     Set channel=wild-eye, content_id=<id>
#     Capture the Actions log and bring it back for debugging.
```

**Known things that will need debugging on first run:**
- Higgsfield model IDs are now confirmed via MCP — see `docs/higgsfield-models.md` for the full list. Image default: `nano_banana_pro`. Video default: `seedance_2_0`. Generation goes through MCP tools (`generate_image`, `generate_video`), not the CLI binary.
- Higgsfield CLI is only used for `higgsfield account balance` (credit-guard). Verify exact output format on first run — `higgsfield-credit-guard` parses the balance number from this output.
- Headless `--dangerously-skip-permissions` + Supabase MCP: verify the MCP server starts cleanly in the runner environment
- Storyboard / start-frame prompts: expect 1-2 refinement cycles before the output meets the vision gate

**After one green 11s run:** run a 21s brief to validate the two-phase scenario-3 chain and the Phase 2 assembly script.

---

## Deferred backlog — Task #6

### Implemented (2026-06-23)

| Item | Where |
|---|---|
| Channel slug registry | `apps/video/src/config/channel-slugs.js` + `runner.sh` wired to use it |
| `tracker.mjs` performance logging | `apps/video/scripts/tracker.mjs` — writes to `content_items.metrics` + `data/reels.csv` |
| Instagram publisher | `apps/video/src/publishers/instagram.js` — Graph API reels, two-step container flow |
| YouTube publisher | `apps/video/src/publishers/youtube.js` — Data API v3, OAuth2 refresh token |
| TikTok publisher | `apps/video/src/publishers/tiktok.js` — Content Posting API, URL-based upload |
| `fb_video_id` cleanup | `apps/video/src/utils/content-item.js` — `platformStatusCols` now maps fb/ig→post_id, yt/tt→video_id |
| `metrics` DB column | Migration `20260623035547_metrics_column.sql` — applied to live DB |

### Still pending (needs architecture / out of scope for this session)

- **Human storyboard approval gate** — requires GitHub Environments (approval gate in workflow) or a Slack webhook bot. Pattern: after storyboard is generated, workflow pauses; human approves via Slack button or GitHub Environment approval; workflow resumes. Add when cadence is established enough to need it.
- **`chapter_chain` long-form format** — future channel format (10+ linked scenes). Requires: new `format` value in channels.js, new DB migration, new orchestrator skill. Scope when requested.

### New secrets needed for IG/YT/TT (add when those platforms go live for Wild Capture)

```
IG_USER_ID_WILD_CAPTURE=
IG_ACCESS_TOKEN_WILD_CAPTURE=
YT_CLIENT_ID_WILD_CAPTURE=
YT_CLIENT_SECRET_WILD_CAPTURE=
YT_REFRESH_TOKEN_WILD_CAPTURE=
TT_CLIENT_KEY_WILD_CAPTURE=
TT_CLIENT_SECRET_WILD_CAPTURE=
TT_ACCESS_TOKEN_WILD_CAPTURE=
```

---

## Recommendation

Start with **Phase 1 + Phase 2** — pure code, no dependency on pushing repos or a live run, and they remove two *guaranteed* failures. By the time the repos are pushed and secrets added (Phase 3), the publish path will work end-to-end, so the first green run (Phase 4) produces a genuinely publishable `rendered` asset instead of a broken one.

- **Phase 1 (Task #2) is a live bug, not a nicety** — any Wild Eye reel published today goes out with a blank caption.
- **Phase 2 (Task #3) unblocks the "drives follows" 21s format** — it literally cannot reach a publishable state without it.
