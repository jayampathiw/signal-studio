# P2.6 — signal-studio-worker image. Runs the engine's `ss` CLI (packages/core)
# against a real project's job, with every runtime dependency the current
# templates/providers actually shell out to: ffmpeg (assets/audio-mix),
# Chromium (via @remotion/renderer, packages/render/remotion), python3
# (packages/media's kokoro/piper TTS + whisper subtitles).
#
# Built and tested locally (build + smoke test — see refactor-plan.md P2.6)
# against this Dockerfile before it was ever pushed; not yet run through the
# real image.yml GitHub Actions pipeline (needs a push to trigger it).

# ---- deps: install the full pnpm workspace once, cached separately from
# the runtime layer so an app-code-only change doesn't reinstall every dep ----
FROM node:22-bookworm-slim AS deps

# Pinned to the exact version this repo develops against (pnpm --version
# locally) — a floating `pnpm@10` resolved to a newer 10.x patch here and hit
# ERR_PNPM_LOCKFILE_CONFIG_MISMATCH against this repo's lockfile, even though
# the major version matched.
RUN corepack enable && corepack prepare pnpm@10.22.0 --activate

WORKDIR /repo
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc ./
COPY apps/dashboard/package.json apps/dashboard/package.json
COPY apps/video/package.json apps/video/package.json
COPY projects/assemblex-factory/pilot/package.json projects/assemblex-factory/pilot/package.json
COPY projects/assemblex-factory/packs/package.json projects/assemblex-factory/packs/package.json
COPY packages/ai/package.json packages/ai/package.json
COPY packages/render/core/package.json packages/render/core/package.json
COPY packages/render/ffmpeg/package.json packages/render/ffmpeg/package.json
COPY packages/render/remotion/package.json packages/render/remotion/package.json
COPY packages/media/package.json packages/media/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/publishers/package.json packages/publishers/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/providers/package.json packages/providers/package.json

# --ignore-scripts: the dashboard's Angular postinstall and any other
# package-side build scripts aren't needed for a worker image; the worker
# never runs `ng build` or similar. Real per-package build steps (none exist
# today — every package here is plain ESM/TS run directly) would need this
# revisited.
RUN pnpm install --frozen-lockfile --ignore-scripts

# ---- runtime ----
FROM node:22-bookworm-slim AS runtime

# ffmpeg: assets stage (packages/core/src/stages/assets.ts) + audio-mix
#   (apps/video/src/longform/audio-mix.js) + golden tooling.
# python3/pip: packages/media's tts.py (kokoro), tts_piper.py (piper),
#   subtitles.js (whisper CLI).
# espeak-ng: kokoro's phonemizer backend.
# Chromium shared libs (not Chromium itself — @remotion/renderer downloads
#   its own pinned "Chrome Headless Shell" binary and needs these system
#   libraries present to run it): per Remotion's own documented Docker
#   requirements (remotion.dev/docs/miscellaneous/docker).
# fontconfig: PNG/video text rendering (FactOverlay etc. self-host their own
#   TTFs under pilot/public/fonts, but fontconfig itself is still needed by
#   Chromium/Cairo to resolve font families at all).
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-pip \
    espeak-ng \
    fontconfig \
    ca-certificates \
    libnss3 \
    libdbus-1-3 \
    libatk1.0-0 \
    libgbm1 \
    libasound2 \
    libxrandr2 \
    libxkbcommon0 \
    libxfixes3 \
    libxcomposite1 \
    libxdamage1 \
    libatk-bridge2.0-0 \
    libpango-1.0-0 \
    libcairo2 \
    libcups2 \
    && rm -rf /var/lib/apt/lists/*

# Debian bookworm's system pip is externally-managed (PEP 668) — this image
# only ever runs the specific scripts above, not arbitrary host Python, so a
# venv is unnecessary ceremony; --break-system-packages is the documented
# escape hatch for exactly this "it's a container, not a shared host" case.
#
# CPU-only torch, installed *before* the packages that depend on it — pip
# won't reinstall an already-satisfying package, so this pins the dependency
# resolution before openai-whisper/kokoro get a chance to pull the default
# PyPI wheel. That default wheel bundles full CUDA (nvidia-cublas, cudnn,
# nvidia-nvjitlink, etc.) — completely unused by a CPU-only container, and
# alone blew this image from ~2GB to 9GB (measured: the pip layer was
# 6.77GB before this fix). The CPU wheel index is PyTorch's own documented
# way to get a CUDA-free build.
RUN pip3 install --break-system-packages --no-cache-dir \
    torch --extra-index-url https://download.pytorch.org/whl/cpu

# **Deliberate deviation from the plan's literal P2.6 bullet, flagged rather
# than silently resolved**: the plan names `faster-whisper` explicitly, but
# nothing in this repo actually imports it — the code that runs today
# (packages/media/subtitles.js) shells out to the `openai-whisper` CLI
# instead. faster-whisper's `ctranslate2` dependency is genuinely heavy, and
# installing an unused package works directly against this same P2.6
# bullet's other requirement (image size ≤3GB) — measured cost of adding it
# back is worth checking before doing so. Installing only what real code
# exercises (`kokoro`, `piper-tts`, `openai-whisper`) plus their real
# dependencies; `faster-whisper` can be added back the day
# `subtitles.js` is actually migrated to it.
RUN pip3 install --break-system-packages --no-cache-dir \
    kokoro \
    piper-tts \
    openai-whisper \
    soundfile \
    numpy \
    && find /usr/lib/python3*/ -name '__pycache__' -exec rm -rf {} + 2>/dev/null; \
    find /usr/local/lib/python3*/ -name '__pycache__' -exec rm -rf {} + 2>/dev/null; \
    true

WORKDIR /repo
# pnpm creates a node_modules symlink dir *inside every workspace package*
# (pointing back into the root's .pnpm virtual store), not just one at the
# repo root — copying only /repo/node_modules leaves every package unable to
# resolve its own dependencies. Copy the whole deps stage tree (package.json
# files + every node_modules dir, no app source yet) first, then lay the
# real source on top — .dockerignore excludes node_modules from this second
# COPY so it can't stomp on what deps just produced.
COPY --from=deps /repo ./
COPY . .

FROM runtime AS prewarm

# Bake the kokoro-js ONNX model (~90MB) into the image so a worker never does
# a first-run download in production. HOME=/root here (running as root),
# matching tts-kokoro-js.ts's `os.homedir()`-based cache path. Must run as a
# real file (docker/warm-kokoro-js.mjs), not `node -e` — see that file's own
# header comment for the real bug this avoids.
RUN node --experimental-strip-types docker/warm-kokoro-js.mjs

FROM prewarm AS final
ENTRYPOINT ["node", "--experimental-strip-types", "packages/core/src/cli/ss.ts"]
