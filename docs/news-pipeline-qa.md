# News Pipeline — Q&A Reference

> Covers the `apps/news` pipeline as it stands today. All answers are derived from the live source code.
> Last updated: 2026-07-10.

---

## 1. Pipeline Overview

### RSS Feeds / Sources

**Signal Studio is the authoritative implementation.** The old `facebook-news-pipeline` repo is a legacy origin only; all live code is at `apps/news/src/config/sources.js`.

**Italy (`IT`) — 15 RSS feeds:**

| Source                      | Feed focus                      |
| --------------------------- | ------------------------------- |
| ANSA                        | General politics RSS            |
| ANSA Cronaca                | Crime / daily news RSS          |
| Corriere della Sera         | Homepage                        |
| Corriere.it                 | Homepage (second Corriere feed) |
| Repubblica                  | Homepage                        |
| La Stampa                   | Front page                      |
| AGI                         | Wire news                       |
| Il Resto del Carlino        | National/regional               |
| Il Messaggero               | National                        |
| Il Secolo XIX               | Ligurian/national               |
| La Gazzetta del Mezzogiorno | Southern Italy                  |
| Vatican News                | Catholic/religious              |
| La Gazzetta dello Sport     | Sports                          |
| Il Fatto Quotidiano         | Investigative/political         |
| Roma Today                  | Local Rome                      |

Plus **NewsAPI** query: `"Italia attualità Roma salute famiglia pensioni"` in Italian — deliberately biased toward Rome (31% of audience), health, family, pensions.

**France (`FR`) — 14 RSS feeds:**

| Source      | Notes                   |
| ----------- | ----------------------- |
| Le Monde    | National homepage       |
| Le Figaro   | National homepage       |
| France Info | TV news                 |
| France 24   | International FR        |
| Libération  | Left-leaning national   |
| L'Obs       | Center-left national    |
| BFM TV      | 24h news                |
| Reporterre  | Ecology / investigative |
| Le Parisien | Paris/national          |
| Bondy Blog  | Urban/suburban voice    |
| La Provence | PACA region             |
| Nice-Matin  | PACA region             |
| Midi Libre  | Occitanie region        |
| L'Équipe    | Sports                  |

Plus **NewsAPI** query: `"France actualité région Provence Méditerranée"` in French — biased toward PACA/Occitanie audience (23% Marseille, 8% Avignon, 8% Hyères, 8% Nice, 8% Perpignan).

**Excluded / deferred sources (with reasons in code):**

- 20 Minutes — Cloudfront bot-block (403)
- Actu.fr — RSS 404
- AFP wire, Reuters FR, Le Point, L'Express, Courrier International — licensed/syndication cost
- Il Giornale — editorially excluded (right-wing, audience mismatch)
- Il Sole 24 Ore, Corriere del Veneto — deferred until 10k engaged followers

Ingestion takes the **top 5 items per feed** (hardcoded in `rss.js:18`). All fetches run in parallel with a 10-second timeout per source.

---

### What the `articles` Table Looks Like

Every ingested article becomes a row in Supabase Postgres. Full column list (assembled from all 22 migrations):

