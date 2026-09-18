# @signal-studio/news

News article pipeline. Fetches from RSS feeds + NewsAPI, generates Claude captions + SEO + image prompts via fal.ai, stores in Supabase, posts to Facebook (FR, IT — expandable).

## Run

```bash
npm run fetch           # full pipeline (all countries)
npm run generate-caption <id1> <id2>
npm run generate-image <id1>
npm run publish-slot    # post highest-scored pending article at current slot window
```

## Country config

Edit `src/config/sources.js` to add new country pages. See `../../docs/platform-consolidation/monorepo-structure.md` for the full guide.

## Resources

| Folder                | Contents                                       |
| --------------------- | ---------------------------------------------- |
| `resources/brand/`    | FR/IT page logos, watermarks, banners          |
| `resources/research/` | Source audits, audience analyses, Grok reports |
| `resources/docs/`     | Country strategy docs, posting-time analyses   |
