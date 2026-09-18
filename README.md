# signal-studio

Multi-channel AI content publishing platform. Produces news articles (text + editorial image), short-form video reels (stock footage + AI-image modes), and documentaries across Facebook, Instagram, YouTube, and TikTok.

## Structure

```
apps/news/          News article pipeline — RSS/NewsAPI → Claude captions → fal.ai images → Facebook
apps/video/         Video pipeline — stock/AI-image/documentary → FFmpeg or Remotion → all platforms
apps/dashboard/     Angular review dashboard (Vercel)

packages/ai/        Claude client + image-gen provider router (fal.ai → Cloudflare → Google)
packages/render/    Engine-agnostic render contract (core), FFmpeg impl, Remotion impl
packages/media/     Kokoro TTS, Whisper subtitles, image compositing, Cloudflare R2 storage
packages/database/  Supabase client + CRUD helpers
packages/publishers/ Facebook / Instagram / YouTube / TikTok publish clients
packages/config/    Root .env loader + validation
packages/types/     Shared JSDoc typedefs

prompts/            Versioned system + task prompt files
data/               Reference inputs (style guides, taxonomies, source catalogs)
evals/              Eval harness — cases, traces, scorecards
.claude/            Claude Code native: agents, skills, commands, hooks
supabase/           Edge functions + migrations (shared Supabase project)
assets/             Shared music, logos, fonts
```

## Quick start

```bash
cp .env.example .env   # fill in values
npm install            # installs all workspace packages
npm run news           # run news pipeline
npm run video          # run video pipeline
```

## Runtime modes

| Mode        | Where                   | How AI/media is reached                                      |
| ----------- | ----------------------- | ------------------------------------------------------------ |
| Interactive | claude.ai / Claude Code | MCP servers (Higgsfield, Supabase, GitHub…)                  |
| Automated   | WSL + GitHub Actions    | Direct API calls (packages/ai, fal.ai REST) + edge functions |

## Active pages

| Page               | Country/Niche | Platform |
| ------------------ | ------------- | -------- |
| France Aujourd'hui | FR            | Facebook |
| Vivere in Italia   | IT            | Facebook |
| NaturePulse        | Wildlife/EN   | Facebook |
| NatureFrame        | Wildlife/EN   | Facebook |

## Docs

Full architecture, decisions, and roadmap: `docs/platform-consolidation/monorepo-structure.md`
Master plan: `docs/master-plan.md`
