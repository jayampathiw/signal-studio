import Anthropic from '@anthropic-ai/sdk';
import { env } from '@content-platform/config';

let _client = null;

function getClient() {
  if (!_client) {
    _client = new Anthropic({
      apiKey: env.ANTHROPIC_KEY,
      ...(env.ANTHROPIC_BASE_URL && { baseURL: env.ANTHROPIC_BASE_URL }),
    });
  }
  return _client;
}

export const MODEL = env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';

// oneprovider.dev returns responses double-encoded as a JSON string instead of an object.
export function parseResponse(res) {
  return typeof res === 'string' ? JSON.parse(res) : res;
}

/**
 * Low-level wrapper: sends messages to Claude with optional prompt caching.
 * Apps and other packages should use this rather than importing the SDK directly.
 *
 * @param {{ system: import('@anthropic-ai/sdk').MessageParam[], messages: import('@anthropic-ai/sdk').MessageParam[], maxTokens?: number }} opts
 */
export async function chat({ system, messages, maxTokens = 1024 }) {
  const client = getClient();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages,
  });
  return parseResponse(response.content[0].text);
}

export default { chat, MODEL, parseResponse };
