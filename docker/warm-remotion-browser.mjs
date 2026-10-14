// P4.2 — bakes Remotion's own headless-Chromium binary into the image build
// layer (see docker/Dockerfile's "prewarm" stage), alongside the existing
// kokoro-js model warm-up. Found real and load-bearing at P4.2's local T-L
// gate: without this, a worker container's *first* render does a ~92MB
// download of "Chrome Headless Shell" before rendering a single frame,
// eating into `renderMedia`/`renderStill`'s own 30s-default render timeout —
// on a CX22-sized box (2 vCPUs) running two real renders concurrently, this
// was enough to make both time out and fail.
//
// `ensureBrowser()` caches into `<nearest-package.json-dir>/node_modules/.remotion`
// (Remotion's own `getDownloadsCacheDir()`, keyed off `process.cwd()`), which
// resolves to `/repo/node_modules/.remotion` here since the Dockerfile's
// WORKDIR is `/repo` and that's where this script actually runs — the same
// real path `apps/worker`'s render calls use at runtime, so the cache
// populated here is the one they actually hit, not a different one.
import { warmRemotionBrowser } from '../packages/render/remotion/src/warm-browser.ts';

await warmRemotionBrowser();
// This repo's no-console rule only allows console.error, even for
// informational build-time output.
console.error('remotion headless-chromium cached');
