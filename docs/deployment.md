# Deployment — `signal-studio-worker` image

> P2.6. Full production deploy (queue mode, real worker on a VPS) is P4 —
> this doc covers the image itself: what it is, how it's built, and its
> honest current state.

## What it is

A single multi-stage image (`docker/Dockerfile`) that runs the engine's `ss`
CLI (`packages/core/src/cli/ss.ts`) with every runtime dependency the
existing templates/providers/scripts actually shell out to:

- **ffmpeg/ffprobe** — the `assets` stage, `audio-mix.js`, golden tooling
- **Chromium shared libraries** (not Chromium itself — `@remotion/renderer`
  downloads its own pinned "Chrome Headless Shell" binary at runtime and
  needs these system libraries present to run it)
- **python3 + kokoro + piper-tts + openai-whisper** — `packages/media`'s
  `tts.py`, `tts_piper.py`, and `subtitles.js`'s `whisper` CLI call
- **kokoro-js's ONNX model baked in** (`docker/warm-kokoro-js.mjs` runs a
  real synthesis during build so the model is already cached in the image
  layer, not downloaded on a worker's first job)

## Build

```
docker build -f docker/Dockerfile -t signal-studio-worker:dev .
```

Two-stage: `deps` installs the full pnpm workspace once (cached separately
so an app-code-only change doesn't reinstall every dependency), then
`runtime` installs the system/python dependencies and copies both the
built `node_modules` tree and the real source on top.

## Image size — honest state against the plan's ≤3GB target

**Current measured size: 4.81GB.** Two real fixes already applied, in order:

| Fix                                              | Before → After  | Why                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------ | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CPU-only torch (`--extra-index-url .../whl/cpu`) | 9GB → 5.19GB    | The default PyPI `torch` wheel bundles full CUDA (`nvidia-cublas`, `cudnn`, `nvidia-nvjitlink`, etc.) — completely unused by a CPU-only container. This alone was the single biggest line item, found by inspecting `docker history`'s largest layers, not guessed at.                                                                                                                                          |
| Drop `faster-whisper`                            | 5.19GB → 4.81GB | Named explicitly by this plan bullet, but **nothing in this repo actually imports it** — `packages/media/subtitles.js` shells out to the `openai-whisper` CLI instead. Its `ctranslate2` dependency is real weight for zero real usage; installing it purely to satisfy the plan's literal wording works directly against this same bullet's size target. Add it back the day `subtitles.js` is migrated to it. |

**Remaining breakdown** (`docker history`, largest first):

| Layer                                                              | Size   |
| ------------------------------------------------------------------ | ------ |
| pip: `kokoro`, `piper-tts`, `openai-whisper`, `soundfile`, `numpy` | 1.69GB |
| `node_modules` (full pnpm workspace, all 18 packages)              | 1.31GB |
| pip: CPU-only `torch`                                              | 883MB  |
| apt: ffmpeg, python3, Chromium shared libs, fonts                  | 541MB  |
| node:22-bookworm-slim base + kokoro-js model bake + source         | ~385MB |

**Not chased further this pass, flagged rather than silently left alone:**

- `node_modules` includes every workspace package's dependencies —
  `apps/dashboard` (Angular + its toolchain), the retired-at-P2
  `projects/assemblex-factory/pilot/`, and every `packages/render/*` engine,
  none of which a worker running `ss` needs. Checked locally first:
  `apps/dashboard`'s own _unique_ dependencies are tiny (168K — pnpm hoists
  shared deps into one central store regardless of which workspace member
  declares them), so simply dropping its `package.json` from the deps stage
  wouldn't meaningfully shrink the image without real workspace filtering
  (`pnpm install --filter`), which needs `apps/worker` to actually exist
  (P2.5) to know what to filter _to_. Worth doing once that lands.
- `kokoro`'s python dependency chain pulls a genuinely heavy NLP stack
  (`spacy`, `thinc`, `curated-transformers`) for its English g2p pipeline —
  this is what the real PyPI `kokoro` package depends on, not something
  installed by mistake here.
- `torch` (883MB even CPU-only) is a hard requirement of `openai-whisper`,
  which is real, currently-shipping functionality
  (`packages/media/subtitles.js`) — not removable without dropping subtitle
  generation entirely.