| Column                     | Type             | Source                                                                                                                        |
| -------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `id`                       | uuid PK          | Supabase auto                                                                                                                 |
| `country`                  | text (`FR`/`IT`) | Set at ingest                                                                                                                 |
| `source`                   | text             | RSS feed name or `"NewsAPI"`                                                                                                  |
| `title`                    | text             | RSS `<title>`                                                                                                                 |
| `original_url`             | text             | RSS `<link>`                                                                                                                  |
| `summary`                  | text             | RSS `contentSnippet` / `content`                                                                                              |
| `published_at`             | timestamptz      | RSS `pubDate`                                                                                                                 |
| `created_at`               | timestamptz      | DB insert time                                                                                                                |
| `status`                   | text             | `pending` → `approved` → `posted` / `blocked` / `failed` / `manual_review`                                                    |
| `blocked_reason`           | text             | Validator rule ID + reason string                                                                                             |
| `criticality`              | text             | `breaking` / `alert` / `trending` / `standard`                                                                                |
| `priority_score`           | numeric          | 25–90 based on keywords                                                                                                       |
| `cluster_id`               | bigint           | Union-find cluster root title                                                                                                 |
| `cluster_size`             | int              | How many articles in this cluster                                                                                             |
| `tags`                     | text[]           | Populated by `tagArticle.js`                                                                                                  |
| `story_category`           | text             | Claude classification: `Politique / Società / Sport / Culture / International / Santé / Environnement`                        |
| `pillar`                   | text             | Editorial pillar (e.g. `fatto-del-giorno`, `france-en-debat`)                                                                 |
| `content_signals`          | jsonb            | `{binary_frame, poll_fit_score, protagonist_named, best_format, fr_it_stake_first_sentence, pillar_hint}`                     |
| `editorial_score`          | numeric          | `priority_score + Google Trends bonus + recency bonus`                                                                        |
| `publish_score`            | numeric          | Final ranking: `criticality×40 + slot_match×30 + pillar_quota×20 + recency×10`                                                |
| `recommended_format`       | text             | Claude recommendation: `image / video / poll / carousel`                                                                      |
| `post_format`              | text             | Human override: what was actually used                                                                                        |
| `ai_caption`               | jsonb            | `{intro, question, cta}` — full Facebook post in 3 parts                                                                      |
| `hashtags`                 | text[]           | e.g. `["#SMIC", "#France", "#FranceAujourdhui"]`                                                                              |
| `seed_comment`             | text             | First comment auto-posted within 2 min of the FB post                                                                         |
| `seed_comment_template_id` | text             | Which template was used (e.g. `fr_03`)                                                                                        |
| `image_headline`           | text             | ≤6-word overlay text for the image (in FR or IT)                                                                              |
| `image_prompt`             | text             | Full 80+ word cinematic AI prompt                                                                                             |
| `formatted_image_prompt`   | text             | Production-ready version with text overlay + watermark instructions                                                           |
| `generated_image_url`      | text             | URL of the generated image (if stored)                                                                                        |
| `seo_title`                | text             | ≤60 character SEO title                                                                                                       |
| `seo_description`          | text             | ≤160 character SEO description                                                                                                |
| `fb_post_id`               | text             | Facebook post ID after publishing                                                                                             |
| `posted_at`                | timestamptz      | Exact publish timestamp                                                                                                       |
| `boost_eligible`           | boolean          | `true` by default; `false` if a warning-tier compliance rule fires                                                            |
| `editor_notes`             | text             | Dashboard human annotation                                                                                                    |
| `identity_mode`            | text             | `FIERTÉ / RÉSISTANCE / DÉBAT / PATRIMOINE` (FR) or `ORGOGLIO / RESILIENZA / DIBATTITO / PATRIMONIO` (IT) — assigned by Claude |

**Example row (Italy):**

```
country:        IT
source:         ANSA Cronaca
title:          "Pensioni, il governo alza l'assegno minimo a 700 euro"
status:         approved
criticality:    trending
priority_score: 67
cluster_size:   3   (La Stampa + Repubblica also covered it)
pillar:         fatto-del-giorno
story_category: Società
identity_mode:  RESILIENZA
publish_score:  84.2
ai_caption:     {intro: "2 milioni di pensionati italiani vedranno...", question: "È abbastanza 700€ al mese?", cta: "📰 Fonte: ANSA\n\n👉 Segui Italia Oggi..."}
hashtags:       ["#Pensioni", "#Governo", "#Italia", "#Società", "#ItaliaOggi"]
seo_title:      "Pensioni: assegno minimo sale a 700 euro"
boost_eligible: true
```

---

## 2. Current Processing

### Filtering / Validation — 4-tier system

Every article runs through `contentValidator.js` against `title + summary` combined:

**Tier 1 — ABSOLUTE (silent drop, never saved to DB):**

- `CHILD_SAFETY_01` — minor + sexual/violent context (Meta CSEA rule)
- `CHILD_SAFETY_02` — missing/victim child with identifying detail
- `SEX_VIOL_01` — rape/sexual assault in headline (absolute for pages under 6 months)
- Exception: if a safe-harbor journalism phrase is present (`"secondo l'accusa"`, `"fact-check"`, `"procura sostiene"`, etc.), `CHILD_SAFETY_01` routes to `manual_review` instead of silent drop

**Tier 2 — POLICY (saved as `status='blocked'` with `blocked_reason`):**

