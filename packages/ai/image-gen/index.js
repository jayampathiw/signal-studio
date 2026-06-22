import { env } from '@signal-studio/config';
import { generateWithFal } from './fal.js';
import { generateWithCloudflare } from './cloudflare.js';
import { generateWithGoogle } from './google.js';

/**
 * Generate an image using the configured provider chain.
 * Chain: fal.ai (primary) → Cloudflare Workers AI → Google AI Studio → throw
 *
 * @param {string} prompt
 * @param {{ model?: string, width?: number, height?: number }} [opts]
 * @returns {Promise<{ url: string, provider: string }>}
 */
export async function generateImage(prompt, opts = {}) {
  const forced = env.IMAGE_PROVIDER;

  const providers = forced
    ? [{ name: forced, fn: pickProvider(forced) }]
    : [
        { name: 'fal',        fn: generateWithFal },
        { name: 'cloudflare', fn: generateWithCloudflare },
        { name: 'google',     fn: generateWithGoogle },
      ];

  let lastError;
  for (const { name, fn } of providers) {
    try {
      const url = await fn(prompt, opts);
      return { url, provider: name };
    } catch (err) {
      console.error(`[image-gen] ${name} failed:`, err.message);
      lastError = err;
    }
  }
  throw new Error(`All image providers failed. Last error: ${lastError?.message}`);
}

function pickProvider(name) {
  switch (name) {
    case 'fal':        return generateWithFal;
    case 'cloudflare': return generateWithCloudflare;
    case 'google':     return generateWithGoogle;
    default: throw new Error(`Unknown IMAGE_PROVIDER: ${name}`);
  }
}
