import type { ImageProvider, ImageResultT } from './contracts.ts';

const FAL_API = 'https://queue.fal.run';
const DEFAULT_MODEL = 'fal-ai/recraft-v3';

/**
 * P3.4 — fal.ai image generation, ported from `packages/ai/image-gen/fal.js`
 * behind the `ImageProvider` contract. Uses Recraft V3 by default (same
 * choice as the original — best editorial/news style, no content-policy
 * blocks).
 *
 * **Real bug found and fixed while porting, not carried over**: the
 * original `fal.js` polls `response_url` expecting a `{status: 'IN_PROGRESS'
 * | 'COMPLETED' | 'FAILED', output}` wrapper — but `response_url` actually
 * returns the *raw final output* directly once ready (`{images: [...]}`,
 * no `status` field at all), confirmed against the live API. That means
 * `data.status === 'COMPLETED'` never matches, the original code spins
 * until `maxWaitMs` on *every* real call, and always throws "timed out" —
 * this is a live bug in `packages/ai/image-gen/fal.js` (used today by
 * `apps/video/src/longform/plan-references.js` and `safe-language-lint.mjs`
 * via `generateImage()`'s fal→cloudflare→google fallback chain), not
 * something introduced here. Flagged to the user directly rather than
 * silently fixed in that file, which is out of this provider's scope (and
 * gets deleted outright in P3.7 anyway). The actual status wrapper lives at
 * a separate `status_url` — this implementation polls *that*, then fetches
 * `response_url` once `status_url` reports `COMPLETED`.
 */
export function createFalImageProvider(opts?: {
  apiKey?: string;
  model?: string;
  maxWaitMs?: number;
}): ImageProvider {
  const apiKey = opts?.apiKey ?? process.env.FAL_KEY;
  if (!apiKey) throw new Error('createFalImageProvider: missing FAL_KEY');
  const model = opts?.model ?? DEFAULT_MODEL;
  const maxWaitMs = opts?.maxWaitMs ?? 120_000;

  return {
    async generate({ prompt, size }): Promise<ImageResultT> {
      const [width, height] = parseSize(size);

      const submitRes = await fetch(`${FAL_API}/${model}`, {
        method: 'POST',
        headers: { Authorization: `Key ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, image_size: { width, height } }),
      });
      if (!submitRes.ok) {
        throw new Error(`fal.ai submit failed (${submitRes.status}): ${await submitRes.text()}`);
      }
      const { request_id, status_url, response_url } = (await submitRes.json()) as {
        request_id: string;
        status_url?: string;
        response_url?: string;
      };
      const pollUrl = status_url ?? `${FAL_API}/${model}/requests/${request_id}/status`;
      const resultUrl = response_url ?? `${FAL_API}/${model}/requests/${request_id}`;

      const deadline = Date.now() + maxWaitMs;
      while (Date.now() < deadline) {
        const res = await fetch(pollUrl, { headers: { Authorization: `Key ${apiKey}` } });
        if (!res.ok) throw new Error(`fal.ai poll failed (${res.status})`);
        const data = (await res.json()) as { status: string; error?: unknown };
        if (data.status === 'COMPLETED') {
          const finalRes = await fetch(resultUrl, { headers: { Authorization: `Key ${apiKey}` } });
          if (!finalRes.ok) throw new Error(`fal.ai result fetch failed (${finalRes.status})`);
          const output = (await finalRes.json()) as {
            images?: Array<{ url: string }>;
            image?: { url: string };
          };
          const url = output.images?.[0]?.url ?? output.image?.url;
          if (!url) throw new Error('fal.ai completed with no image url in output');
          return { url };
        }
        if (data.status === 'FAILED' || data.status === 'ERROR') {
          throw new Error(`fal.ai generation failed: ${JSON.stringify(data.error)}`);
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      throw new Error(`fal.ai timed out after ${maxWaitMs}ms`);
    },
  };
}

// `aspect` (e.g. "9:16") isn't used here — fal.ai's `image_size` takes exact
// pixels, and `size` (e.g. "1024x1820") already carries that; a future
// aspect-only caller would need its own width/height table, not guessed here.
function parseSize(size?: string): [number, number] {
  if (!size) return [1024, 1024];
  const match = /^(\d+)x(\d+)$/.exec(size);
  if (!match) throw new Error(`createFalImageProvider: unparseable size "${size}", expected "WxH"`);
  return [Number(match[1]), Number(match[2])];
}
