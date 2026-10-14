import { env } from '@signal-studio/config';

const FAL_API = 'https://queue.fal.run';
const DEFAULT_MODEL = 'fal-ai/recraft-v3';

/**
 * Generate an image using fal.ai async queue (primary provider).
 * Uses Recraft V3 by default — best editorial/news style, no content policy blocks.
 *
 * @param {string} prompt
 * @param {{ model?: string, width?: number, height?: number }} opts
 * @returns {Promise<string>} public image URL
 */
export async function generateWithFal(prompt, opts = {}) {
  const model = opts.model ?? DEFAULT_MODEL;
  const { width = 1024, height = 1024 } = opts;

  // Submit to fal.ai async queue
  const submitRes = await fetch(`${FAL_API}/${model}`, {
    method: 'POST',
    headers: {
      Authorization: `Key ${env.FAL_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt, image_size: { width, height } }),
  });

  if (!submitRes.ok) {
    const text = await submitRes.text();
    throw new Error(`fal.ai submit failed ${submitRes.status}: ${text}`);
  }

  const { request_id, response_url } = await submitRes.json();

  // Poll for completion (fal queues server-side, no 429s)
  return await pollFalResult(response_url ?? `${FAL_API}/${model}/requests/${request_id}`);
}

async function pollFalResult(resultUrl, maxWaitMs = 120_000) {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const res = await fetch(resultUrl, {
      headers: { Authorization: `Key ${env.FAL_KEY}` },
    });
    if (!res.ok) throw new Error(`fal.ai poll failed ${res.status}`);
    const data = await res.json();
    if (data.status === 'COMPLETED')
      return data.output?.images?.[0]?.url ?? data.output?.image?.url;
    if (data.status === 'FAILED') throw new Error(`fal.ai generation failed: ${data.error}`);
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error('fal.ai timed out after 120s');
}
