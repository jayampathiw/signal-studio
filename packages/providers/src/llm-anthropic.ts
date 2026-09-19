import type { ZodType } from 'zod';

import type { LlmProvider, LlmResultT } from './contracts.ts';

/**
 * P2.4 — real Anthropic implementation of LlmProvider. Reads env directly
 * (not @signal-studio/config's `env`) so this package stays usable standalone
 * without the whole platform's unrelated required vars (SUPABASE_*, FAL_KEY)
 * being validated just to make an LLM call — the same friction hit in P0.1's
 * golden-upload script.
 *
 * - Prompt caching: the system prompt is sent as a content block with
 *   `cache_control: { type: 'ephemeral' }` (Anthropic charges the cached
 *   prefix at a fraction of input-token price on a cache hit).
 * - JSON via zod: pass `schema`, and the parsed JSON is validated against it
 *   before being returned in `.json`; a validation failure throws rather than
 *   returning silently-wrong data.
 * - Proxy double-encode shim: some resold Anthropic-compatible proxies
 *   (oneprovider.dev — see packages/ai/claude.js) return the response body as
 *   a JSON-encoded string instead of a bare object. Gated behind
 *   ANTHROPIC_PROXY_DOUBLE_ENCODED=1 rather than auto-detected, since
 *   auto-detection can't tell "double-encoded" apart from "the model's actual
 *   answer happens to be a JSON string".
 */
export function createAnthropicProvider(opts?: {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}): LlmProvider {
  const apiKey = opts?.apiKey ?? process.env.ANTHROPIC_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_KEY is required (env or opts.apiKey)');
  const baseUrl = (
    opts?.baseUrl ??
    process.env.ANTHROPIC_BASE_URL ??
    'https://api.anthropic.com'
  ).replace(/\/$/, '');
  const model = opts?.model ?? process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001';
  const doubleEncoded = process.env.ANTHROPIC_PROXY_DOUBLE_ENCODED === '1';

  return {
    async complete({ system, messages, schema }): Promise<LlmResultT> {
      const res = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          ...(system && {
            system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
          }),
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      if (!res.ok) {
        throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
      }

      let body = (await res.json()) as unknown;
      if (doubleEncoded && typeof body === 'string') {
        body = JSON.parse(body);
      }

      const parsed = body as {
        content: Array<{ type: string; text?: string }>;
        usage: { input_tokens: number; output_tokens: number };
      };
      const textBlock = parsed.content.find((b) => b.type === 'text');
      const text = textBlock?.text;
      const usage = {
        inputTokens: parsed.usage.input_tokens,
        outputTokens: parsed.usage.output_tokens,
      };

      if (!schema) {
        return { text, usage };
      }

      const candidate = extractJson(text ?? '');
      if (candidate == null) {
        throw new Error(
          'llm-anthropic: schema was provided but no JSON object found in the response text',
        );
      }
      const result = (schema as ZodType).safeParse(JSON.parse(candidate));
      if (!result.success) {
        throw new Error(
          `llm-anthropic: response JSON did not match schema: ${result.error.message}`,
        );
      }
      return { text, json: result.data, usage };
    },
  };
}

// Extracted from packages/ai/claude.js's extractJson — handles a ```json fence
// or bare prose wrapping the JSON object, not just a raw JSON string.
function extractJson(text: string): string | null {
  if (!text) return null;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence ? fence[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end < 0 || end <= start) return null;
  return candidate.slice(start, end + 1).trim();
}
