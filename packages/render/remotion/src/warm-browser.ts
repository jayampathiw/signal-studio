// P4.2 — thin re-export so `docker/warm-remotion-browser.mjs` can trigger
// Remotion's own browser download from outside this package (a bare
// `@remotion/renderer` import from the docker script itself won't resolve —
// it's only a real dependency of *this* package's own node_modules, same
// resolution constraint `warm-kokoro-js.mjs` already works around by
// importing through `packages/providers/src/tts-kokoro-js.ts` instead of
// `kokoro-js` directly).
import { ensureBrowser } from '@remotion/renderer';

export async function warmRemotionBrowser(): Promise<void> {
  await ensureBrowser();
}
