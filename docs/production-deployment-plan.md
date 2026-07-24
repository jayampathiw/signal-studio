# Production Deployment Plan — GitHub / Supabase / Vercel

> Written 2026-07-22. Goal: sync local implementation to production across all three systems. Every item below is a checkbox — tick it off as it's completed, including sub-items.

## Context

Local `main` was found to be 2 commits ahead of `origin/main`. A full audit confirmed production is currently healthy (no broken deployments), but local work isn't fully synced, and one deployed-vs-code gap exists in Supabase. This plan closes both.

## Phase 0 — Audit (completed 2026-07-22)

- [x] **GitHub (`origin/main`) checked**
  - [x] Confirmed local `main` is 2 commits ahead of `origin/main`, unpushed:
    - `3b5aef3` — refactor(longform): extract shared render core (render.js)
    - `a347033` — content(longform): commit source assets for 6 shipped Underdog Archive videos
  - [x] Found 1 untracked file: `docs/news-pipeline-qa.md` — to be committed separately (docs-only, unrelated to the 2 pending commits)
  - [x] Confirmed neither pending commit touches `apps/dashboard` — video-pipeline/content work only
- [x] **Supabase (project `nnxtvbolhuvihlpwppbj`) checked**
  - [x] DB migrations verified: **31/31 in sync** (`supabase migration list` — local matches remote exactly, nothing pending, no migration work needed)
  - [x] Edge functions audited: **11 of 12 deployed** — `post-on-this-day` exists in `supabase/functions/post-on-this-day` and is called from the dashboard (`apps/dashboard/src/app/core/supabase.service.ts:642`), but was never deployed — that call currently 404s in production
  - [x] Edge function secrets verified (`supabase secrets list`): all present and populated — no gap
- [x] **Vercel checked**
  - [x] Confirmed 2 linked projects: `dashboard` (`prj_5WItSbVMMhazsgQ5DzqAWbUX53yF`) and `signal-studio` (`prj_mXDYbV8WDfIyLabNbRhK7j3Yyg9y`), both git-integrated to `origin/main`, auto-deploy on push
  - [x] Checked full deployment history on both projects — every deployment is `READY`, no failed builds found
  - [x] Confirmed zero Vercel env vars are needed for `dashboard` — Supabase anon key is intentionally committed in `src/environments/environment.ts` / `environment.prod.ts` (anon key + RLS is meant to be public, not a gap)
  - [x] Ran `npm run build` locally in `apps/dashboard` — succeeds cleanly (pre-existing lint warnings only, no errors)
- [x] **GitHub Actions secrets checked (3 repos)** — `signal-studio` (private, real logic), `reel-pipeline` (public trigger repo), `facebook-news-pipeline` (public trigger repo, legacy) — all have their required secrets present per each workflow's `env:` block, no action needed
- [x] **Logged known separate issue — confirmed still live, out of scope for this pass:** `packages/publishers/facebook.js` reads `ai_caption` only; Wild Capture/reel captions are written to the `seo` jsonb field, so publishing a reel today would post a blank caption. Already documented in `CLAUDE.md` § Known gotchas. Tracked separately, not touched here.

## Phase 1 — Sync GitHub

- [x] **1.1 Commit the untracked doc**
  - [x] `git add docs/news-pipeline-qa.md`
  - [x] Commit standalone with a plain docs message (`cf07850`)
- [x] **1.2 Push to `origin/main`**
  - [x] `git push origin main` — ships all 3 commits (2 existing + the new doc commit): `446dacf..cf07850`
  - [x] Confirmed `git log origin/main..main` is empty afterward

## Phase 2 — Vercel deploy

- [x] **2.1 Deploy the `dashboard` project** — plan revised: this project is NOT on GitHub push-to-deploy (all past deployments were manual `vercel --prod` runs, confirmed via `gitDirty` flags + `claude-code agent` actor on prior deployments). Deployed manually instead.
  - [x] `vercel --prod --yes` from `apps/dashboard` → `dpl_EzngZoCpXmE8pPyLhz3WByWeMDsS`, `READY`
  - [x] Verified live at `https://dashboard-alpha-one-47.vercel.app/longform` → HTTP 200, fresh HTML (confirmed by user as the real production URL)
- [x] **2.2 `signal-studio` Vercel project — confirmed stray, skipped**
  - [x] Investigated: `framework: null`, no build config, 404s at its own domain
  - [x] User confirmed the real deployed app is the `dashboard` project (above); `signal-studio` project is not part of the real architecture and was left untouched

## Phase 3 — Supabase edge function

- [x] **3.1 Deploy the missing function**
  - [x] Ran `supabase functions deploy post-on-this-day` from repo root — deployed as version 1
  - [x] No new secrets required — existing linked project already had everything this function family uses

## Phase 4 — Verification

- [x] **4.1 Supabase checks**
  - [x] `supabase functions list` → `post-on-this-day` shows `ACTIVE` (version 1)
  - [x] `supabase migration list` → still 31/31 in sync, nothing changed
- [x] **4.2 Vercel/dashboard checks**
  - [x] Loaded `https://dashboard-alpha-one-47.vercel.app/longform` → HTTP 200, fresh build
- [x] **4.3 GitHub checks**
  - [x] `git status` → clean except this plan file itself (`docs/production-deployment-plan.md`, untracked — not committed by design, it's a live working doc)
  - [x] `git log origin/main..main` → empty, 0 commits ahead

## Status: ✅ Complete (2026-07-22)

## Notes

- No DB migration work is needed — schema is already fully in sync; this plan only adds the one missing edge function.
- No new secrets need to be created or rotated anywhere for this plan.
- Nothing here is destructive. Worst case on a bad push is a Vercel build failure, which doesn't affect the currently-serving deployment (previous `READY` build stays live) and is visible immediately in build logs.
