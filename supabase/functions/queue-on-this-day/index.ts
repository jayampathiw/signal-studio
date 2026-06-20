/**
 * Edge function: queue "On This Day" content for one or more dates.
 *
 * Body: { country: 'IT'|'FR', dates?: string[], days?: number }
 *   dates  — explicit list of YYYY-MM-DD strings
 *   days   — queue next N days from today (overrides dates)
 *   (neither) — queue today only
 *
 * Does: Wikipedia → Claude → DB insert for each date (in parallel).
 * Does NOT generate images — run CLI for that:
 *   node src/scripts/queue-on-this-day.js IT <date>   (generates images too)
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';

const PAGE_CONFIG: Record<string, { language: string; pageName: string; pageHashtag: string }> = {
  IT: { language: 'italiano', pageName: 'Vivere in Italia',   pageHashtag: '#ItaliaOggi' },
  FR: { language: 'français', pageName: "France Aujourd'hui", pageHashtag: '#FranceAujourdhui' },
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    return await handleRequest(req);
  } catch (err: any) {
    console.error('Unhandled:', err?.message);
    return new Response(JSON.stringify({ error: err?.message ?? 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function handleRequest(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const body = await req.json();
  const country = (body.country ?? '').toUpperCase() as 'IT' | 'FR';
  if (!['IT', 'FR'].includes(country)) {
    return new Response(JSON.stringify({ error: 'country must be IT or FR' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const cfg = PAGE_CONFIG[country];
  const today = new Date().toISOString().slice(0, 10);

  let dates: string[];
  if (typeof body.days === 'number' && body.days > 0) {
    dates = Array.from({ length: Math.min(body.days, 30) }, (_, i) => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + i);
      return d.toISOString().slice(0, 10);
    });
  } else if (Array.isArray(body.dates) && body.dates.length > 0) {
    dates = body.dates.slice(0, 30);
  } else {
    dates = [today];
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Process all dates in parallel (Wikipedia + Claude, no images)
  const results = await Promise.allSettled(
    dates.map(date => processDate(supabase, country, cfg, date)),
  );

  const out = results.map((r, i) =>
    r.status === 'fulfilled'
      ? r.value
      : { date: dates[i], success: false, error: (r.reason as any)?.message ?? String(r.reason) },
  );

  return new Response(JSON.stringify({ results: out }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function processDate(
  supabase: ReturnType<typeof createClient>,
  country: string,
  cfg: typeof PAGE_CONFIG['IT'],
  date: string,
): Promise<{ date: string; success: boolean; post_id?: string; events_count?: number; skipped?: boolean; error?: string }> {
  // Duplicate check
  const { data: existing } = await supabase
    .from('on_this_day_posts')
    .select('id')
    .eq('country', country)
    .eq('post_date', date)
    .single();

  if (existing) return { date, success: true, post_id: existing.id, skipped: true };

  // Wikipedia
  const targetDate = new Date(date + 'T00:00:00Z');
  const month = String(targetDate.getUTCMonth() + 1).padStart(2, '0');
  const day   = String(targetDate.getUTCDate()).padStart(2, '0');
  const lang  = country === 'IT' ? 'it' : 'fr';

  const wikiRes = await fetch(
    `https://${lang}.wikipedia.org/api/rest_v1/feed/onthisday/events/${month}/${day}`,
    { headers: { 'User-Agent': 'FacebookNewsPipeline/1.0' } },
  );
  if (!wikiRes.ok) throw new Error(`Wikipedia ${wikiRes.status} for ${date}`);
  const wikiData = await wikiRes.json();
  const rawEvents: { year: number; text: string }[] = (wikiData.events ?? [])
    .map((e: any) => ({ year: Number(e.year), text: String(e.text ?? '') }));

  // Claude
  const dateObj     = new Date(date + 'T00:00:00Z');
  const dayLabel    = dateObj.toLocaleDateString(country === 'IT' ? 'it-IT' : 'fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' });
  const introHeader = country === 'IT' ? `📅 Accadde oggi in Italia — ${dayLabel}` : `📅 Il était une fois en France — ${dayLabel}`;
  const ctaLine     = country === 'IT'
    ? `👉 Segui ${cfg.pageName} per scoprire la storia italiana — ogni giorno.\n\n${cfg.pageHashtag}`
    : `👉 Suivez ${cfg.pageName} pour découvrir l'histoire française — chaque jour.\n\n${cfg.pageHashtag}`;

  const eventList = rawEvents.slice(0, 60).map(e => `[${e.year}] ${e.text}`).join('\n');

  const prompt = `You are a social media editor for "${cfg.pageName}", a Facebook page dedicated to ${country === 'IT' ? 'Italian' : 'French'} national pride and history (35+ diaspora audience).

Today is ${dayLabel}. Select the 3-5 most significant and emotionally engaging events from this Wikipedia list for an Italian/French national-pride page (sport, science, art, food, culture — no political controversy, no war crimes, no living political figures).

For each selected event:
- Write a 2-3 sentence celebratory summary in ${cfg.language}
- Write a cinematic AI image prompt in English (photojournalistic, no faces, no text, square 1:1 composition)

Write the full Facebook post:
- intro: Start with "${introHeader}", then for each event: "🏛️ [Year]: [Short title in ${cfg.language}]\\n[summary]" separated by \\n\\n
- question: One closed/binary question inviting engagement in ${cfg.language}
- cta: "${ctaLine}"
- hashtags: 3-5 hashtags

EVENTS (${rawEvents.length} total):
${eventList}

Return ONLY valid JSON starting with {:
{"intro":"...","question":"...","cta":"...","hashtags":["#..."],"events":[{"year":1889,"title":"...","summary":"...","image_prompt":"RAW photograph, Sony A7R V, 35mm, square 1:1 — [specific scene, no faces, no text]"}]}`;

  const anthropicKey = Deno.env.get('ANTHROPIC_KEY') ?? Deno.env.get('ANTHROPIC_API_KEY');
  const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!claudeRes.ok) throw new Error(`Claude API ${claudeRes.status}`);
  const claudeData = await claudeRes.json();
  const rawText = claudeData.content?.[0]?.text ?? '';
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Claude returned no JSON');
  const parsed = JSON.parse(jsonMatch[0]);

  const events = (parsed.events ?? []).map((e: any) => ({
    year: e.year, title: e.title, summary: e.summary, image_prompt: e.image_prompt, image_url: null,
  }));

  const title = country === 'IT'
    ? `Accadde oggi in Italia — ${dayLabel}`
    : `Il était une fois en France — ${dayLabel}`;

  const { data: inserted, error: insertErr } = await supabase
    .from('on_this_day_posts')
    .insert({
      country, post_date: date, title, events,
      ai_caption: { intro: parsed.intro, question: parsed.question, cta: parsed.cta },
      hashtags: parsed.hashtags ?? [],
      status: 'pending',
    })
    .select('id')
    .single();

  if (insertErr) throw new Error(`DB insert: ${insertErr.message}`);

  return { date, success: true, post_id: inserted.id, events_count: events.length };
}
