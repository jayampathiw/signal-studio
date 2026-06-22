# Content Platform — Cloud Automation Workflow

> **Status: Architecture finalised 2026-06-22. Implementation pending.**
> This is a **platform-level document**. It applies to every channel on the platform — Wild Eye (Wild Capture) is the first implementation. Sports, cartoon, and any future channels follow the same pattern by adding Tier 3 channel skills and a cron entry.

---

## 1. Overview

The cloud automation workflow is a fully unattended pipeline that picks the oldest approved brief for a channel, generates all video/image assets via Higgsfield, writes results to Supabase, and stops before upload. Every component is cloud-to-cloud — the local machine has zero runtime involvement.

**Reuse pattern:** to add a new channel (e.g. Sports, Cartoon), you write one Tier 3 skill pair (`<channel>-reel` + `<channel>-brief`), add a cron entry, and the rest of the stack is inherited.

---

## 2. 3-Tier Skills Architecture

This is the core design principle. Every skill in the platform belongs to exactly one tier.

```
Tier 1 — Official Higgsfield Skills
    ↓ wraps ↓
Tier 2 — Content-Platform (Signal Studio) Skills
    ↓ wraps ↓
Tier 3 — Channel / Page Skills
```

### Tier 1 — Official Higgsfield Skills
| Property | Detail |
|---|---|
| Source | `github.com/higgsfield-ai/skills` |
| Install | `npx skills add higgsfield-ai/skills` (on runner at job start) |
| Scope | Higgsfield platform mechanics only — model selection, job polling, auto-upload, virality |
| Maintained by | Higgsfield AI — auto-updates with new models |
| Skills | `higgsfield:generate`, `higgsfield:soul-id`, `higgsfield:product-photoshoot` |

These skills know nothing about your content strategy, house rules, or channels. They just talk to Higgsfield.

### Tier 2 — Content-Platform (Signal Studio) Skills
| Property | Detail |
|---|---|
| Source | `signal-studio` repo → `.claude/skills/` and `.claude/agents/` |
| Scope | Platform-wide rules applicable to **all channels** |
| Maintained by | Signal Studio team |

| Skill / Agent | Applies to | Why platform-level |
|---|---|---|
| `higgsfield-credit-guard` | All channels | Hard credit ceiling before any generation run; Tier 1 has no abort logic |
| `image-quality-gate` agent | All AI image/video channels | Vision review after every image generation — checks prompt adherence, realism, lighting, species, prohibited content. Hard gate for start/end frames; advisory for storyboard. |
| `continuity-checker` agent | All AI video channels | Scene-to-scene continuity; runs after quality gate passes |
| `seo-writer` agent | All channels | Base SEO generation; channel skills pass channel-specific rules as context |
| `performance-analyst` agent | All channels (interactive) | Reads DB + script library; channel-agnostic |

### Tier 3 — Channel / Page Skills
| Property | Detail |
|---|---|
| Source | `signal-studio` repo → `.claude/skills/` (prefix: `<channel>-`) |
| Scope | Rules and orchestration for **one specific channel** |
| Maintained by | Signal Studio team (per channel) |

| Channel | Orchestrator skill | Brief skill | What it encodes |
|---|---|---|---|
| Wild Eye (Wild Capture) | `wild-eye-reel` | `wild-eye-brief` | Cavy-only, formula selection (11s/21s/portrait), no Tue/Wed/Thu, natural audio, CTA phrasing |
| Sports *(future)* | `sports-reel` | `sports-brief` | Sports-specific house rules, formats, scheduling |
| Cartoon *(future)* | `cartoon-reel` | `cartoon-brief` | Cartoon-specific house rules, formats, scheduling |

**Rule:** anything that only applies to one channel lives in Tier 3. Anything that would be copy-pasted across two or more channels gets promoted to Tier 2. Tier 1 is never modified by us.

### Directory layout

```
.claude/
  skills/
    # Tier 2 — platform skills
    higgsfield-credit-guard/SKILL.md

    # Tier 3 — channel skills (naming convention: <channel>-<role>)
    wild-eye-reel/SKILL.md
    wild-eye-brief/SKILL.md
    sports-reel/SKILL.md          ← future
    cartoon-reel/SKILL.md         ← future

  agents/
    # Tier 2 — platform agents
    continuity-checker.md
    seo-writer.md
    performance-analyst.md

  commands/
    # Interactive only — one set per channel
    new-wild-reel.md
    new-11s-reel.md
    new-21s-reel.md
    new-portrait.md
    wild-seo.md
    wild-status.md
    log-reel.md
```

