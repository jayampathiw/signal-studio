# Wild Capture (Wild Eye) — Integration & Higgsfield Video Pipeline

> **Wild Capture** Facebook page (creative brand **Wild Eye**, `@WildEyePOV`) integrated into the `signal-studio` monorepo with a Higgsfield video-generation pipeline.
>
> **Status: fully implemented and deployed.** Migration applied to Supabase project `nnxtvbolhuvihlpwppbj` on 2026-06-21.
> Page: `facebook.com/profile.php?id=61589970296554`
>
> **Wild Eye is the first channel on a generic multi-channel platform.**
> Cloud automation architecture (generic, reusable for Sports/Cartoon/etc.): `docs/cloud-automation-workflow.md`
> Wild Eye channel-specific automation notes: `docs/wild-eye/cloud-automation-workflow.md`
>
> ⚠️ **This is a point-in-time integration record (2026-06-21..22).** Some inventory tables below predate the 3-tier skills consolidation (the `higgsfield-storyboard`, `higgsfield-scene-video`, and `virality-gate` skills were removed; `tracker.mjs` was built). For the live "what's done vs pending" view, use **`docs/PROJECT-STATUS.md`**.

---

## Context & two hard realities

Wild Capture is a Facebook Reels page producing AI-generated, photorealistic, documentary-style short-form video of South American wild cavies. Its creative assets (house-style rules, script library, SEO patterns, migration plan) were exported from a claude.ai web project at `temp/Wild Eye/` and have been migrated into the monorepo.

Two realities shaped every design decision:

1. **Higgsfield MCP is agent-driven, not a headless REST API.** It is only callable as tools inside a Claude session (`mcp__claude_ai_higgsfield__*`). A plain Node cron cannot call it. Generation must run inside a Claude agent.
2. **Wild Capture is not stock-clip based.** The existing `apps/video` pipeline fetches Pexels clips and FFmpeg-renders them. Wild Capture generates every frame via Higgsfield (Seedance/Kling) using a storyboard-first, continuity-chained workflow — a new source/renderer path, not reuse of the Pexels path.

### Confirmed decisions

| Decision              | Choice                                                                                                                            |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Generation model      | **Claude agent in-loop**, in two deployments: interactive (`claude.ai` / `claude.ai/code`) **and** a cloud-deployed agent.        |
| Upload / publish      | **Out of scope for the agent now** — separate distribution plan. Agent stops at `rendered`.                                       |
| Integration shape     | **New channel + `higgsfield` renderer engine inside `apps/video`** — reuses `content_items`, publishers, config.                  |
| Content types         | **One channel, `format` field on the content item** (`11s` / `21s` / `portrait`), extensible toward longer documentary formats.   |
| State source of truth | **Supabase `content_items`** + light `productions/<id>/` folder for continuity frames and prose notes. Reusable for future pages. |
| `scenes` jsonb        | **All text needed to regenerate** (prompts, job IDs, frame URLs); never binaries; populated progressively by lifecycle stage.     |

---

# Phase 1 — Integration Architecture ✅

### 1.1 Credentials & config ✅

- `.env.example` and `packages/config/schema.js` `optional[]` — `FB_PAGE_ID_WILD_CAPTURE` (pre-filled: `61589970296554`) and `FB_ACCESS_TOKEN_WILD_CAPTURE` registered.
- **No publisher code change needed**: `apps/video/src/publishers/facebook.js` already posts to Graph **v22.0** via `publish(contentItem, channelConfig)`, reading `channelConfig.platforms.facebook.envKey`. Wild Capture supplies `envKey: 'WILD_CAPTURE'`.
- **Remaining action**: set `FB_ACCESS_TOKEN_WILD_CAPTURE` in `.env` with the page token.

### 1.2 New channel — `apps/video/src/config/channels.js` ✅