**Net: 4.81GB against a ≤3GB target, with the reduction path already
identified** (workspace-filtered `pnpm install` once `apps/worker` exists)
but not yet executed, since that's P2.5's dependency, not this task's.

## Verified locally

Real `docker build`/`docker run` this session — not just written and assumed
correct:

- `ffmpeg -version` / `ffprobe -version` — both work
- `python3 -c "import kokoro, piper, whisper, soundfile, numpy"` — all import cleanly
- `node --version` — 22.23.2
- `ss validate <manifest.json>` (the image's actual `ENTRYPOINT`) — passes
  against a real minimal `manifest.v1` fixture
- kokoro-js real synthesis succeeds during build (the prewarm stage) — see
  `docker/warm-kokoro-js.mjs`'s own header comment for a real Node bug hit
  while getting this to run inside the container: inline `eval` scripts
  break `import.meta.dirname` resolution for dynamically-imported nested
  modules under `--experimental-strip-types`; a real file doesn't have this
  problem

**Not yet verified**: the image has never run an actual render (no template
compiler exists yet — P2.1/P2.2), and `ss run-local`/`ss run-job`/`ss
worker` don't exist yet (P2.5) — `validate` is the only real `ss`
subcommand today.

## `compose.yml`

`docker/compose.yml` defines a `worker` service using this image, with an
`api` service commented out entirely rather than pointing at a command
that doesn't exist yet (`apps/api` is P2.7). Per the plan's own P2.6
bullet, this is "used fully in P4" — right now it's a scaffold for local
`ss validate`/future `ss run-local` invocations, not a production compose
file.

## CI (`image.yml`)

Builds and pushes `ghcr.io/<owner>/signal-studio-worker:{sha,dev}` on push
to `refactor`/`main` and on tags. Exercised for real repeatedly since
P2.6 — `:dev` genuinely pulls and runs (a `:dev`-tagging bug and a
Dockerfile deps-list gap were both found and fixed doing this; see
`docs/refactor/refactor-plan.md`'s T-L gate entry). Image visibility on
GHCR: the "set to private" step's real result is unverified (see the
same P2.6 entry) — this repo being public, the package may currently be
public too.

## Secrets (P4.4, 2026-09-26)

**Real inventory, not assumed** — every secret name below was cross-checked
against actual `Deno.env.get()`/`secrets.*` usage in the real source of each
consumer (workflow YAML, edge function `index.ts`), not just listed from
`gh secret list`/`supabase secrets list`.

### Engine (this repo → Hetzner) — the two stores P4.4 targets

| Secret                                                                                                      | Store                                               | Used by                                                           |
| ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------- |
| `ENGINE_SUPABASE_URL`                                                                                       | GH Actions (`signal-studio`)                        | `run-job.yml`                                                     |
| `ENGINE_SUPABASE_SERVICE_ROLE_KEY`                                                                          | GH Actions (`signal-studio`)                        | `run-job.yml`                                                     |
| `R2_ACCESS_KEY_ID` / `R2_ACCOUNT_ID` / `R2_SECRET_ACCESS_KEY` / `R2_PUBLIC_BASE_URL` / `R2_BUCKET_RENDERED` | GH Actions (`signal-studio`), also VPS `deploy.env` | `run-job.yml`; `apps/worker`/`apps/api` on the box                |
| `ENGINE_SUPABASE_URL` / `_SERVICE_ROLE_KEY` / `_ANON_KEY`                                                   | VPS `deploy.env`                                    | `apps/worker`/`apps/api` real production processes                |
| `CORS_ORIGINS`, `LOG_JSON`, `LOG_LEVEL`                                                                     | VPS `deploy.env`                                    | `apps/api`                                                        |
| `QUEUE_DB_PASSWORD`, `GHCR_OWNER`                                                                           | VPS `.env` (compose-level)                          | `docker/compose.prod.yml`'s own interpolation                     |
| — none —                                                                                                    | Engine Supabase edge-function secrets               | **Zero edge functions exist in this project** — see cleanup below |

**Not yet in either store, real gaps**: `SENTRY_DSN`, `HEALTHCHECKS_PING_URL` (P4.3 built both wired-but-inactive; neither service has a real account yet), a working `GITHUB_PAT` (the one in root `.env` returns a real `401` — see P4.3's own tracker entry), and Facebook/YouTube publish credentials (no real page/OAuth tokens exist in this environment for the engine's own `publish-facebook`/`publish-youtube` providers).

### Legacy (still-live news/video pipelines) — out of scope to touch until P3.7

These are real, currently load-bearing, and **not part of this cleanup** —
P3.7 is where they get retired, not P4.4:

| Store                                                   | Real, in-use secrets                                                                                                                                       |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `signal-studio` GH Actions (`fetch-reels.yml` only)     | `ANTHROPIC_KEY`, `FAL_KEY`, `PEXELS_API_KEY`, `SUPABASE_KEY`/`_URL`/`_SERVICE_ROLE_KEY` (legacy project), `R2_*` (shared with engine)                      |
| Legacy Supabase edge functions (`nnxtvbolhuvihlpwppbj`) | Full per-function breakdown below                                                                                                                          |
| `reel-pipeline` GH Actions                              | `ANTHROPIC_*`, `HIGGSFIELD_AUTH_TOKEN`, `R2_*`, `SIGNAL_STUDIO_DEPLOY_KEY`, `SUPABASE_MCP_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`/`_URL`                       |
| `facebook-news-pipeline` GH Actions                     | `ANTHROPIC_*`, `CF_*`, `FAL_KEY`, `FB_*`, `GOOGLE_AI_KEY`, `NEWSAPI_KEY`, `POLLINATIONS_TOKEN`, `SIGNAL_STUDIO*_DEPLOY_KEY`, `STABILITY_KEY`, `SUPABASE_*` |

Legacy edge function → real secret usage (grepped from each function's own
`index.ts`, not assumed):

| Function             | Secrets it actually reads                                                                                                                                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `analyze-upload`     | `ANTHROPIC_BASE_URL`/`_KEY`/`_MODEL`                                                                                                                                                                                        |
| `auto-match-still`   | `ANTHROPIC_*`, `R2_*`, `SUPABASE_URL`/`_SERVICE_ROLE_KEY`                                                                                                                                                                   |
| `expand-brief`       | `ANTHROPIC_*`, `SUPABASE_URL`/`_SERVICE_ROLE_KEY`                                                                                                                                                                           |
| `generate-caption`   | `ANTHROPIC_*`, `SUPABASE_URL`/`_SERVICE_ROLE_KEY`                                                                                                                                                                           |
| `generate-image`     | `CF_ACCOUNT_ID`/`_API_TOKEN`, `FAL_KEY`, `GOOGLE_AI_KEY`, `SUPABASE_URL`/`_SERVICE_ROLE_KEY`                                                                                                                                |
| `import-shotlist`    | `SUPABASE_URL`/`_SERVICE_ROLE_KEY`                                                                                                                                                                                          |
| `post-on-this-day`   | `SUPABASE_URL`/`_SERVICE_ROLE_KEY`                                                                                                                                                                                          |
| `post-to-facebook`   | `SUPABASE_URL`/`_SERVICE_ROLE_KEY`, `FB_PAGE_ID_${country}`/`FB_ACCESS_TOKEN_${country}` (dynamic template-literal lookup, per `CLAUDE.md`'s documented per-page suffix convention — real, in use, not a static grep match) |
| `queue-on-this-day`  | `ANTHROPIC_KEY` (falls back to `ANTHROPIC_API_KEY` if unset — a real, intentional alias), `SUPABASE_URL`/`_SERVICE_ROLE_KEY`                                                                                                |
| `trigger-generation` | `GITHUB_PAT`, `SUPABASE_URL`/`_SERVICE_ROLE_KEY`                                                                                                                                                                            |
| `trigger-longform`   | `GITHUB_PAT`, `SUPABASE_URL`/`_SERVICE_ROLE_KEY`                                                                                                                                                                            |
| `upload-still`       | `R2_*`, `SUPABASE_URL`/`_SERVICE_ROLE_KEY`                                                                                                                                                                                  |

### Cleanup done this pass

- [x] **Engine dev Supabase project (`tgvugvhhtfnrzpmwkhoe`) edge-function secrets removed entirely** (`GITHUB_PAT` + all 5 `R2_*`) — the project has **zero deployed edge functions**, confirmed via `supabase functions list` before deleting anything, so these had no possible consumer.
- [x] **`signal-studio`'s own 8 orphaned GH Actions secrets deleted** (`CF_ACCOUNT_ID`, `CF_API_TOKEN`, `FB_ACCESS_TOKEN_FR`, `FB_ACCESS_TOKEN_IT`, `FB_PAGE_ID_FR`, `FB_PAGE_ID_IT`, `GOOGLE_AI_KEY`, `NEWSAPI_KEY`) — confirmed zero consumer across all 4 of this repo's own workflow files before deleting, with your go-ahead. Their real live consumers (`facebook-news-pipeline`'s own workflows, the legacy Supabase project's edge functions) are untouched.

### Real findings flagged, not acted on (live systems outside this repo)

- **A real, live gap, but currently dormant**: `fetch-reels.yml` (the old `apps/video` trigger, still technically live though secondary to `reel-pipeline`) references `secrets.PIXABAY_API_KEY`, but no such secret exists anywhere in this repo — that step silently receives an empty string if this workflow is ever actually triggered.
- **`reel-pipeline`'s own `SUPABASE_KEY` secret has zero consumer** across its 2 real workflows (`generate.yml`, `longform.yml`) — both only use `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_MCP_TOKEN`. Not touched — it's a live production trigger repo, flagged for review rather than acted on unilaterally.
- **The `facebook-news-pipeline` "missing FB secrets" mystery — resolved, not a live bug.** `publish.yml` ("Slot Publisher") references `FB_PAGE_ID_FR/IT`/`FB_ACCESS_TOKEN_FR/IT`, which don't exist in that repo's secret store — but the workflow's own header comment says why: `# Auto-posting is parked. Re-enable by uncommenting the schedule block below.` Only `workflow_dispatch` (manual) remains; nothing runs it automatically. Its script (`publish-slot.js` → `services/facebook.js`'s `postVideoToFacebook`) is a **separate, direct video-posting path** (composites an image into a real `.mp4`, posts straight to `{page-id}/videos`) distinct from the `post-to-facebook` edge function, and reads those FB env vars directly — but fails loudly (`throw new Error('Missing Facebook credentials for country: ...')`) rather than silently, so even a manual trigger today would error clearly, not post broken content. Re-enabling that schedule would need those 4 secrets added to `facebook-news-pipeline` first (same values already in the legacy Supabase project's edge-function secrets) — not done, since re-enabling a parked feature wasn't asked for.

### Rotation steps

1. **Engine secrets** (`ENGINE_SUPABASE_*`, `R2_*`): rotate in the Supabase/Cloudflare dashboards first, then update both `signal-studio`'s GH Actions secrets (`gh secret set <name> --repo jayampathiw/signal-studio`) and the VPS's `/opt/signal-studio/deploy.env` (edit directly over SSH, then `docker compose -f compose.prod.yml up -d` to pick up the change — `env_file` values aren't hot-reloaded).
2. **`QUEUE_DB_PASSWORD`**: rotating this means updating `/opt/signal-studio/.env` on the VPS **and** the running `queue-db` container's own Postgres role password (`docker exec` into it and `ALTER ROLE postgres WITH PASSWORD '...'`) — updating just the compose env without also changing it inside the already-running Postgres container will lock the worker/api out.
3. **GHCR image visibility**: still public (flagged above) — fixing this needs a PAT with package-admin rights, then `gh api --method PATCH /user/packages/container/signal-studio-worker -f visibility=private`, or the same change via the package's GitHub Settings page.

## Run job (`run-job.yml`) — real Actions cost

A real `workflow_dispatch`-triggered end-to-end run (`ss upload` × 3 →
dispatch → `ss run-job` inside this image → `delivered`, 2026-09-23,
see the plan's T-G entry) took **5m51s** wall-clock inside the
container job (`run_duration_ms: 356000` via the Actions API). Billable
minutes reported as `0` — this repo is public, and GitHub Actions
minutes are free/unlimited on public repos (same reason the two
trigger-only repos in `CLAUDE.md`'s "Trigger repos" section exist), so
there's no real cost to track here as long as this repo stays public.