- `HATE_SPEECH_01` — replacement-theory cluster (Loi 1881 + Meta Tier-1 hateful conduct)
- `HATE_SPEECH_02` — religion + restriction combo
- `VIOLENCE_INCIT_01` — glorification of attack
- `HARM_SUICIDE_01` — method/location/romanticisation (WHO media guidelines)
- `HARM_EXTREMISM_01` — martyrdom framing for violent actors
- `FR_LEGAL_01/02` — French active-proceedings leak; hate speech (Loi Pleven)
- `IT_LEGAL_01/02` — Italian defamation (Art. 595 c.p.) + organised crime references
- `AU_LEGAL_01/02/03` — Australian defamation/suppression orders (pre-built for expansion)
- `SE_LEGAL_01` — Swedish hets mot folkgrupp (pre-built for expansion)

**Tier 3 — WARNING (blocked unless a safe-harbor phrase is also present; if safe-harbor present, article passes with `boost_warning=true`):**

- `MISINFO_HEALTH_01` — miracle cures, anti-vax claims (Meta Misinformation + ARCOM)
- `HARM_FINANCE_01` — guaranteed investment returns, crypto scams
- `ADULT_AD_01` — adult content lexicon (blocks ad-boost, not organic reach)
- `ADS_DRUGS_01` — drug references (blocks ad-boost)
- `ADS_WEAPONS_01` — weapon + violence verb within 40 chars
- `ADS_POLITICS_01` — election/political phrasing — **HARD boost-block in EU since Oct 2025** (TTPA + Meta)
- For Italy: `ADS_POLITICS_01`, `ADS_WEAPONS_01`, `ADS_DRUGS_01` set `boost_eligible=false` instead of hard-blocking

**Tier 4 — COMBINATION ESCALATIONS (two rules trigger together → absolute):**

- Drugs + Minor → absolute
- Weapon + Religion-Group → absolute
- Suicide + Minor → absolute
- Replacement theory + Election → absolute

**Deduplication (two passes):**

1. **In-batch dedup** — Jaccard token similarity > 0.6 removes cross-feed duplicates before DB save
2. **DB dedup** — compared against recent article titles in DB; drops if similarity > 0.7

**Cluster detection:**

- Union-Find across the validated batch groups articles with title similarity > 0.5 into a cluster
- A cluster of 3+ articles auto-escalates criticality to `breaking`

**Criticality scoring (keyword regex, runs at ingest):**

| Level      | Score | Trigger words                                           |
| ---------- | ----- | ------------------------------------------------------- |
| `breaking` | 90    | death, attack, explosion, earthquake, tsunami, shooting |
| `alert`    | 65    | strike, protest, crisis, scandal, resignation           |
| `trending` | 45    | record, champion, vote, poll, announcement              |
| `standard` | 25    | default                                                 |

Geographic bonuses: FR articles with PACA/Occitanie city names +10; IT articles with major Italian cities +8; IT articles with demographic resonance keywords (pensioni, sanità, famiglia, anziani, prezzi) +12.

---

### What Is Generated Automatically

Yes — everything downstream of the raw article is fully automated. Claude (`claude-haiku-4-5-20251001`) generates:

1. **Full Facebook post** — structured 7-block format (Hook → Context → Bullet Details → Stakes → Engagement Question → Source → CTA + Hashtags), returned as `ai_caption: {intro, question, cta}` + `hashtags[]`
2. **Seed comment** — auto-posted within 2 minutes; chosen from 10 FR + 10 IT rotating templates with `{topic_noun}` filled in, avoiding recently used template IDs
3. **Identity mode** — Claude classifies and writes the entire post through one of 4 identity lenses per country (see Section 6 of the system prompt in `apps/news/src/services/ai.js`)
4. **SEO title** (≤60 chars) and **SEO description** (≤160 chars) in the target language, with character-count enforcement and rewrite-not-truncate rule
5. **Image prompt** — 80+ word photojournalistic AI prompt using one of 6 compositional approaches: A=anonymous person (back/side), B=sensitive anonymous silhouette, C=location-specific, D=symbolic/conceptual, E=environmental/nature/health, F=identity/pride crowd
6. **Image headline** — ≤6 word overlay text; enforced to be in FR or IT (English stopword detection with auto-retry up to 3 attempts)
7. **Content signals** — structured metadata: `binary_frame`, `poll_fit_score` (1–5), `protagonist_named`, `best_format`, `fr_it_stake_first_sentence`, `pillar_hint`
8. **Story category** — one of: `Politique / Société / Sport / Culture / International / Santé / Environnement`
9. **Recommended format** — `image / video / poll / carousel`

