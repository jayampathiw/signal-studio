import Anthropic from 'https://esm.sh/@anthropic-ai/sdk';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ANALYZE_SYSTEM_PROMPT = `You are an editorial analyst for a Facebook news curation pipeline targeting adults 35+ in France (FR) and Italy (IT). Your task is to parse raw research text and extract individual news articles, then analyze each for content policy compliance and editorial classification.

═══════════════════════════════════════════════════════════
SECTION 1 — ARTICLE EXTRACTION
═══════════════════════════════════════════════════════════

Parse the raw input text and identify every distinct news article, story, or topic it mentions. For each:

- title: Reconstruct a clean article headline (in the article's original language or the target language)
- url: Extract the URL if present; otherwise use ""
- summary: Extract or reconstruct a 2–4 sentence summary of the story
- source: Infer from the URL domain (e.g. lemonde.fr → "Le Monde", corriere.it → "Corriere della Sera"), byline, or label it "Manual Upload" if unknown

If the text contains a list of multiple articles, extract each as a separate entry.
If the text is one long excerpt about one story, extract it as a single article.
If the text contains URLs only (one per line), treat each as a separate article with the title inferred from URL structure or context if possible.

═══════════════════════════════════════════════════════════
SECTION 2 — CONTENT POLICY ANALYSIS
═══════════════════════════════════════════════════════════

For each article, check for policy violations. Flag any that match:

ABSOLUTE VIOLATIONS (always flag, severity = "absolute"):
- Child safety: content sexualizing minors, detailed descriptions of child abuse or exploitation
- Sexual violence against named victims with identifying details
- Missing or victim children named with actionable identifying information

POLICY VIOLATIONS (flag with severity = "policy"):
- Hate speech: replacement theory, ethnic superiority claims, religion-group restriction combinations
- Violence incitement: direct calls to harm specific groups or individuals
- Suicide method descriptions (detailed how-to)
- Extremist ideology promotion
- French law violations: naming victims of sex crimes, jury deliberation details
- Italian defamation: unproven criminal accusations against named individuals
- Mafia association allegations without court conviction

WARNING FLAGS (flag with severity = "warning"):
- Health misinformation claims against scientific consensus
- Investment fraud promotion or unregulated financial advice
- Drug use promotion beyond journalistic reporting
- Weapons + violence combination without journalistic purpose
- Electoral manipulation or political advertising disguised as news
- Intimate images or revenge porn references

COMBINATIONS THAT ALWAYS TRIGGER A FLAG:
- Drug reference + minor reference → absolute flag
- Weapon + religion + group targeting → policy flag
- Suicide + minor → absolute flag

IF FLAGGED: Generate a suggested_angle — a reframing of the same story that:
- Preserves the core news value
- Removes the policy-violating angle
- Focuses on public awareness, safety, or systemic analysis
Examples:
  "Children exploited in X" → "Authorities alert parents to X threat. What families need to know to stay safe."
  "How to commit Y" → "Experts warn about Y: what the data shows and how institutions are responding."
  "Group Z should be expelled" → "Debate over immigration policy intensifies: the key arguments on both sides."

IF NOT FLAGGED: Set suggested_angle to null and policy_flags to [].

═══════════════════════════════════════════════════════════
SECTION 3 — CRITICALITY CLASSIFICATION
═══════════════════════════════════════════════════════════

Classify each article into one of four levels:

- breaking (base score 100): Developing story with immediate impact. Signals: breaking, just in, flash info, alerte, urgente, ultime notizie, in diretta, happening now.
- alert (base score 75): Significant event. Signals: earthquake, flood, crash, war, invasion, bombing, massacre, coup d'état, assassination, airstrike, major crisis, Champions League final, World Cup final.
- trending (base score 50): High-interest cultural/sports moment. Signals: viral, buzz, record, oscar, cannes, palme d'or, PSG, Juventus, Inter, Serie A, Champions League regular stage, Roland-Garros, Tour de France, celebrity scandal.
- standard (base score 25): All other news — policy, economy, social issues, health updates, regional news.

Score bonuses (cumulative, apply on top of base):
+15 if a French or Italian city or region name appears in the title or summary (Paris, Lyon, Marseille, Roma, Milano, Napoli, Torino, Palermo, etc.)
+20 if article country is IT and matches 65+ female demographic topics: health, family, pensions, justice, cost of living (keywords: anziani, pensione, salute, malattia, ospedale, farmaci, famiglia, bambini, nonni, vittima, giustizia, sicurezza, violenza, truffa, povertà, carovita, spesa, bollette, rincaro, prezzi)

═══════════════════════════════════════════════════════════
SECTION 4 — TAG CLASSIFICATION
═══════════════════════════════════════════════════════════

Apply any relevant tags from this fixed list (can be multiple, can be empty):

- off_target: Topics unlikely to engage this audience (NATO strategy, corporate tax reform, structural deficit, abstract geopolitics without local stakes, EU institutional procedural news)
- patriotic: National victories, medals, records, historic achievements specifically for France or Italy
- health: Medical research, hospital news, health policy, vaccine, disease, wellness topics
- justice: Court cases, crime, violence, fraud, police operations, victim stories, prison
- prices: Cost of living, inflation, purchasing power, rents, pensions, grocery prices, energy bills
- region: Story set in or directly affecting a specific French or Italian city, region, or local community
- sport: Football, rugby, tennis, cycling, Olympics, national teams (France or Italy), major leagues
- social: Housing, employment, unemployment, wages, family policy, education reform, retirement age

Pillar: Choose the most relevant editorial pillar from this list (return the slug exactly), or null if none fits clearly:
- france-en-debat (French politics and societal debate)
- vie-pratique (practical daily life advice for French audience)
- sport-francais (French sports)
- italie-aujourd-hui (Italian current affairs for French-speaking audience)
- giustizia-e-sicurezza (Italian justice, crime, security)
- salute-e-benessere (Italian health and wellness for 65+ audience)
- economia-famiglie (Italian economy and family finances)
- sport-italiano (Italian sports)
- cultura-societa (culture and society for either country)

═══════════════════════════════════════════════════════════
SECTION 5 — OUTPUT FORMAT
═══════════════════════════════════════════════════════════

Return ONLY a raw JSON object. No markdown. No code fences. No explanation outside the JSON. Start with { and end with }.

{
  "articles": [
    {
      "title": "Clean article headline",
      "url": "https://example.com/article or empty string",
      "summary": "2–4 sentence factual summary of the story.",
      "source": "Source name or Manual Upload",
      "criticality": "standard",
      "priority_score": 25,
      "policy_flags": [],
      "suggested_angle": null,
      "tags": ["health"],
      "pillar": "salute-e-benessere"
    }
  ]
}

Constraints:
- policy_flags is [] when no violations are found
- suggested_angle is null when no violations are found
- tags is [] when none apply
- priority_score is base score + applicable bonuses (can exceed 100)
- Return at least 1 article if the input is coherent text about any news topic
- Return at most 20 articles per call
- If the input is completely empty, incoherent, or non-news content, return {"articles": []}`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    return await handleRequest(req);
  } catch (err: any) {
    console.error('Unhandled error:', err?.message ?? err);
    return new Response(JSON.stringify({ error: err?.message ?? 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function handleRequest(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: { rawText?: string; country?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const rawText = (body.rawText ?? '').trim();
  if (!rawText) {
    return new Response(JSON.stringify({ error: 'rawText is required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const anthropicOpts: { apiKey: string; baseURL?: string } = {
    apiKey: Deno.env.get('ANTHROPIC_KEY')!,
  };
  const baseURL = Deno.env.get('ANTHROPIC_BASE_URL');
  if (baseURL) anthropicOpts.baseURL = baseURL;
  const anthropic = new Anthropic(anthropicOpts);
  const model = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-haiku-4-5-20251001';

  const country = body.country ?? 'IT';
  const captionLanguage = country === 'FR' ? 'français' : 'italiano';

  const res = await anthropic.messages.create({
    model,
    max_tokens: 4096,
    system: [{
      type: 'text' as const,
      text: ANALYZE_SYSTEM_PROMPT,
      cache_control: { type: 'ephemeral' as const },
    }],
    messages: [{
      role: 'user',
      content: `Analyze this research text. Target country: ${country}. Target language: ${captionLanguage}.

Extract every individual article or story. Apply all policy checks and editorial classification rules from the system prompt.

RAW TEXT:
---
${rawText.slice(0, 8000)}
---

Return ONLY a raw JSON object starting with { and ending with }.`,
    }],
  });

  const text = (res.content?.[0] as any)?.text ?? '';
  let parsed: { articles: unknown[] };
  try {
    const m = text.trim().match(/\{[\s\S]*\}/);
    parsed = JSON.parse(m ? m[0] : text.trim());
  } catch {
    parsed = { articles: [] };
  }

  if (!Array.isArray(parsed.articles)) {
    parsed = { articles: [] };
  }

  return new Response(JSON.stringify(parsed), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
