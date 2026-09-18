# Signal Studio — Documentation Index

Start here. This folder is the canonical documentation set for the project; each file has one clear job and they do not overlap.

## Read in this order

| #   | Doc                                                                  | Read it for                                                                                                                                        | Audience                              |
| --- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| 1   | [`implementation-guide.md`](implementation-guide.md)                 | **Onboarding.** Full architecture, tech stack, file map, schema, workflows, setup, debugging                                                       | Anyone new to the repo                |
| 2   | [`PROJECT-STATUS.md`](PROJECT-STATUS.md)                             | **What's built vs pending.** Progress tracker, known bugs, roadmap, next milestone                                                                 | Anyone planning work                  |
| 3   | [`refactor/refactor-plan.md`](refactor/refactor-plan.md)             | **Active initiative.** The signal-studio engine refactor: phased plan, decisions log, and the live per-task completion tracker                     | Anyone doing refactor work            |
| 4   | [`cloud-automation-workflow.md`](cloud-automation-workflow.md)       | The 3-tier skills architecture and the unattended cloud generation flow (platform-level)                                                           | Working on automation / new channels  |
| 5   | [`video-generation-flow.md`](video-generation-flow.md)               | The definitive reel lifecycle: brief → scenes → scenarios → status → rendered, with the `scenes` jsonb shape                                       | Working on generation                 |
| 6   | [`higgsfield-models.md`](higgsfield-models.md)                       | Higgsfield image/video model IDs, params, and the Scenario-3 `end_image` constraint                                                                | Picking or wiring models              |
| 7   | [`longform-v2-image-first-plan.md`](longform-v2-image-first-plan.md) | Long-form "image-first" pipeline design — companion plan for the `longform-doc-playbook` skill                                                     | Building/reviewing long-form scripts  |
| 8   | [`schemas/`](schemas/)                                               | Generated JSON Schema for the engine's `manifest.v1`/`project.v1`/`timeline.v1` zod schemas (`pnpm --filter @signal-studio/core run schemas:json`) | Building against the engine's core IR |

Historical/superseded planning docs (long-form pipeline lineage, Wild Eye drafts, shotlist iterations, news pipeline QA/deployment notes) were moved to `signal-studio-workspace/docs/archive/` in P0.6 — see that repo's `docs/archive/README.md` for the full list and why each moved, and what was deliberately kept here instead.

## Also authoritative (outside this folder)

| Source                                  | What it owns                                                       |
| --------------------------------------- | ------------------------------------------------------------------ |
| [`../CLAUDE.md`](../CLAUDE.md)          | Agent operating guide — conventions, gotchas, quick pointers       |
| `apps/video/src/config/channels.js`     | Channel registry (the behavioural spine)                           |
| `.claude/skills/wild-eye-reel/SKILL.md` | The generation orchestrator (executable spec)                      |
| `apps/video/knowledge/wild-eye/*`       | Channel creative rules (house-style, script library, SEO examples) |

## Conventions for this folder

- **One job per doc.** If two docs would say the same thing, link instead of copying.
- **`PROJECT-STATUS.md` is the only progress tracker** for the live product; `refactor/refactor-plan.md` is the only tracker for the engine refactor. Don't start a third one.
- When a load-bearing surface changes (`channels.js`, `wild-eye-reel/SKILL.md`, the edge functions, the migration list), update `implementation-guide.md` and `PROJECT-STATUS.md` in the same change.
- Dated, point-in-time review notes are historical — fold any still-true action items into `PROJECT-STATUS.md` rather than leaving parallel plans. Once a plan doc is fully superseded, move it to `signal-studio-workspace/docs/archive/` rather than deleting it or letting it linger here.
