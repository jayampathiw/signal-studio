import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseArgs } from 'util';

import Anthropic from '@anthropic-ai/sdk';
import { extractJson } from '@signal-studio/ai';
import { env } from '@signal-studio/config';
import { getServiceClient } from '@signal-studio/database';
import { createBrief, listRecentBriefs } from '@signal-studio/database/briefs';

import { getChannel } from '../src/config/channels.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Arg parser ──────────────────────────────────────────────────────────────

let _parsed;
try {
  const { values } = parseArgs({
    options: {
      channel: { type: 'string' },
      concept: { type: 'string' },
      format: { type: 'string' },
      slot: { type: 'string' },
      'scheduled-for': { type: 'string' },
    },
    strict: false,
  });
  _parsed = values;
} catch (e) {
  console.error(JSON.stringify({ error: 'invalid-args', message: e.message }));
  process.exit(2);
}

const args = {
  channel: _parsed.channel,
  concept: _parsed.concept,
  format: _parsed.format,
  slot: _parsed.slot,
  scheduledFor: _parsed['scheduled-for'],
};

// ── Knowledge loader ────────────────────────────────────────────────────────

const KNOWLEDGE_DIR_MAP = {
  'wildlife/intimacy/EN': 'wild-eye',
};

function loadKnowledge(channelKey) {
  const dir = KNOWLEDGE_DIR_MAP[channelKey];
  if (!dir) return '';
  const base = join(__dirname, '../knowledge', dir);
  const files = [
    { label: 'CHANNEL HOUSE STYLE & RULES', file: 'house-style.md' },
    { label: 'PROVEN SCRIPT PATTERNS', file: 'script-library.md' },
    { label: 'SEO EXAMPLES & PATTERNS', file: 'seo-examples.md' },
  ];
  return files
    .map(({ label, file }) => {
      try {
        const content = readFileSync(join(base, file), 'utf8');
        return `\n${'═'.repeat(60)}\n${label}\n${'═'.repeat(60)}\n${content}`;
      } catch {
        return '';
      }
    })
    .join('\n');
}

// ── AI validation ───────────────────────────────────────────────────────────

