import Anthropic from 'https://esm.sh/@anthropic-ai/sdk';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ── Wild Eye house style — embedded (mirrors apps/video/knowledge/wild-eye/house-style.md) ──

const WILD_EYE_SYSTEM = `You are the Wild Eye creative director. Wild Eye is a wildlife intimacy channel on Facebook and Instagram.

CHANNEL RULES (non-negotiable):
- Subjects: ONLY guinea pigs (cavies) until page reaches 2,000 followers
- No graphic predator kills, no human presence in frame, no captive animals
- Natural audio only — no music score, no ambient drone unless the scene explicitly earns a barely-audible tension pulse
- Every frame feels hidden, intimate — observer lens, not performer lens

FORMAT RULES:
- 11s (Formula A): 1 scene, hidden intimacy, cavy-only, confined/intimate space. scenario=3, transition="fresh"
- 21s (Formula B): 3 scenes, tension arc (calm → threat → resolution or unresolved). Scenes 1 uses scenario=2/transition="fresh"; scenes 2–3 use scenario=3/transition="chain"
- portrait: 1 scene, photorealistic single frame, extreme close-up, one dramatic light source. No video_prompt needed — set image_only=true

IMAGE PROMPT RULES:
- Flowing paragraph prose, NEVER bracketed labels like [Location] or [Subject]
- Must specify: exact location (burrow interior / open grassland / water's edge), light quality (directional + emotionally purposeful), subject detail (photorealistic fur texture, eye catching light), camera feel
- Confined space = intimacy; open space = vulnerability

SAFE LANGUAGE (required substitutions):
- "exposed roots" → "tangled root structures"
- "predawn" → "cool morning light"
- "toe pads" → "small paws"
- "nose leather" → "muzzle detail"
- "iris texture" → "eye catching light"

VIDEO PROMPT RULES:
- Action must be MICRO-events, not macro-drama ("one paw twitches and stills" not "animals sleep peacefully")
- Audio cues must be specific and layered, never vague ("layered soft breathing of four animals slightly out of sync" not "quiet sounds")
- Lighting must always be directional and emotionally purposeful
- Camera motion must be named and justified

OUTPUT: Return ONLY valid JSON — no markdown fences, no explanation, no preamble. The JSON must match this exact schema:

For 11s:
{
  "scenes": [
    {
      "scene_num": 1,
      "duration_sec": 11,
      "scenario": 3,
      "transition": "fresh",
      "image_prompt": "<flowing paragraph prose>",
      "video_prompt": {
        "composition": "<text>",
        "style": "<text>",
        "cameraMotion": "<text>",
        "subjects": "<text>",
        "action": "<text>",
        "location": "<text>",
        "audioCues": "<text>",
        "lighting": "<text>",
        "durationSec": 11
      }
    }
  ]
}

For 21s: return 3 scenes with the tension arc.
For portrait: return 1 scene with image_prompt only (no video_prompt field).`;

// ── Format helpers ────────────────────────────────────────────────────────────

function sceneCountForFormat(format: string): number {
  return format === '21s' ? 3 : 1;
}

function userPrompt(item: {
  title: string | null;
  description: string | null;
  format: string | null;
  style: string | null;
}): string {
  const concept = item.title ?? 'Untitled concept';
  const desc = item.description ? `\nAdditional context: ${item.description}` : '';
  const format = item.format ?? '11s';
  const style = item.style ?? 'intimacy';
  const sceneCount = sceneCountForFormat(format);

  return `Brief concept: "${concept}"${desc}
Format: ${format} (${sceneCount} scene${sceneCount !== 1 ? 's' : ''})
Style: ${style}

Expand this concept into ${sceneCount} scene${sceneCount !== 1 ? 's' : ''} for a Wild Eye reel. Each scene must feel like a private moment witnessed by accident — never staged. Make the image prompts rich and specific. The tension arc for the concept should feel earned, not forced.

Return ONLY the JSON — no other text.`;
}

// ── oneprovider.dev double-encoding shim (mirrors packages/ai/claude.js) ─────
// The proxy wraps the entire Anthropic response as a JSON string inside
// the SDK response object. Unwrap it before reading content[0].text.

function getText(res: any): string {
  const r = typeof res === 'string' ? JSON.parse(res) : res;
  // Find the text block by type — extended thinking models prepend a 'thinking' block
  const textBlock = Array.isArray(r.content) ? r.content.find((b: any) => b.type === 'text') : null;
  return textBlock?.text ?? r.completion ?? r.text ?? '';
}

// ── JSON extraction — handles raw JSON or accidental markdown fences ──────────

function extractJson(text: string): unknown {
  const m = text.trim().match(/\{[\s\S]*\}/);
  return JSON.parse(m ? m[0] : text.trim());
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  let body: { content_item_id?: number };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { content_item_id } = body;
  if (!content_item_id) return json({ error: 'content_item_id is required' }, 400);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Fetch the content item
  const { data: item, error: fetchErr } = await supabase
    .from('content_items')
    .select('id, title, description, format, style, status, channel_key')
    .eq('id', content_item_id)
    .single();

  if (fetchErr || !item) return json({ error: fetchErr?.message ?? 'Content item not found' }, 404);
  if (item.status !== 'brief')
    return json({ error: `Expected status 'brief', got '${item.status}'` }, 422);

  // Mark as generating so a double-click can't fire twice
  await supabase.from('content_items').update({ status: 'generating' }).eq('id', content_item_id);

  try {
    const anthropicOpts: { apiKey: string; baseURL?: string } = {
      apiKey: Deno.env.get('ANTHROPIC_KEY')!,
    };
    const baseURL = Deno.env.get('ANTHROPIC_BASE_URL');
    if (baseURL) anthropicOpts.baseURL = baseURL;
    const anthropic = new Anthropic(anthropicOpts);
    const model = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-haiku-4-5-20251001';

    const response = await anthropic.messages.create({
      model,
      max_tokens: 3000,
      system: WILD_EYE_SYSTEM,
      messages: [{ role: 'user', content: userPrompt(item) }],
    });

    const raw = getText(response);
    if (!raw) throw new Error('Empty response from Claude');

    let parsed: { scenes: unknown[] };
    try {
      parsed = extractJson(raw) as { scenes: unknown[] };
    } catch (parseErr) {
      // Store the raw output in status_note for debugging, revert to brief
      await supabase
        .from('content_items')
        .update({
          status: 'brief',
          status_note: `expand-brief parse error: ${String(parseErr)}\n\nRaw:\n${raw.slice(0, 500)}`,
        })
        .eq('id', content_item_id);
      return json({ error: 'Claude returned unparseable JSON', raw: raw.slice(0, 500) }, 500);
    }

    if (!Array.isArray(parsed.scenes) || parsed.scenes.length === 0) {
      throw new Error('No scenes in Claude response');
    }

    // Save scenes + advance status to storyboard
    const { error: updateErr } = await supabase
      .from('content_items')
      .update({
        scenes: parsed.scenes,
        status: 'storyboard',
        status_note: null,
      })
      .eq('id', content_item_id);

    if (updateErr) throw updateErr;

    return json({ scenes: parsed.scenes, status: 'storyboard' });
  } catch (err: unknown) {
    // Revert to brief so user can retry
    await supabase
      .from('content_items')
      .update({
        status: 'brief',
        status_note: `expand-brief failed: ${err instanceof Error ? err.message : String(err)}`,
      })
      .eq('id', content_item_id);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