```js
'wildlife/intimacy/EN': {
  niche: 'wildlife', style: 'intimacy', language: 'EN', contentLanguage: 'English',
  source: 'higgsfield',    // AI-gen source path (vs 'pexels')
  renderer: 'higgsfield',  // Higgsfield engine (vs 'reel')
  formats: {
    '11s':      { type: 'reel',  durationSec: 11,   scenes: 1, register: 'hidden-intimacy',  slot: 'Fri 23:00 BST',    description: 'Formula A — single intimate scene. Drives reach.' },
    '21s':      { type: 'reel',  durationSec: 21,   scenes: 3, register: 'tension-survival', slot: 'Sat 07:30 BST',    description: 'Formula B — 3-scene tension/survival arc. Drives follows.' },
    'portrait': { type: 'image', durationSec: null, scenes: 1, register: 'portrait',         slot: 'Sun/Thu 10:00 BST', description: 'Single photorealistic image portrait. Drives engagement/comments.' },
  },
  platforms: { facebook: { enabled: true, envKey: 'WILD_CAPTURE' } },
  watermarkFile: null, pageName: 'Wild Capture',
}
```

`formats` is the extension point for future documentary lengths — add a key, don't restructure.

### 1.3 Data model — `supabase/migrations/101_wild_eye.sql` ✅ (applied)

Applied to Supabase project `nnxtvbolhuvihlpwppbj` on 2026-06-21. Verified via `supabase db query`.

New columns on `content_items`:

| Column          | Type        | Nullable | Default | Purpose                                                           |
| --------------- | ----------- | -------- | ------- | ----------------------------------------------------------------- |
| `format`        | text        | YES      | —       | `'11s'` / `'21s'` / `'portrait'` (extensible)                     |
| `scenes`        | jsonb       | NO       | `'[]'`  | Storyboard + generation record (see §2.3)                         |
| `status_note`   | text        | YES      | —       | Non-null = unresolved continuity decision blocking publish        |
| `slot`          | text        | YES      | —       | Human-readable posting slot, e.g. `'Fri 23:00 BST'`               |
| `scheduled_for` | timestamptz | YES      | —       | Absolute scheduled post time                                      |
| `seo`           | jsonb       | YES      | —       | `{ title, description, hashtags[] }` — held until scenes approved |

Status CHECK extended: `brief` → `storyboard` → `generating` prepended to existing values.

Three partial indexes added: `idx_content_items_format`, `idx_content_items_status_note`, `idx_content_items_scheduled`.

CRUD via existing `packages/database/content-items.js` — no changes needed there.

### 1.4 Wild Eye knowledge files ✅

Migrated verbatim from `temp/Wild Eye/` into versioned prompt knowledge:

- `apps/video/knowledge/wild-eye/house-style.md` (166 lines) — channel rules, formulas, scheduling, species rules
- `apps/video/knowledge/wild-eye/script-library.md` (512 lines) — proven scripts with performance data; C-03 collision resolved to C-09/C-10
- `apps/video/knowledge/wild-eye/seo-examples.md` (248 lines) — performance-rated SEO packages

Loaded by `loadKnowledge()` in `apps/video/scripts/create-brief.mjs` (the single brief-creation path), and by the `wild-eye-reel` skill at session start.

### 1.5 `apps/video/scripts/create-brief.mjs` — knowledge loader ✅

`loadKnowledge(channelKey)` reads all three knowledge files (house-style, script-library, seo-examples) and returns them concatenated as system context for the brief validator. Gracefully skips missing files. (An earlier `loadWildEyeContext()` helper in `apps/video/src/services/ai.js` was removed as a dead export during code review — the loader now lives only in `create-brief.mjs`, eliminating the two-copy divergence.)

### 1.6 Distribution path — no changes needed ✅

When ready to publish: existing `apps/video/src/scripts/publish.js` + `publishToAll(item, channel)` post `rendered_video_url` to FB v22.0 and write `fb_status/fb_post_id/fb_posted_at`. Untouched per "skip upload" decision.

### 1.7 Data flow

```
brief (cheap row) ──insertContentItem──▶ content_items {status:'brief', format, scenes:[]}
                                                │
                     (Phase 2 agent populates scenes + renders)
                                                │
                         rendered clip URLs ◀───┘   status:'rendered'
                                                │
                  (your separate upload step) ──publishToAll──▶ Facebook v22.0 ──▶ fb_post_id
```

---

# Phase 2 — Video Generation Pipeline with Higgsfield MCP ✅

### 2.1 Architecture — the agent IS the renderer

The `higgsfield` renderer is **not** a Node module like `renderers/reel.js`. It is a **Claude agent + skill** calling `mcp__claude_ai_higgsfield__*` tools, with Supabase for shared state. Two deployments share one skill set and one DB:

