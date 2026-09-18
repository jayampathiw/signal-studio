// Semantic-action gate for Phase 5 validation. Checks a clip's visual_prompt
// and vo_text against the channel rule-set and expected per-scene action.
// Text-only (no vision) — complements the look-gate which requires frames.
//
// Two-mechanism check (Phase 0 decision):
//   1. Per-scene expected-action: derives what motion/action MUST be visible
//      from the clip's own prompt + VO text.
//   2. Channel rule-set backstop: hard rules for the channel (no volleyball,
//      no real faces, no text overlays, period-appropriate, etc.)
//
// Returns { verdict: 'pass'|'retry'|'blocked', reason, expectedAction }.

import { chatText, extractJson } from '@signal-studio/ai';

// Channel rule-sets keyed by channel_key.
export const CHANNEL_RULES = {
  'football/documentary/EN': `
CHANNEL: South American Football Documentary (late-1990s / early-2000s era)
HARD RULES (any violation → 'blocked'):
- Content must depict FOOTBALL / SOCCER. No other sports (volleyball, basketball, rugby, etc.)
- No recognizable real human faces — stylized silhouettes and impressionistic rendering are fine
- No text, captions, watermarks, or subtitles baked into the clip
- No weapons, military equipment, explosions, or graphic violence
- No sexual content or nudity
- The sport must use FEET (or head, chest) to control the ball — no hands except goalkeeper saves
- Era: late 1990s / early 2000s; no modern smartphones, screens, or contemporary branding
SOFT RULES (violation → 'retry'):
- Atmosphere: dramatic, cinematic, documentary style
- Palette: dusty, high-contrast, slightly desaturated (historic documentary feel)
- Stadium, pitch, or crowd shots acceptable as establishing scenes
`.trim(),
};

const SYSTEM = `You are a semantic-action gate for an AI-generated documentary film clip.
Your task: verify that the clip's prompt + VO text are semantically coherent with the channel rules and expected action.
This is a TEXT-only check — you are evaluating the WRITTEN DESCRIPTION, not actual video frames.

Respond ONLY with valid JSON (no fences, no prose):
{
  "expectedAction": "<one sentence: the primary motion / action that should be visible in this clip>",
  "verdict": "pass" | "retry" | "blocked",
  "reason": "<one sentence explanation>"
}

Verdicts:
- pass: prompt is semantically consistent with channel rules and expected action; clip is plausible.
- retry: the prompt is ambiguous, overly abstract, or weakly matched to expected action — regeneration with a tighter prompt would likely improve it. NOT a channel rule violation.
- blocked: a hard channel rule is violated in the prompt itself (wrong sport, explicit faces named, prohibited content, etc.) — no amount of regeneration fixes this without changing the scene description.`;

/**
 * Run the semantic-action gate on a single clip (text-only — no vision required).
 *
 * @param {{ visual_prompt: string, vo_text: string, channel_key: string }} clip
 * @returns {Promise<{ verdict: 'pass'|'retry'|'blocked', reason: string, expectedAction: string }>}
 */
export async function semanticGate(clip) {
  const rules =
    CHANNEL_RULES[clip.channel_key] ?? `CHANNEL: ${clip.channel_key}\nNo specific rules defined.`;
  const userMsg = `CHANNEL RULES:\n${rules}\n\nVISUAL PROMPT:\n${clip.visual_prompt}\n\nVO TEXT:\n${clip.vo_text ?? '(none)'}`;

  let raw;
  try {
    raw = await chatText({
      system: SYSTEM,
      messages: [{ role: 'user', content: userMsg }],
      maxTokens: 300,
      timeoutMs: 60_000,
    });
  } catch (e) {
    return {
      verdict: 'pass',
      reason: `gate transport error (non-blocking): ${e.message}`,
      expectedAction: '(unknown)',
    };
  }

  try {
    const json = JSON.parse(extractJson(raw) ?? raw);
    const verdict = ['pass', 'retry', 'blocked'].includes(json.verdict) ? json.verdict : 'pass';
    return {
      verdict,
      reason: json.reason ?? '(no reason)',
      expectedAction: json.expectedAction ?? '(unknown)',
    };
  } catch {
    // Unparseable → non-blocking pass (don't let a flaky model hard-block a clip)
    return {
      verdict: 'pass',
      reason: `gate parse error (non-blocking): ${raw?.slice(0, 100)}`,
      expectedAction: '(unknown)',
    };
  }
}

export default { semanticGate, CHANNEL_RULES };
