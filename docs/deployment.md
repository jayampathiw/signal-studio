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
to `refactor`/`main` and on tags. Private image (this repo's own visibility).
Not yet exercised end-to-end (needs a real push to trigger it) — see
`docs/refactor/refactor-plan.md`'s P2.6 entry for what's verified vs. not.
