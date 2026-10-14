import Anthropic from '@anthropic-ai/sdk';
import { env } from '@signal-studio/config';

let _client = null;

function getClient() {
  if (!_client) {
    _client = new Anthropic({
      apiKey: env.ANTHROPIC_KEY,
      ...(env.ANTHROPIC_BASE_URL && { baseURL: env.ANTHROPIC_BASE_URL }),
      // Bound proxy stalls: fail a request after 2 min rather than hanging, and
      // cap retries so a flaky proxy doesn't silently backoff for minutes.
      timeout: 120_000,
      maxRetries: 1,
    });
  }
  return _client;
}

export const MODEL = env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';

// oneprovider.dev returns responses double-encoded as a JSON string instead of an object.
export function parseResponse(res) {
  return typeof res === 'string' ? JSON.parse(res) : res;
}

export function extractJson(text) {
  if (!text) return null;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence ? fence[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end < 0 || end <= start) return null;
  return candidate.slice(start, end + 1).trim();
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
  // Thinking-enabled models (e.g. opus) return a `thinking` block first; the
  // answer is the first `text` block, not necessarily content[0].
  const textBlock = response.content.find((b) => b.type === 'text') ?? response.content[0];
  // parseResponse unwraps oneprovider's double-encoded JSON string. Guard it:
  // some models wrap output in ```json fences or add prose, which is not a bare
  // JSON string — return the raw text so callers can extractJson() it.
  try {
    return parseResponse(textBlock.text);
  } catch {
    return textBlock.text;
  }
}

/**
 * fetch-based transport, bypassing the Anthropic SDK. The SDK stalls against
 * some reseller proxies on larger requests where a plain fetch succeeds; batch
 * pipeline code (long-form planning, validation) should use this for reliability.
 * Returns the first text block's raw string (fences/prose intact — caller parses).
 *
 * @param {{ system: string, messages: Array<{role:string,content:string}>, maxTokens?: number, model?: string, timeoutMs?: number }} opts
 */
export async function chatText({
  system,
  messages,
  maxTokens = 4096,
  model = MODEL,
  timeoutMs = 120_000,
}) {
  const base = (env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, '');
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/v1/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': env.ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages }),
      signal: ac.signal,
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const json = await res.json();
    const textBlock = (json.content || []).find((b) => b.type === 'text');
    return textBlock?.text ?? '';
  } finally {
    clearTimeout(timer);
  }
}

export default { chat, chatText, MODEL, parseResponse, extractJson };