```
            ┌──────────────────── shared ────────────────────┐
            │  Supabase content_items   knowledge/wild-eye/*  │
            │  .claude/skills/*         productions/<id>/     │
            └───────┬─────────────────────────────┬──────────┘
                    │                              │
        ┌───────────▼──────────┐      ┌────────────▼─────────────┐
        │ Interactive Claude   │      │ Cloud-deployed agent      │
        │ (claude.ai /code)    │      │ (scheduled / triggered)   │
        │ human approves gens  │      │ storyboard→auto-approve→  │
        │                      │      │ video; writes DB; STOPS   │
        │                      │      │ before upload             │
        └──────────┬───────────┘      └────────────┬─────────────┘
                   └───────────┬───────────────────┘
                               ▼
                 Higgsfield MCP (generate_image / generate_video /
                 job_status / reveal_generation / virality_predictor …)
```

The cloud agent must host a Claude session (not a bare Node process) — it's the only way to reach the Higgsfield MCP.

### 2.2 Generation workflow (storyboard-first)

Orchestrated by the `wild-eye-reel` skill, invoked via `/new-wild-reel`:

```
1. SELECT      load content_items row (status='brief' or id arg).
               Read knowledge/wild-eye/*. Run higgsfield-credit-guard.
2. STORYBOARD  expand brief → per-scene image_prompt + structured video_prompt
               (house-style format). Run safe-language-lint on every prompt.
               Generate ONE cheap multi-panel storyboard image (2K) to preview
               all scenes. Write prompts to scenes jsonb; status='storyboard'.
3. APPROVE     Interactive: human okays/edits. Cloud: run continuity-checker;
               auto-approve only if no hard conflicts; else set status_note + STOP.
4. GENERATE    Claim row: status='generating'. Per scene in order:
               a. generate_image → start frame (models_explore picks model;
                  prev scene's final_frame_url is the reference → continuity)
               b. Run continuity-checker (start frame vs next prompt)
               c. generate_video → Seedance 2.0, durationSec from format;
                  natural audio, NO music score
               d. job_status poll; on blocked → reveal_generation then re-poll;
                  record *_job + *_frame_url in scenes jsonb
5. ASSEMBLE    interactive: stitch in CapCut / FFmpeg; cloud: leave clips + paths.
6. SEO         only after all scenes video_done: title/desc/hashtags → seo jsonb.
               (seo-writer subagent enforces the hold-until-approved rule)
7. PERSIST     status='rendered'. STOP. No upload.
```

Continuity mechanism: **scene N's `final_frame_url` is fed as the reference image into scene N+1's start frame generation** — the exact fix for the C-09 fox-spots-cavy failure mode.

### 2.3 `scenes` jsonb shape (progressive population)

> **Canonical reference: `docs/video-generation-flow.md §4`** — full shape at every lifecycle stage, per format.

Terminal shape for a reel scene (all fields populated):

```jsonc
{
  "n": 1,
  "image_prompt": "…flowing paragraph, photorealistic, mood-led…",
  "video_prompt": {
    "composition": "…",
    "style": "…",
    "cameraMotion": "…",
    "subjects": "…",
    "action": "…",
    "location": "…",
    "audioCues": "…",
    "lighting": "…",
    "durationSec": 7,
  },
  "storyboard_url": "…", // scene 1 only; composite storyboard preview image
  "higgsfield_image_job": "…",
  "start_frame_url": "…",
  "higgsfield_video_job": "…",
  "clip_url": "…", // generated video clip
  "final_frame_url": "…", // → reference image for scene N+1
  "scene_status": "video_done", // pending | image_done | video_done | blocked
}
```

- `portrait` scenes omit `video_prompt`, `higgsfield_video_job`, `clip_url`, `final_frame_url`; terminal = `image_done`
- Written progressively: prompts at `storyboard`, image fields at `image_done`, video fields at `video_done`
- Text + URLs only — binaries live in Higgsfield CDN; trivial DB footprint

### 2.4 Quality gates

