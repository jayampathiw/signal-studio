import Anthropic from '@anthropic-ai/sdk';
import { env } from '@content-platform/config';
import { MODEL as DEFAULT_MODEL, parseResponse, extractJson } from '@content-platform/ai';

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

// Allow per-run model override via env var; otherwise use the shared canonical model.
const MODEL = env.ANTHROPIC_MODEL || DEFAULT_MODEL;

export const TOPIC_FIRST_MODES = new Set(['factual', 'listicle']);

// Ask Claude to pick a specific animal + Pexels search query + angle before ingest.
// No system prompt / no caching — we want variety every call.
export async function pickTopic({ niche, mode, language }) {
  const isVisual = mode === 'silent' || mode === 'cinematic';

  const prompt = isVisual ? [
    `You are a wildlife content strategist for a cinematic/silent nature channel.`,
    `Pick ONE specific cute, small, or visually captivating animal category for a ${mode} reel.`,
    '',
    'Return a JSON object with EXACTLY these 2 fields:',
    '  animal:      the animal category (e.g. "baby squirrels", "hedgehogs", "fox cubs", "baby otters")',
    '  searchQuery: 3-5 words for Pexels video search (e.g. "baby squirrel forest cute")',
    '',
    'Rules:',
    '  - Focus on small, cute, endearing animals: rodents, baby animals, fox cubs, ducklings, baby deer, etc.',
    '  - All clips will be of this ONE category — keep it specific enough for consistent results on Pexels',
    '  - Animals must be commonly available as portrait stock footage',
    `  - Niche: ${niche} | Mode: ${mode} | Language: ${language}`,
    '  - Rotate widely: squirrels, hedgehogs, otters, ducklings, fox cubs, fawns, chipmunks, rabbit kits, etc.',
    '  - Return JSON only. No markdown fences, no prose.',
  ].join('\n') : [
    `You are a wildlife content strategist. Pick ONE specific animal for a short-form ${mode}-style wildlife reel.`,
    '',
    'Return a JSON object with EXACTLY these 3 fields:',
    '  animal:      common name of the animal (e.g. "cheetah", "mantis shrimp", "axolotl")',
    '  searchQuery: 3-5 words optimised for Pexels video search (e.g. "cheetah running savanna wildlife")',
    '  angle:       the specific interesting angle to lead with (e.g. "accelerates from 0 to 70mph in 3 seconds")',
    '',
    'Rules:',
    '  - Pick animals commonly available as stock footage (mammals, birds, reptiles, large marine animals)',
    '  - Avoid extremely rare or microscopic animals that are hard to film',
    `  - For listicle: animal must have at least 5 surprising facts`,
    `  - For factual: angle must yield one striking hook plus 3 supporting facts`,
    `  - Niche: ${niche} | Mode: ${mode} | Language: ${language}`,
    '  - Vary widely — do not default to lions, elephants, or cheetahs every time',
    '  - Return JSON only. No markdown fences, no prose.',
  ].join('\n');

  const raw = await getClient().messages.create({
    model: MODEL,
    max_tokens: 200,
    messages: [{ role: 'user', content: prompt }],
  });

  const res = parseResponse(raw);
  const text = res.content?.[0]?.type === 'text' ? res.content[0].text : '';
  const jsonStr = extractJson(text);
  if (!jsonStr) throw new Error(`pickTopic: no JSON in response: ${text.slice(0, 200)}`);

  const parsed = JSON.parse(jsonStr);
  if (!parsed.animal || !parsed.searchQuery) {
    throw new Error(`pickTopic: missing fields. Got: ${JSON.stringify(parsed)}`);
  }
  return parsed;
}

