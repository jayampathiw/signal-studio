# Wild Eye (Wild Capture) — Cloud Automation: Channel-Specific Notes

> **Platform-level architecture lives in `docs/cloud-automation-workflow.md`.**
> This document covers only what is specific to the Wild Eye / Wild Capture channel.
> Read the platform doc first — this is an addendum, not a standalone reference.

---

## Channel key

`wildlife/intimacy/EN` — used in `apps/video/src/config/channels.js` and passed to the runner as the channel identifier.

---

## Wild Eye Tier 3 skills

| Skill | File | What it encodes |
|---|---|---|
| `wild-eye-reel` | `.claude/skills/wild-eye-reel/SKILL.md` | Full orchestration for Wild Capture: storyboard-first → per-scene generate → SEO → persist. Calls Tier 1 (`higgsfield:generate`) and Tier 2 (`higgsfield-credit-guard`, `continuity-checker`, `seo-writer`). |
| `wild-eye-brief` | `.claude/skills/wild-eye-brief/SKILL.md` | Brief creation with Wild Eye house rules: cavy-only species until 2,000 followers, formula selection (11s/21s/portrait), no Tue/Wed/Thu scheduling, near-duplicate detection. |

---

## Wild Eye knowledge files

| File | Lines | Purpose |
|---|---|---|
| `apps/video/knowledge/wild-eye/house-style.md` | 166 | Channel rules, formulas, scheduling, species rules |
| `apps/video/knowledge/wild-eye/script-library.md` | 512 | Proven scripts with performance data |
| `apps/video/knowledge/wild-eye/seo-examples.md` | 248 | Performance-rated SEO packages |

---

## Posting schedule (cron entries for `generate.yml`)

| Format | Slot | UTC cron | Channel |
|---|---|---|---|
| 11s reel | Fri 23:00 BST | `0 22 * * 5` | `wild-eye` |
| 21s reel | Sat 07:30 BST | `30 6 * * 6` | `wild-eye` |
| Portrait | Sun 10:00 BST | `0 9 * * 0` | `wild-eye` |
| Portrait | Thu 10:00 BST | `0 9 * * 4` | `wild-eye` |

The no-Tue/Wed/Thu house rule (enforced in `wild-eye-brief`) governs **reels** — reels never post Tue/Wed/Thu. The **Thu 10:00 portrait** slot is the one deliberate exception: portraits drive engagement rather than reach, so a mid-week still is allowed. No format posts on Tue or Wed.

---

## Formats

Defined in `apps/video/src/config/channels.js` under `wildlife/intimacy/EN`:

| Key | Type | Duration | Scenes | Formula | Slot |
|---|---|---|---|---|---|
| `11s` | reel | 11s | 1 | `hidden-intimacy` — single intimate scene, drives reach | Fri 23:00 BST |
| `21s` | reel | 21s | 3 | `tension-survival` — 3-scene arc, drives follows | Sat 07:30 BST |
| `portrait` | image | — | 1 | `portrait` — photorealistic still, drives engagement | Sun/Thu 10:00 BST |

---

## Wild Eye-specific house rules enforced by Tier 3 skills

- Species: South American wild cavies only until 2,000 followers
- Audio: natural only — no music score, no drone unless explicitly earned
- Reel CTA: ends exactly `Follow for more hidden moments from the wild.`
- Portrait CTA: ends with a question (not the reel CTA)
- SEO: held until all scenes are `video_done`
- Safe-language substitutions enforced by `apps/video/scripts/safe-language-lint.mjs` hook

---

## Supabase credentials for Wild Eye

- Project: `nnxtvbolhuvihlpwppbj`
- Page ID (pre-filled in `.env.example`): `FB_PAGE_ID_WILD_CAPTURE = 61589970296554`
- Page token (set in `.env`): `FB_ACCESS_TOKEN_WILD_CAPTURE` — required for publish step (deferred)

---

## Research findings that shaped Wild Eye's design

Documented in `docs/wild-eye/integration-and-video-pipeline.md §2`. Key constraints that drove design decisions:
- Higgsfield MCP is agent-driven only (interactive sessions); cloud path uses CLI
- Wild Capture is not stock-clip based — every frame generated via Higgsfield Seedance/Kling
- C-09 "fox spots cavy" failure → `final_frame_url` continuity chaining between scenes