| Gate               | Mechanism                                            | Location                                          | Trigger                                                  |
| ------------------ | ---------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------- |
| Safe-language lint | Script + PostToolUse hook                            | `apps/video/scripts/safe-language-lint.mjs`       | On every Write/Edit tool call (`.claude/settings.json`)  |
| Continuity checker | Subagent                                             | `.claude/agents/continuity-checker.md`            | Between every scene; hard conflicts set `status_note`    |
| Credit guard       | Skill                                                | `.claude/skills/higgsfield-credit-guard/SKILL.md` | Session start; re-checked after each scene in cloud mode |
| House-rule guards  | Encoded in `wild-eye-brief` + `wild-eye-reel` skills | `.claude/skills/`                                 | Brief creation + generation                              |

**Safe-language substitutions** (enforced by lint script + hook):
`exposed roots → tangled root structures` · `predawn → cool morning light` · `toe pads → small paws` · `nose leather → muzzle detail` · `iris texture → eye catching light`

**House rules** (enforced by skills):

- Cavy-only until 2,000 followers
- Never schedule Tue / Wed / Thu for Reels
- Natural audio only — no music score, no drone unless the scene explicitly earns a barely-audible tension pulse
- SEO held until all scenes are `video_done`
- Reel descriptions end exactly: `Follow for more hidden moments from the wild.`
- Portraits end with a question (not the reel CTA)

### 2.5 Error handling & scalability

- **Credit control**: no live meter via MCP (top transcript risk) — `higgsfield-credit-guard` checks `balance` at start and aborts if < 50 credits; cloud default is 720p video + 2K images.
- **Blocked generations**: rights/sensitive block → `reveal_generation` → re-poll; max 2 retries → `scene_status='blocked'` + `status_note`.
- **Idempotent resume**: scenes already `video_done` are skipped on re-run — a crashed cloud run resumes from DB, never re-paying.
- **Concurrency**: cloud agent claims a row via `status='generating'` flip before starting — interactive session won't collide.
- **Monitoring**: `status` + `scene_status` + `status_note` are the dashboard surface; `listContentItems({status})` for queue depth; Higgsfield `transactions` for spend audit.
- **Throughput**: storyboard-first means one cheap 2K image gates N expensive video gens — a bad concept costs ~1 image, not N videos.

### 2.6 Execution modes (runbook)

**Mode 1 — Interactive (`claude.ai` / `claude.ai/code`)** — human in the loop.

One-time setup:

1. Settings → Connectors → Add custom connector → name: "Higgsfield" → paste URL from Higgsfield MCP/CLI tab → authenticate
2. Toggle Higgsfield on in any chat via the `+` menu
3. Set `generate_image` and `generate_video` permissions to **"ask"** (credit safety)

Per reel:

- Run `/new-wild-reel <id>` (or `/new-11s-reel`, `/new-21s-reel`, `/new-portrait` to create + generate)
- Approve the storyboard image before any video is generated
- Approve each scene's start frame; continuity feeds forward automatically
- Resolve any `status_note` flags before proceeding to video

Best for: new concepts, ideation, quality-sensitive reels, clearing blocked threads.

**Mode 2 — GitHub Actions cloud agent** — fully unattended batch.

> **Architecture finalised 2026-06-22.** Full design in `docs/wild-eye/cloud-automation-workflow.md`.

**Why not Higgsfield HTTP MCP:** the `mcp.higgsfield.ai/mcp` endpoint requires an interactive browser OAuth round-trip on first auth — it is not headless-capable. The Higgsfield CLI (`@higgsfield/cli`) is the documented automation path; it authenticates once via OAuth, stores a long-lived token, and runs entirely headlessly. No separate payment — the Max plan covers CLI generation from the same credit pool.

**Platform:** GitHub Actions on `reel-pipeline` (public repo) — free unlimited runner minutes. `signal-studio` (private) is checked out at runtime via a read-only SSH deploy key. All communication is cloud-to-cloud; the local machine is completely uninvolved after one-time setup.

**Higgsfield skills:** official `higgsfield-ai/skills` package replaces the custom `higgsfield-storyboard`, `higgsfield-scene-video`, and `virality-gate` skills. The official `higgsfield:generate` skill handles model selection, job polling (`--wait`), auto-upload, and virality prediction. Wild Eye domain skills (`wild-eye-reel`, `higgsfield-credit-guard`, `continuity-checker`, `seo-writer`) remain and wrap around it.