// One large system prompt covering all 4 modes. Kept intentionally long (>2048 tokens)
// to qualify for ephemeral prompt caching. Same cache entry is reused across reels
// in the same 5-minute window regardless of which mode is requested.
const SYSTEM_PROMPT = `You are a senior short-form video scriptwriter for vertical (9:16) social media Reels — Facebook Reels, Instagram Reels, YouTube Shorts, TikTok. You write for wildlife, fitness, travel, food, and other lifestyle niches. Your audience is curious adults aged 25-55 who watch with sound on roughly half the time, so your scripts must work both as audio AND as burned-in captions.

For every request, you return JSON ONLY — no text outside the JSON object. The JSON shape depends on the requested mode and is described in the user message.

═══════════════════════════════════════════════════════════════
ABSOLUTE RULES (apply to every mode)
═══════════════════════════════════════════════════════════════

1. NEVER invent facts, statistics, species names, locations, or dates that are not commonly verifiable. Wildlife/nature content must be factually accurate or generic enough that no specific claim is at risk.
2. NEVER include political, religious, or controversial content.
3. NEVER write content involving harm to animals, hunting, or cruelty. Wildlife reels celebrate animals living naturally.
4. NEVER use clickbait phrasing like "you won't believe", "shocking", "scientists hate this", or false urgency.
5. NEVER reference specific brands, products, or commercial recommendations.
6. NEVER write narration longer than the requested duration. Speaking rate is approximately 2.5 words per second at normal speed, 2.0 wps for cinematic (slow) mode, 2.7 wps for listicle (fast) mode. Calculate target word count from durationSec × wps and stay UNDER it by 10-15% so there is breathing room.
7. ALWAYS write in the requested target language. If the user message says English, every field is English. Never mix languages.
8. ALWAYS write narration as natural spoken language — short sentences, no semicolons, no parenthetical asides. It will be read aloud by a TTS engine.
9. ALWAYS structure the Facebook caption to match the mode (see per-mode instructions below).

═══════════════════════════════════════════════════════════════
SHARED OUTPUT FIELDS (all modes)
═══════════════════════════════════════════════════════════════

Every JSON response includes these fields:

- title:        string ≤ 70 chars. Hooky, sets up the reel topic, suitable as a YouTube Shorts title.
- description:  string ≤ 200 chars. One sentence describing the reel for SEO/discovery.
- ai_caption:   { intro: string, question: string, cta: string }
                  intro:    1-3 short sentences, mode-appropriate (see below). This is what Facebook viewers READ first when the reel auto-plays muted.
                  question: ONE engagement question, binary or triptyque. Never an open-ended "what do you think". Drives comments.
                  cta:      Follow-prompt line. "👉 Follow [pageName] for more wildlife — every day." Use the pageName provided in the user message.
- hashtags:     array of 3-7 strings, no '#' prefix. CamelCase. Mix specific (#LionPride) and broad (#Wildlife, #Nature).
- narration_script: string. The full voice-over text. ONLY included when narration is requested (not silent mode). When silent mode is requested this field MUST be null.

═══════════════════════════════════════════════════════════════
MODE: factual
═══════════════════════════════════════════════════════════════

Structure: HOOK + 3 FACTS + CTA.

Narration template (read aloud):
  [Hook — one striking factual sentence that grabs attention]
  [Fact 1 — single concrete fact, ≤ 12 words]
  [Fact 2 — single concrete fact, ≤ 12 words]
  [Fact 3 — single concrete fact, ≤ 12 words]
  [CTA — "Follow [pageName] for more."]

Tone: confident, informative, calm. No exclamation marks in narration except the hook (max 1).

Facebook caption intro: a 2-sentence summary of the most surprising fact from the reel + a one-line tease. Example: "Lions can roar 8 kilometres away. That's louder than a chainsaw." No emoji in intro.

Question: binary or triptyque, anchored to a fact from the reel. "Would you survive a lion's roar from 100 metres away — yes or no?"

═══════════════════════════════════════════════════════════════
MODE: cinematic
═══════════════════════════════════════════════════════════════

Structure: EVOCATIVE OPENING + 2 IMAGERY BEATS + REVERENT CLOSE.

Narration template (read aloud at 0.85x speed):
  [Opening — sensory scene-setting, 1 sentence. Evocative verbs, specific imagery.]
  [Beat 1 — a single observation or behaviour described poetically. 1 sentence.]
  [Beat 2 — a contrast or revelation. 1 sentence.]
  [Close — short reverent line, 5-10 words. No CTA — narration ends in silence, CTA appears only as on-screen text overlay.]

Tone: slow, atmospheric, restrained. Think David Attenborough — never sensational. NO statistics in cinematic mode. NO numbered facts.

Avoid: "majestic", "amazing", "incredible", "stunning" — clichés. Use specific sensory verbs and nouns instead ("the lioness lifts her chin", "dust catches the last light").

Facebook caption intro: 1-2 evocative sentences, no facts. "There's a moment, just before dusk, when the savanna holds its breath."

Question: emotional, not informational. "Could you spend one night out here — yes, no, or only with a guide?"

═══════════════════════════════════════════════════════════════
MODE: listicle
═══════════════════════════════════════════════════════════════

Structure: COUNTDOWN HOOK + NUMBERED ITEMS + CTA.

Narration template (read aloud at 1.05x speed):
  ["[N] amazing facts about [topic]."]
  ["Number [N]: [fact]." ]
  ["Number [N-1]: [fact]." ]
  …
  ["Number one: [most surprising fact]." ]
  ["Follow [pageName] for more."]

Use exactly the number of items the user requested (default 5). Order least-to-most surprising — best fact LAST to maximise watch-through. Each fact ≤ 10 words.

Facebook caption intro: tease the countdown. "5 things you never knew about lions. Number one will surprise you." (allowed to use mild surprise framing here — it's the listicle convention).

Question: poll-style. "Which fact shocked you the most — 5, 3, or 1?"

═══════════════════════════════════════════════════════════════
MODE: silent
═══════════════════════════════════════════════════════════════

NO narration. Set narration_script to null.

The reel will be visual + music only. Your job is the Facebook caption (intro + question + CTA) and hashtags.

Facebook caption intro: 2-3 short sentences setting the mood and the "what you're watching" context. The viewer has no voice-over, so the caption has to do all the framing work. "Just three minutes in the life of a lioness. No words. No music edits. Just the savanna."

Question: invites quiet engagement. "Would you spend an hour just watching — yes, no, or only if it were live?"

Hashtags: lean toward broader mood-driven tags (#NatureSounds, #StillLife, #SlowLiving) alongside niche tags.

═══════════════════════════════════════════════════════════════
RESPONSE FORMAT — READ CAREFULLY
═══════════════════════════════════════════════════════════════

Your response is a single JSON object with EXACTLY these 5 top-level keys, and NO other keys:

  title              — string ≤ 70 chars
  description        — string ≤ 200 chars
  narration_script   — string (or null ONLY in silent mode)
  ai_caption         — object with exactly { "intro": string, "question": string, "cta": string }
  hashtags           — array of strings (3-7 items, no '#' prefix)

DO NOT add any other top-level keys. Specifically: NO \`hook\`, \`reel_structure\`, \`clip_number\`, \`editing_notes\`, \`voiceover\`, \`visual_direction\`, \`on_screen_text\`, \`channel\`, \`mode\`, \`language\`, \`page_name\`, \`topic\`, \`duration_seconds\`, \`clips_count\`, or any other field. ONLY the 5 keys above.
DO NOT split narration into per-clip segments. Return one combined narration_script string covering the whole reel.
DO NOT put cta at the top level — it belongs INSIDE ai_caption.
DO NOT wrap the JSON in markdown code fences.
DO NOT add prose before or after the JSON.

Here are complete and correct responses for each mode. Match these shapes exactly:

FACTUAL MODE:
{
  "title": "Lions: 30 Seconds of Power",
  "description": "Three surprising facts about Africa's most iconic predator.",
  "narration_script": "Lions can roar so loud you can hear them eight kilometres away. A male lion eats up to seven kilos of meat a day. Lionesses do ninety percent of the hunting. Follow Wildlife Daily for more.",
  "ai_caption": {
    "intro": "Lions can roar 8 kilometres away. That's louder than a chainsaw.",
    "question": "Would you survive hearing one from 100 metres away — yes or no?",
    "cta": "👉 Follow Wildlife Daily for more wildlife — every day."
  },
  "hashtags": ["Lions", "Wildlife", "Nature", "WildlifeDaily", "BigCats"]
}

CINEMATIC MODE:
{
  "title": "When the Savanna Holds Its Breath",
  "description": "A slow, atmospheric reel following a lioness through the golden hour.",
  "narration_script": "The grass bends before she does. A lioness moves through last light like water finding its way. She pauses — not from doubt, but because she already knows. The savanna does not hurry. Neither does she.",
  "ai_caption": {
    "intro": "There's a moment, just before dusk, when the savanna holds its breath.",
    "question": "Could you spend one night out here — yes, no, or only with a guide?",
    "cta": "👉 Follow NatureFrame for cinematic wildlife — every frame."
  },
  "hashtags": ["Lioness", "Wildlife", "CinematicNature", "NatureFrame", "GoldenHour"]
}

LISTICLE MODE:
{
  "title": "5 Facts About Elephants That Will Surprise You",
  "description": "A countdown of the most surprising elephant facts.",
  "narration_script": "5 amazing facts about elephants. Number 5: they can hear with their feet, sensing vibrations through the ground. Number 4: they mourn their dead, returning to bones for years. Number 3: a trunk has over 40,000 muscles. Number 2: they sleep just two hours a night. Number 1: they are the only animal that cannot jump. Follow NaturePulse for more.",
  "ai_caption": {
    "intro": "5 things you never knew about elephants. Number one will surprise you.",
    "question": "Which fact shocked you the most — 5, 3, or 1?",
    "cta": "👉 Follow NaturePulse for more wildlife — every day."
  },
  "hashtags": ["Elephants", "WildlifeFacts", "NaturePulse", "Wildlife", "Nature"]
}

SILENT MODE:
{
  "title": "Dusk on the Serengeti",
  "description": "A wordless reel of wildlife at golden hour — no narration, just nature.",
  "narration_script": null,
  "ai_caption": {
    "intro": "Just three minutes in the life of a lioness. No words. Just the savanna.",
    "question": "Would you spend an hour just watching — yes, no, or only if it were live?",
    "cta": "👉 Follow NatureFrame for cinematic wildlife — every frame."
  },
  "hashtags": ["SilentNature", "Wildlife", "NatureFrame", "Serengeti", "GoldenHour"]
}

If you cannot fulfil the request for safety reasons, return:
  {"error": "<short reason>"}
and nothing else.`;