async function validateBrief({ channelKey, concept, format, recentContext, channelConfig }) {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_KEY });
  const knowledge = loadKnowledge(channelKey);

  const formatOptions = Object.entries(channelConfig.formats)
    .map(([key, f]) => `  ${key}: ${f.description} (default slot: ${f.slot})`)
    .join('\n');

  const system = `You are a content brief validator for the "${channelConfig.pageName}" channel.

Validate the incoming brief concept against channel rules, then generate a curiosity-gap title if it passes.
Respond with a JSON object only — no prose, no markdown fences.
${knowledge}

═══ AVAILABLE FORMATS ═══
${formatOptions}

═══ RESPONSE SCHEMAS ═══
On success:
  { "ok": true, "title": "<curiosity-gap headline, 1 emoji, < 10 words>", "format": "<key>", "slot": "<slot from format config>" }

On species/content rejection:
  { "ok": false, "rejection": "species", "message": "<reason>", "suggestion": "<cavy-reframed concept>" }

On near-duplicate detection:
  { "ok": false, "rejection": "duplicate", "match_title": "<matching title>", "message": "<why too similar>" }

On 21s tension failure:
  { "ok": false, "rejection": "tension", "clarification": "<specific question to enrich the concept arc>" }`;

  const userLines = [
    `Concept: "${concept}"`,
    format
      ? `Requested format: ${format} (override only if the concept is clearly wrong for this format)`
      : 'Format: not specified — recommend the best fit based on the concept',
    '',
    recentContext.length > 0
      ? `Recent briefs / posts in the last 30 days — check for near-duplicates:\n${recentContext.map((b, i) => `  ${i + 1}. [${b.source}] "${b.title}" — ${b.description ?? ''}`).join('\n')}`
      : 'No recent briefs to check against.',
    '',
    'Steps (in order):',
    '1. Species check — reject if the concept does not feature a cavy or an approved South American species',
    `2. Format — ${format ? `confirm "${format}" suits this concept` : 'recommend the best format'}`,
    '3. Near-duplicate — flag if any recent brief/post is conceptually too similar (same behaviour, same setting, same emotional register)',
    '4. Title — generate a curiosity-gap headline (1 emoji, < 10 words) that stops a scroll',
    '5. Tension (21s only) — if the final format is 21s, verify a 3-beat arc exists (calm → threat → resolution); if missing, respond with rejection: "tension"',
    '',
    'Return JSON now.',
  ].join('\n');

  const response = await client.messages.create({
    model: env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system,
    messages: [{ role: 'user', content: userLines }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock)
    throw new Error(
      `AI returned no text block. Content types: ${response.content.map((b) => b.type).join(', ')}`,
    );
  const jsonStr = extractJson(textBlock.text);
  if (!jsonStr) throw new Error(`AI returned no JSON. Raw: ${textBlock.text.slice(0, 300)}`);
  return JSON.parse(jsonStr);
}

// ── Main ─────────────────────────────────────────────────────────────────────

if (!args.channel || !args.concept) {
  console.error(
    JSON.stringify({ error: 'missing-args', message: '--channel and --concept are required' }),
  );
  process.exit(2);
}

let channel;
try {
  channel = getChannel(args.channel);
} catch (e) {
  console.error(JSON.stringify({ error: 'unknown-channel', message: e.message }));
  process.exit(2);
}

if (!channel.formats) {
  console.error(
    JSON.stringify({
      error: 'no-formats',
      message: `Channel "${args.channel}" does not support the brief/format system`,
    }),
  );
  process.exit(2);
}

if (args.format && !channel.formats[args.format]) {
  console.error(
    JSON.stringify({
      error: 'unknown-format',
      message: `Format "${args.format}" is not valid for "${args.channel}". Valid: ${Object.keys(channel.formats).join(', ')}`,
    }),
  );
  process.exit(2);
}

// Gather recent context: content_items briefs + reels_log posts
const CONTEXT_DAYS = 30;
let recentContext = [];
try {
  const [recentBriefs, recentPosts] = await Promise.all([
    listRecentBriefs({ channelKey: args.channel, days: CONTEXT_DAYS }),
    (async () => {
      const since = new Date(Date.now() - CONTEXT_DAYS * 86_400_000).toISOString();
      const { data, error } = await getServiceClient()
        .from('reels_log')
        .select('topic_title, created_at')
        .eq('channel', channel.pageName)
        .gte('created_at', since)
        .order('created_at', { ascending: false });
      if (error) throw new Error(`reels_log query failed: ${error.message}`);
      return data ?? [];
    })(),
  ]);

  recentContext = [
    ...recentBriefs.map((b) => ({
      source: `brief #${b.id}`,
      title: b.title,
      description: b.description,
    })),
    ...recentPosts.map((p) => ({ source: 'posted', title: p.topic_title, description: null })),
  ];
} catch (e) {
  console.error(
    JSON.stringify({
      error: 'context-warn',
      message: `Could not load recent context for duplicate check: ${e.message}`,
    }),
  );
}

// Phase 1 — AI validation
let ai;
try {
  ai = await validateBrief({
    channelKey: args.channel,
    concept: args.concept,
    format: args.format,
    recentContext,
    channelConfig: channel,
  });
} catch (e) {
  console.error(JSON.stringify({ error: 'ai-error', message: e.message }));
  process.exit(2);
}

if (!ai.ok) {
  console.log(JSON.stringify(ai));
  process.exit(1);
}

if (!channel.formats[ai.format]) {
  console.error(
    JSON.stringify({
      error: 'ai-invalid-format',
      message: `AI returned format "${ai.format}" which is not valid for "${args.channel}". Valid: ${Object.keys(channel.formats).join(', ')}`,
    }),
  );
  process.exit(2);
}

// Phase 2 — INSERT
const slot = args.slot ?? channel.formats[ai.format].slot ?? null;

let brief;
try {
  brief = await createBrief({
    channelKey: args.channel,
    format: ai.format,
    title: ai.title,
    description: args.concept,
    slot,
    scheduledFor: args.scheduledFor ?? null,
  });
} catch (e) {
  console.error(JSON.stringify({ error: 'db-error', message: e.message }));
  process.exit(2);
}

console.log(
  JSON.stringify({ id: brief.id, title: brief.title, format: brief.format, slot: brief.slot }),
);