On trigger (cron: Fri 23:00 BST / Sat 07:30 BST / Sun 10:00 BST, or `workflow_dispatch`):

1. `higgsfield-credit-guard` — check balance via `higgsfield account balance`, abort if < 50 credits
2. Supabase read — oldest `status='brief'` row for `wildlife/intimacy/EN`
3. Brief expand → scene prompts with house-style rules applied
4. `higgsfield:generate` — storyboard image (2K); Claude vision auto-reviews vs house rules
5. Per scene in order: start frame → continuity-checker → video (`--wait`) → write to `scenes` jsonb
6. `seo-writer` → `seo` jsonb
7. Supabase write → `status='rendered'` → **STOP** (no upload)

Guardrails: idempotent (`video_done` scenes skipped on resume), concurrency guard via `status='generating'` flip, credit re-checked after each scene, retry-then-`blocked` on rights holds.

Best for: generating a queue of pre-vetted briefs fully unattended on the posting schedule.

### 2.7 Skills, subagents, commands & hooks — complete inventory

All artifacts live in the **root `.claude/`** directory (not `apps/video/.claude/`) so they are discoverable from the project root in all Claude sessions.

**Skills split after cloud automation design (2026-06-22) — 3-tier architecture:**
See `docs/cloud-automation-workflow.md §2` for the full tier definitions. Wild Eye skills summary:

#### Tier 1 — Official Higgsfield skills (installed at runtime via `npx skills add higgsfield-ai/skills`)

| #   | Name                  | Type           | Priority | Used by                           |
| --- | --------------------- | -------------- | -------- | --------------------------------- |
| 0   | `higgsfield:generate` | Official skill | MUST     | both — replaces #2, #3, #14 below |

#### Tier 2 — Platform (Signal Studio) skills + Tier 3 — Wild Eye channel skills (in `.claude/` — signal-studio)

| #   | Tier | Name                      | Type          | File path                                         | Priority      | Used by     | Status                                        |
| --- | ---- | ------------------------- | ------------- | ------------------------------------------------- | ------------- | ----------- | --------------------------------------------- |
| 1   | T3   | `wild-eye-reel`           | Skill         | `.claude/skills/wild-eye-reel/SKILL.md`           | MUST          | both        | UPDATE — rewire to call `higgsfield:generate` |
| 2   | T3   | `higgsfield-storyboard`   | Skill         | `.claude/skills/higgsfield-storyboard/SKILL.md`   | —             | —           | DELETE — replaced by Tier 1                   |
| 3   | T3   | `higgsfield-scene-video`  | Skill         | `.claude/skills/higgsfield-scene-video/SKILL.md`  | —             | —           | DELETE — replaced by Tier 1                   |
| 4   | T2   | `higgsfield-credit-guard` | Skill         | `.claude/skills/higgsfield-credit-guard/SKILL.md` | MUST          | both        | UPDATE — use `higgsfield account balance` CLI |
| 5   | T2   | `continuity-checker`      | Subagent      | `.claude/agents/continuity-checker.md`            | MUST          | both        | KEEP                                          |
| 6   | T2   | `safe-language-lint`      | Script + hook | `apps/video/scripts/safe-language-lint.mjs`       | MUST          | both        | KEEP                                          |
| 7   | T3   | `wild-eye-brief`          | Skill         | `.claude/skills/wild-eye-brief/SKILL.md`          | MUST          | interactive | KEEP                                          |
| 8   | T2   | `seo-writer`              | Subagent      | `.claude/agents/seo-writer.md`                    | MUST          | both        | KEEP                                          |
| 9   | T3   | `/new-wild-reel`          | Command       | `.claude/commands/new-wild-reel.md`               | MUST          | interactive | KEEP                                          |
| 10  | T3   | `/new-11s-reel`           | Command       | `.claude/commands/new-11s-reel.md`                | MUST          | interactive | KEEP                                          |
| 11  | T3   | `/new-21s-reel`           | Command       | `.claude/commands/new-21s-reel.md`                | MUST          | interactive | KEEP                                          |
| 12  | T3   | `/new-portrait`           | Command       | `.claude/commands/new-portrait.md`                | MUST          | interactive | KEEP                                          |
| 13  | T3   | `/wild-seo`               | Command       | `.claude/commands/wild-seo.md`                    | MUST          | interactive | KEEP                                          |
| 14  | T3   | `virality-gate`           | Skill         | `.claude/skills/virality-gate/SKILL.md`           | —             | —           | DELETE — built into Tier 1                    |
| 15  | T2   | `performance-analyst`     | Subagent      | `.claude/agents/performance-analyst.md`           | Optional      | interactive | KEEP                                          |
| 16  | T3   | `/wild-status`            | Command       | `.claude/commands/wild-status.md`                 | Optional      | interactive | KEEP                                          |
| 17  | T3   | `/log-reel`               | Command       | `.claude/commands/log-reel.md`                    | Optional      | interactive | KEEP                                          |
| 18  | T2   | `tracker.mjs`             | Script        | `apps/video/scripts/tracker.mjs`                  | Not yet built | interactive | PENDING                                       |