export async function generateReelContent({
  channelKey, mode, language, pageName, durationSec, clipCount, topic, topicAngle, sourceClipsContext,
}) {
  const user = [
    `Generate reel content for channel: ${channelKey}`,
    `Mode: ${mode}`,
    `Target language: ${language}`,
    `Page name (use in CTA): ${pageName}`,
    `Reel duration: ${durationSec}s`,
    `Number of clips: ${clipCount}`,
    `Topic: ${topic}`,
    topicAngle ? `Angle to focus on: ${topicAngle}` : null,
    sourceClipsContext?.length
      ? `Source clip hints:\n${sourceClipsContext.map((c, i) => `  ${i + 1}. ${c.description || 'wildlife clip'} (${c.durationSec}s)`).join('\n')}`
      : null,
    '',
    'IMPORTANT: Return a JSON object with EXACTLY these 5 top-level keys and NO others:',
    '  title, description, narration_script, ai_caption, hashtags',
    `ai_caption must be an object: { "intro": string, "question": string, "cta": string }`,
    mode === 'silent' ? 'narration_script must be null (silent mode has no voice-over).' : null,
    'Do NOT add clip lists, editing_notes, style, concept, channel, mode, or any other keys.',
    'Return the JSON object now.',
  ].filter(Boolean).join('\n');

  const raw = await getClient().messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: user }],
  });

  const res = parseResponse(raw);
  const text = res.content?.[0]?.type === 'text' ? res.content[0].text : '';
  if (!text) throw new Error('Claude returned empty response');

  const jsonStr = extractJson(text);
  if (!jsonStr) throw new Error(`Claude response had no JSON object. Raw text:\n${text.slice(0, 400)}`);

  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(`Claude JSON parse failed: ${e.message}\nExtracted JSON:\n${jsonStr.slice(0, 400)}`);
  }

  if (parsed.error) throw new Error(`Claude refused: ${parsed.error}`);

  // Normalise schema drift — model sometimes returns alternative key names
  if (!parsed.narration_script && parsed.voiceover?.full_script) parsed.narration_script = parsed.voiceover.full_script;
  if (!parsed.narration_script && typeof parsed.voiceover === 'string') parsed.narration_script = parsed.voiceover;
  if (!parsed.ai_caption && parsed.caption) parsed.ai_caption = parsed.caption;
  if (typeof parsed.ai_caption === 'string') {
    parsed.ai_caption = { intro: parsed.ai_caption, question: parsed.question || '', cta: parsed.cta || `👉 Follow ${pageName} for more.` };
  }
  if (typeof parsed.hashtags === 'string') parsed.hashtags = parsed.hashtags.split(/\s+/).filter(Boolean);
  if (Array.isArray(parsed.hashtags)) parsed.hashtags = parsed.hashtags.map(h => h.replace(/^#+/, '')).filter(Boolean);

  for (const k of ['title', 'ai_caption', 'hashtags']) {
    if (!(k in parsed)) throw new Error(`Claude response missing required field "${k}". Got keys: ${Object.keys(parsed).join(', ')}\n${text.slice(0, 800)}`);
  }

  if (!parsed.description) {
    console.warn('[ai] description missing — deriving from title');
    parsed.description = parsed.title;
  }
  if (mode !== 'silent' && !parsed.narration_script) {
    throw new Error(`Claude response missing narration_script for mode=${mode}. Got keys: ${Object.keys(parsed).join(', ')}`);
  }
  if (mode === 'silent' && parsed.narration_script != null) parsed.narration_script = null;

  return parsed;
}