---

## 3. Repository layout

```
reel-pipeline (public — GitHub Actions host)
  ├── .github/workflows/
  │     └── generate.yml          ← parameterised by channel, runs all channels
  └── scripts/
        └── runner.sh             ← thin shell wrapper

signal-studio (private — checked out at runtime via deploy key)
  ├── .claude/skills/             ← Tier 2 + Tier 3 skills
  ├── .claude/agents/             ← Tier 2 agents
  ├── apps/video/knowledge/       ← per-channel knowledge files
  └── packages/database/          ← Supabase CRUD
```

Official Higgsfield skills (Tier 1) are installed on the runner at job start — they do not live in either repo.

---

## 4. Runtime flow (generic)

```
GitHub Actions trigger
  ├── cron  → channel determined from cron schedule mapping
  └── workflow_dispatch → channel passed as input parameter

ubuntu-latest runner (GitHub cloud — zero local involvement)
  │
  ├── checkout reel-pipeline
  ├── checkout signal-studio → /workspace/content  (deploy key)
  ├── npm install -g @anthropic-ai/claude-code @higgsfield/cli
  ├── npx skills add higgsfield-ai/skills              (Tier 1)
  └── restore HIGGSFIELD_AUTH_TOKEN → ~/.higgsfield/credentials
  │
  ▼
claude --print "run <channel>-reel skill for oldest status=brief row in channel <channel-key>"
  (Claude Code CLI loads .claude/skills/ from signal-studio checkout)
  │
  ▼
<channel>-reel skill (Tier 3) orchestrates:
  1. higgsfield-credit-guard  (Tier 2) → abort if balance < 50 credits
  2. Supabase read            → oldest status='brief' row for this channel
  3. Brief expand             → scene prompts (channel house rules applied)
  4. higgsfield:generate      (Tier 1) → storyboard image (2K, cheap)
  5. image-quality-gate       (Tier 2) → storyboard advisory review
  6. Per scene in order:
     a. higgsfield:generate   (Tier 1) → start frame (--start-image from prev scene)
     b. image-quality-gate    (Tier 2) → hard gate: pass / retry / blocked
     c. continuity-checker    (Tier 2) → hard conflict? → status_note + STOP
     d. [Scenario 3 only] generate end frame → image-quality-gate
     e. higgsfield:generate   (Tier 1) → video (--wait, channel duration)
     f. Write scene → Supabase scenes jsonb
  7. seo-writer               (Tier 2) → title / desc / hashtags → seo jsonb
  8. Supabase write           → status='rendered'
  STOP — no upload
  │
  ▼
All communication is cloud-to-cloud:
  runner → Anthropic API      (Claude Code CLI, ANTHROPIC_API_KEY)
  runner → Higgsfield API     (Higgsfield CLI, stored OAuth token)
  runner → Supabase           (packages/database CRUD, service role key)
```

---

## 5. GitHub Actions workflow (parameterised)

```yaml
# .github/workflows/generate.yml (in reel-pipeline)

on:
  workflow_dispatch:
    inputs:
      channel:
        description: 'Channel slug (wild-eye, sports, cartoon)'
        required: true
        default: 'wild-eye'
      content_id:
        description: 'Force a specific content_items.id (optional)'
        required: false

  schedule:
    # Wild Eye — posting slots (UTC)
    - cron: '0 22 * * 5'    # Fri 22:00 UTC = Fri 23:00 BST  (11s reel)
    - cron: '30 6 * * 6'    # Sat 06:30 UTC = Sat 07:30 BST  (21s reel)
    - cron: '0 9 * * 0'     # Sun 09:00 UTC = Sun 10:00 BST  (portrait)
    - cron: '0 9 * * 4'     # Thu 09:00 UTC = Thu 10:00 BST  (portrait)
    # Sports — add entries here when channel launches
    # Cartoon — add entries here when channel launches
```

The runner maps cron trigger times to channel slugs. `workflow_dispatch` accepts the channel directly.

---

## 6. Authentication — one-time local setup

Two secrets are created once, stored in GitHub Actions, and never touched again:

| Secret | How to get | GitHub secret name |
|---|---|---|
| Higgsfield CLI token | `npm install -g @higgsfield/cli` → `higgsfield auth login` (browser OAuth once) → copy token from `~/.higgsfield/credentials` | `HIGGSFIELD_AUTH_TOKEN` |
| Anthropic API key | console.anthropic.com → API Keys | `ANTHROPIC_API_KEY` |
| Supabase management token | supabase.com → Account Settings → Access Tokens → Generate | `SUPABASE_MCP_TOKEN` |
| signal-studio deploy key | `ssh-keygen` → public key added to signal-studio repo → Deploy Keys | `SIGNAL_STUDIO_DEPLOY_KEY` |

After this one-time setup, **every generation run is fully automated with zero local involvement.**

---

## 7. Image review (automated — Claude vision)

After each start frame is generated, Claude inspects the image against:
- Scene prompt (does the image match what was described?)
- Channel house rules loaded from `apps/video/knowledge/<channel>/house-style.md`
- Platform safety rules (no flagged elements)

**Pass** → continue to video generation.
**Fail** → set `scene_status = 'blocked'`, `status_note = 'review: <reason>'`, stop job.

Human review gate (GitHub Environment protection rules + image URL post) is **deferred** — design during video generation pipeline phase. The automated gate is sufficient for the initial launch.

---

## 8. Idempotency and concurrency

- **Idempotent resume:** scenes with `scene_status = 'video_done'` are skipped on re-run. A cancelled job resumes from the last incomplete scene — no re-payment.
- **Concurrency guard:** the orchestrator flips `status = 'generating'` before starting. A second runner or interactive session reading the same row sees `generating` and skips it.

---

## 9. Cost

| Component | Cost | Notes |
|---|---|---|
| GitHub Actions runner | **$0** | Free forever — public repo, no minute limit |
| Cross-repo checkout | **$0** | Network I/O on free runner |
| Anthropic API | **~$0.01–0.05 per reel** | ~20–50K tokens at Haiku pricing |
| Higgsfield generation | **$0 extra** | Covered by existing Max plan credits + unlimiteds |
| Supabase reads/writes | **$0 extra** | Covered by existing plan |

---

## 10. Adding a new channel — checklist

When a new channel (e.g. Sports) is ready to automate:

- [ ] Write `sports-brief` skill (Tier 3) — house rules, format definitions, scheduling rules
- [ ] Write `sports-reel` skill (Tier 3) — orchestrator calling Tier 1 + Tier 2 skills
- [ ] Add knowledge files: `apps/video/knowledge/sports/house-style.md`, `script-library.md`, `seo-examples.md`
- [ ] Register channel in `apps/video/src/config/channels.js`
- [ ] Add Supabase migration if new columns needed (unlikely — schema is generic)
- [ ] Add cron entries to `.github/workflows/generate.yml` for the channel's posting slots
- [ ] Add cron→channel mapping in runner script
- [ ] Test with `workflow_dispatch` before enabling cron

Tier 1 (official Higgsfield skills) and Tier 2 (credit guard, continuity, SEO, performance) require **zero changes**.

---

## 11. What is NOT in scope for this workflow

- **Upload / publish** — agent stops at `status='rendered'`; distribution is a separate plan
- **Brief creation** — done interactively via `/new-<channel>-reel`; cloud runner only processes `status='brief'` rows
- **Human storyboard approval** — deferred to video pipeline design phase
- **Performance tracking** — handled interactively via `/log-reel` and `performance-analyst` agent

---

## 12. Open items

| Item | When |
|---|---|
| Verify exact path of `~/.higgsfield/credentials` after `higgsfield auth login` | Implementation Step 1 |
| Confirm Higgsfield CLI token longevity (expiry? refresh needed?) | Implementation Step 1 |
| Design human review gate (GitHub Environment vs Slack vs Issue) | Video pipeline design phase |
| Decide cron→channel mapping strategy in runner script | Implementation Step 5 |
| `tracker.mjs` performance logging script | Post-launch (optional) |

---

## 13. Channel implementations

| Channel | Page | Status | Tier 3 skills | Knowledge files | Doc |
|---|---|---|---|---|---|
| Wild Eye (Wild Capture) | Wild Capture Facebook | ✅ Architecture done | `wild-eye-reel`, `wild-eye-brief` | `house-style.md`, `script-library.md`, `seo-examples.md` | `docs/wild-eye/integration-and-video-pipeline.md` |
| Sports | TBD | ⬜ Not started | — | — | — |
| Cartoon | TBD | ⬜ Not started | — | — | — |
