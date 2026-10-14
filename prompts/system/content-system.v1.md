# Content System Prompt — v1

**Status:** Stub — migrate full prompt from `facebook-news-pipeline/src/services/claude.js` (`CONTENT_SYSTEM_PROMPT` constant).

The full prompt covers:

- Facebook caption writing (7-block structure: hook, context, details, stakes, engagement question, source, CTA)
- SEO title + description generation
- Multi-language support: FR, IT, AU, SE
- Audience: adults 35+, factual tone, no political positions
- `cache_control: { type: 'ephemeral' }` applied at the system block level

**Important:** keep this file >2048 tokens to qualify for Anthropic prompt caching.
Both `generateCaption()` and `generateSEOContent()` reference this same file so they share one cache entry.
The Deno edge function (`supabase/functions/generate-caption/`) keeps a verbatim copy — update both together.