**Cloud agent loadout:** Tier 1 `higgsfield:generate` + Tier 2 skills (#4, #5, #6, #8) + Tier 3 Wild Eye skill (#1).
**Interactive loadout:** all of the above + all Tier 3 commands (#9–13, #16, #17).

**Why each MUST still exists after the reshuffle:**

- `continuity-checker` (T2) — the exact C-09 "fox spots cavy" failure; platform-level, reused by all future channels
- `safe-language-lint` (T2) — moderation rejects flagged words; deterministic → hook on every Write/Edit
- `higgsfield-credit-guard` (T2) — Tier 1 has cost estimation but no hard abort ceiling; T2 enforces the limit
- `seo-writer` (T2) — structural isolation enforces "hold SEO until scenes approved"; channel rules passed as context
- `wild-eye-brief` (T3) — encodes Wild Eye-specific formula selection, cavy-only, no Tue/Wed/Thu
- `higgsfield:generate` (T1) — handles CLI auth, polling, model defaults, virality; Higgsfield-maintained

---

## Higgsfield access — source reference

`apps/video/src/sources/higgsfield.md` documents:

- Connection setup (OAuth MCP on claude.ai for interactive; CLI token for cloud agents)
- Model recommendations for Wild Capture (Seedance 2.0 for video, Nano Banana Pro / GPT Image 2 for frames)
- Multi-shot vs single-shot prompting for Seedance
- Approval mode guidance (interactive: "ask"; cloud: auto with guards)
- Rights/blocked generation handling procedure
- Credit management (`higgsfield account balance` pre-check; no live meter during generation)
- Style consistency across scenes (one model per reel, continuity via `--start-image` final-frame reference)

**Note (2026-06-22):** The HTTP MCP endpoint (`mcp.higgsfield.ai/mcp`) requires interactive browser OAuth and cannot be used headlessly. Cloud automation uses the Higgsfield CLI exclusively. See `docs/wild-eye/cloud-automation-workflow.md` §2.1 for full research findings.

---

## Productions folder convention

`productions/template/README.md` — copy this to `productions/C-{id}-{slug}/README.md` for each reel. Contains:

- Brief, scene beat table, continuity frame log, open threads, decisions log, generation metadata (mirrors `scenes` jsonb), SEO, performance log

The DB (`content_items`) is the source of truth for lifecycle/status. The `productions/<id>/` folder is the human-readable companion — prose decisions, downloaded reference frames for visual continuity checks.

---

## Implemented file inventory

### Created

| File                                                 | Status                                                |
| ---------------------------------------------------- | ----------------------------------------------------- |
| `supabase/migrations/101_wild_eye.sql`               | ✅ Applied to `nnxtvbolhuvihlpwppbj`                  |
| `apps/video/knowledge/wild-eye/house-style.md`       | ✅                                                    |
| `apps/video/knowledge/wild-eye/script-library.md`    | ✅                                                    |
| `apps/video/knowledge/wild-eye/seo-examples.md`      | ✅                                                    |
| `apps/video/scripts/safe-language-lint.mjs`          | ✅                                                    |
| `apps/video/src/sources/higgsfield.md`               | ✅                                                    |
| `apps/video/scripts/tracker.mjs`                     | ✅ Built (2026-06-23)                                 |
| `apps/video/scripts/assemble-reel.mjs`               | ✅ Built (21s FFmpeg concat → R2)                     |
| `apps/video/src/config/channel-slugs.js`             | ✅ Built (slug → channel_key registry)                |
| `.claude/skills/wild-eye-reel/SKILL.md`              | ✅ (rewired to `higgsfield:generate`)                 |
| `.claude/skills/wild-eye-brief/SKILL.md`             | ✅                                                    |
| `.claude/skills/higgsfield-credit-guard/SKILL.md`    | ✅                                                    |
| ~~`.claude/skills/higgsfield-storyboard/SKILL.md`~~  | ❌ Removed — replaced by Tier 1 `higgsfield:generate` |
| ~~`.claude/skills/higgsfield-scene-video/SKILL.md`~~ | ❌ Removed — replaced by Tier 1                       |
| ~~`.claude/skills/virality-gate/SKILL.md`~~          | ❌ Removed — built into Tier 1                        |
| `.claude/agents/continuity-checker.md`               | ✅                                                    |
| `.claude/agents/image-quality-gate.md`               | ✅ (hard vision gate)                                 |
| `.claude/agents/seo-writer.md`                       | ✅                                                    |
| `.claude/agents/performance-analyst.md`              | ✅                                                    |
| `.claude/commands/new-wild-reel.md`                  | ✅                                                    |
| `.claude/commands/new-11s-reel.md`                   | ✅                                                    |
| `.claude/commands/new-21s-reel.md`                   | ✅                                                    |
| `.claude/commands/new-portrait.md`                   | ✅                                                    |
| `.claude/commands/wild-seo.md`                       | ✅                                                    |
| `.claude/commands/wild-status.md`                    | ✅                                                    |
| `.claude/commands/log-reel.md`                       | ✅                                                    |
| `productions/template/README.md`                     | ✅                                                    |
| `docs/wild-eye/integration-and-video-pipeline.md`    | ✅ This file                                          |

### Modified

| File                                  | Change                                                                                                         |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `apps/video/src/config/channels.js`   | Added `wildlife/intimacy/EN` channel                                                                           |
| `packages/config/schema.js`           | Registered `FB_PAGE_ID_WILD_CAPTURE`, `FB_ACCESS_TOKEN_WILD_CAPTURE`                                           |
| `.env.example`                        | Added Wild Capture section with page ID pre-filled                                                             |
| `apps/video/scripts/create-brief.mjs` | `loadKnowledge()` loads the three knowledge files (replaces the removed `ai.js` `loadWildEyeContext()` helper) |
| `.claude/settings.json`               | Added `PostToolUse` hooks for `Write`/`Edit` → `safe-language-lint.mjs`                                        |

### Not touched (by design)

- `apps/video/src/publishers/*` — publish path unchanged; `publish(contentItem, channelConfig)` works as-is
- `apps/video/src/scripts/publish.js` — upload/publish step is the user's separate plan

---

## Verification status

| Check                                                               | Status      | Notes                                                                                                        |
| ------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------ |
| `getChannel('wildlife/intimacy/EN')` returns channel with `formats` | ✅ Verified | `renderer: 'higgsfield'`, `fb envKey: 'WILD_CAPTURE'`, 9 total channels                                      |
| Schema validation passes with new env vars                          | ✅ Verified | Both keys in `schema.optional`                                                                               |
| `safe-language-lint.mjs` catches all 5 flagged words                | ✅ Verified | Exit 1 on detect; `--fix` substitutes all                                                                    |
| Migration applied to Supabase `nnxtvbolhuvihlpwppbj`                | ✅ Verified | 6 columns + extended CHECK + 3 indexes confirmed via `db query`                                              |
| `/new-wild-reel <id>` → full generation cycle                       | ⬜ Pending  | Requires Higgsfield CLI authenticated + `FB_ACCESS_TOKEN_WILD_CAPTURE` set                                   |
| Cloud agent deploy + idempotent resume                              | ⬜ Pending  | Architecture finalised 2026-06-22; implementation pending (see `docs/wild-eye/cloud-automation-workflow.md`) |
| Official `higgsfield-ai/skills` installed + `wild-eye-reel` rewired | ⬜ Pending  | Part of cloud automation implementation Step 2–4                                                             |
| `listContentItems` shows full lifecycle                             | ⬜ Pending  | Requires a test brief row                                                                                    |