The composite image is generated from the prompt via the provider chain: **Pollinations.ai** (free, default) → **Cloudflare Workers AI** → **Google Gemini** (fallbacks), with `sharp` post-process sharpening.

---

### Tech Stack

| Layer            | Technology                                                                           |
| ---------------- | ------------------------------------------------------------------------------------ |
| Runtime          | Node.js ≥20, ESM modules (`"type":"module"`), npm workspaces                         |
| Database         | Supabase Postgres (hosted), `@supabase/supabase-js`                                  |
| AI (captions)    | Anthropic Claude `claude-haiku-4-5-20251001` via `@anthropic-ai/sdk`, prompt caching |
| AI (images)      | Pollinations.ai → Cloudflare Workers AI → Google Gemini (fallback chain)             |
| RSS parsing      | `rss-parser` npm package                                                             |
| NewsAPI          | REST via `newsapi` npm package                                                       |
| Publishing       | Facebook Graph API v22.0 — direct `axios` POST to `/{page_id}/photos`                |
| Image processing | `sharp` (sharpening); custom `imageComposite.js` (text + watermark overlay)          |
| Automation       | GitHub Actions cron every 30 minutes (`.github/workflows/fetch-news.yml`)            |
| Review UI        | Angular 21 SPA (Vercel) — `apps/dashboard`                                           |

No Airflow, no SQLite, no Python in this pipeline.

---

## 3. Output & Usage

### How Articles Become Facebook Posts

The flow is **semi-automated with a human gate**:

1. **Ingest** (cron every 30 min) — pipeline saves `status='pending'` articles to DB
2. **Caption generation** — triggered manually via `generate-caption.js <id>` or the dashboard; Claude writes the full post package
3. **Image generation** — triggered separately via `generate-image.js` or the `generate-image` edge function from the dashboard
4. **Human review** — dashboard shows article, generated caption, image, hashtags; human can edit or approve
5. **Publishing** — `publish-slot.js` fires at the posting slots (IT: 07:30, 11:30, 15:30, 19:30 CEST; FR: 07:30, 12:00, 19:00 CEST). It picks the **highest `publish_score` article** within a ±15 min slot window, generates the image, composites the overlay, and POSTs to Facebook via the Graph API.
6. Seed comment is posted automatically within 2 minutes

The text sent to Facebook is: `ai_caption.intro + "\n\n" + ai_caption.question + "\n\n" + ai_caption.cta`. No templates, no copy-paste — fully generated, fully automated at publish time.

---

### What Works Well

- **The 7-block structured format** produces consistent, readable posts; the binary/triptyque engagement question (never open-ended) performs well for both audiences
- **Identity modes** (ORGOGLIO/RESILIENZA/DIBATTITO/PATRIMONIO and FIERTÉ/RÉSISTANCE/DÉBAT/PATRIMOINE) — writing the entire post through an identity lens is the biggest quality difference vs generic news aggregators
- **`storie-italiane` pillar format** (`"Nome, 65 anni, di Roma — fatto"`) resonates strongly with the 65+ Rome women demographic — named protagonist, personal, concrete
- **Cluster detection** — when 3+ sources cover the same story it auto-escalates to `breaking`, surfacing the most-covered stories first
- **`publish_score` formula** works well for surfacing the right pillar at the right time slot
- **Seed comment rotation** across 10 templates with `topic_noun` fill-in keeps engagement prompts feeling article-specific

---

### What Feels Too News-Heavy for a Lifestyle Direction

Heavy sources currently dominating volume:

- `france-en-debat` pillar (9/week target) — divisive society topics, immigration, justice
- `fatto-del-giorno` pillar (5/week target) — crime, pensions, prices
- `ANSA Cronaca` feed — the most crime-heavy source in the IT roster
- Current criticality scoring strongly rewards crisis keywords; positive stories rarely reach `trending` or higher

Already lifestyle-compatible:

