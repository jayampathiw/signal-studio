// Programmatic image-quality gate — the deterministic-pipeline equivalent of the
// `image-quality-gate` Tier 2 agent (which runs as a Claude Code subagent). Sends
// the generated image + its intended prompt + house rules to a vision model and
// returns pass / retry / blocked. See docs/long-form-pipeline-plan.md §6a.
//
// Proxy reliability is imperfect, so a gate *transport* error is reported as
// verdict 'error' (caller decides — we don't let a flaky proxy hard-block a run).

import { env } from '@signal-studio/config';
import { extractJson, MODEL } from '@signal-studio/ai';

const SYSTEM = `You are an image quality gate for AI-generated video reference images.
Given an image, the prompt it was generated from, and the channel house rules, decide if it is fit to be the reusable reference for this character/location/motif across many clips.

Return ONLY JSON: { "verdict": "pass" | "retry" | "blocked", "reason": "<one sentence>" }
- pass: matches the prompt + house rules, good enough to anchor every clip that cites it.
- retry: a fixable miss (wrong framing, minor artifact, off-palette) — regenerate.
- blocked: a hard problem (wrong subject entirely, unusable, or a house-rule violation like a recognizable real face).`;

/**
 * @param {{ imageUrl: string, prompt: string, houseRules?: string, model?: string, timeoutMs?: number }} opts
 * @returns {Promise<{verdict:'pass'|'retry'|'blocked'|'error', reason:string}>}
 */
export async function gateImage({ imageUrl, prompt, houseRules = '', model = MODEL, timeoutMs = 90_000 }) {
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
      signal: ac.signal,
      body: JSON.stringify({
        model,
        max_tokens: 300,
        system: SYSTEM,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'url', url: imageUrl } },
            { type: 'text', text: `PROMPT:\n${prompt}\n\nHOUSE RULES:\n${houseRules}` },
          ],
        }],
      }),
    });
    if (!res.ok) return { verdict: 'error', reason: `gate HTTP ${res.status}` };
    const json = await res.json();
    const text = (json.content || []).find((b) => b.type === 'text')?.text ?? '';
    const parsed = JSON.parse(extractJson(text) ?? '{}');
    const verdict = ['pass', 'retry', 'blocked'].includes(parsed.verdict) ? parsed.verdict : 'error';
    return { verdict, reason: parsed.reason ?? '(no reason)' };
  } catch (e) {
    return { verdict: 'error', reason: `gate transport: ${e.message}` };
  } finally {
    clearTimeout(timer);
  }
}

export default { gateImage };
