import { env } from '@signal-studio/config';

const CF_MODEL = '@cf/black-forest-labs/flux-1-schnell';

/**
 * Generate an image using Cloudflare Workers AI (free tier fallback, ~20–30 images/day cap).
 *
 * @param {string} prompt
 * @returns {Promise<string>} base64 data URL or blob URL (Cloudflare returns raw bytes)
 */
export async function generateWithCloudflare(prompt) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/ai/run/${CF_MODEL}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.CF_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Cloudflare AI failed ${res.status}: ${text}`);
  }

  // Cloudflare returns raw PNG bytes — convert to data URL for consistent interface
  const buffer = await res.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  return `data:image/png;base64,${base64}`;
}