- `italia-che-funziona` pillar — positive stories, Italian excellence
- `storie-italiane` pillar — human stories with named protagonist
- `vaticano` pillar — faith / culture / tradition
- `fierte-francaise` / `FIERTÉ` mode — cultural pride posts
- `PATRIMOINE` / `PATRIMONIO` identity mode — warm, nostalgic, celebratory tone
- `retour-sur` pillar — anniversaries, "on this day" evergreen content

The core tension: **ANSA Cronaca and politics pillars dominate ingested volume** while positive/cultural/lifestyle pillars are starved of content because RSS feeds in those niches are fewer and harder to find.

---

### Data Storage

Everything is in **Supabase Postgres** (project `nnxtvbolhuvihlpwppbj`). No CSV files, no SQLite, no local file output. Every article row, caption, image URL, post ID, and metric lives in the `articles` table described above. The dashboard reads directly from the DB.

---

## 4. Refinement Goals

### What to Fully Reuse (no changes needed)

- **The ingest + dedup pipeline** (`pipeline.js`, `rss.js`, `newsapi.js`, `dedup.js`) — solid, parallel, timeout-safe; just needs different source URLs
- **The compliance validator** — well-engineered, Meta-policy-aware; keep it entirely
- **The caption generation AI + 7-block structure** — the prompt is highly tuned; identity modes work well
- **The `publish_score` formula** — good multi-factor ranking; just change which pillars exist and their weekly targets
- **Slot-based publishing** — the ±15 minute window logic + seed comment mechanism
- **The `storie-italiane` format** (named protagonist hook) — already lifestyle-friendly; extend to more content types

### What Should Change for a Lifestyle Direction

**1. Sources — add lifestyle/culture RSS feeds:**

- Italy: Dissapore (food), Donna Moderna, Grazia, Corriere Salute, Slow Food, ANSA Cultura
- France: Cuisine Actuelle, Marie Claire, Le Figaro Lifestyle, Télérama (culture), Régions de France

**2. NewsAPI queries — change vocabulary:**

- IT: from `"Roma salute famiglia pensioni"` → `"Italia cucina cultura tradizione benessere famiglia"` (positive lifestyle vocabulary)
- FR: from `"France actualité Provence Méditerranée"` → `"France culture gastronomie patrimoine régions bien-être"`

**3. Pillars — reduce heavy news targets, add lifestyle pillars:**

- Reduce `france-en-debat` (currently 9/week) and `fatto-del-giorno` (5/week) targets
- Add new pillars: `ricette-italiane`, `benessere`, `le-belle-cose`, `cucina-di-stagione` (IT); `bien-vivre`, `gastronomie-francaise`, `patrimoine-vivant` (FR)

**4. Criticality scoring — add a positive-story pass:**

- The current `BREAKING_KEYWORDS` reward crisis events; articles mentioning `eccellenza`, `record`, `premiazione`, `tradizione`, `ricetta`, `festival`, `cultura`, `arte` should get a lifestyle bonus that competes with `alert`-tier crisis articles at the `publish_score` level

**5. Story categories — add lifestyle taxonomy:**

- Current 7 categories are news-framed; add: `Gastronomia`, `Stile di vita`, `Tradizioni`, `Viaggi` so Claude can classify and the dashboard can filter

**6. Identity mode — add a lifestyle mode:**

- Add `BENESSERE` (IT) / `BEAUTÉ DE VIVRE` (FR) — the warm nostalgic tone of `PATRIMOINE` extended to food, craft, beauty; hook format shifts from tension/conflict to sensory invitation

**7. Image prompts — add a food/craft/scene approach:**

- Current approach F (identity/pride crowd) is the closest to lifestyle
- Add approach G: `FOOD / CRAFT / SCENE` — beautifully lit Italian table, regional market, Provençal landscape — photojournalistic but warm, not breaking-news documentary grey

---

## Notes

- The `facebook-news-pipeline` public repo contains only legacy `.claude/commands/` files and an old implementation plan — not the live code. Signal Studio (`apps/news`) is the single source of truth.
- See `apps/news/src/config/sources.js` for the live feed list.
- See `apps/news/src/validators/contentValidator.js` for the full compliance rule set.
- See `apps/news/src/services/ai.js` for the complete Claude system prompt (the `CONTENT_SYSTEM_PROMPT` constant).
- See `apps/news/src/config/pillars.js` for the editorial pillar definitions and weekly targets.
