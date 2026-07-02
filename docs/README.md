# Signal Studio — Documentation Index

Start here. This folder is the canonical documentation set for the project; each file has one clear job and they do not overlap.

## Read in this order

| # | Doc | Read it for | Audience |
|---|---|---|---|
| 1 | [`implementation-guide.md`](implementation-guide.md) | **Onboarding.** Full architecture, tech stack, file map, schema, workflows, setup, debugging | Anyone new to the repo |
| 2 | [`PROJECT-STATUS.md`](PROJECT-STATUS.md) | **What's built vs pending.** Progress tracker, known bugs, roadmap, next milestone | Anyone planning work |
| 3 | [`cloud-automation-workflow.md`](cloud-automation-workflow.md) | The 3-tier skills architecture and the unattended cloud generation flow (platform-level) | Working on automation / new channels |
| 4 | [`video-generation-flow.md`](video-generation-flow.md) | The definitive reel lifecycle: brief → scenes → scenarios → status → rendered, with the `scenes` jsonb shape | Working on generation |
| 5 | [`higgsfield-models.md`](higgsfield-models.md) | Higgsfield image/video model IDs, params, and the Scenario-3 `end_image` constraint | Picking or wiring models |
| 6 | [`wild-eye/`](wild-eye/) | Wild Capture channel-specific addenda (schedule, formats, integration history) | Working on Wild Capture |
| 7 | [`long-form-pipeline-plan.md`](long-form-pipeline-plan.md) | **Active initiative.** Design + build tracker for the long-form (10–15 min+) parallel generation pipeline | Building long-form |

## Also authoritative (outside this folder)

| Source | What it owns |
|---|---|
| [`../CLAUDE.md`](../CLAUDE.md) | Agent operating guide — conventions, gotchas, quick pointers |
| `apps/video/src/config/channels.js` | Channel registry (the behavioural spine) |
| `.claude/skills/wild-eye-reel/SKILL.md` | The generation orchestrator (executable spec) |
| `apps/video/knowledge/wild-eye/*` | Channel creative rules (house-style, script library, SEO examples) |

## Conventions for this folder

- **One job per doc.** If two docs would say the same thing, link instead of copying.
- **`PROJECT-STATUS.md` is the only progress tracker.** Don't start a second one.
- When a load-bearing surface changes (`channels.js`, `wild-eye-reel/SKILL.md`, the edge functions, the migration list), update `implementation-guide.md` and `PROJECT-STATUS.md` in the same change.
- Dated, point-in-time review notes are historical — fold any still-true action items into `PROJECT-STATUS.md` rather than leaving parallel plans.
