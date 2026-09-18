# Video Generation Flow — Complete Lifecycle Reference

> **Status: Finalised 2026-06-22. This is the definitive reference.**
> Applies to all channels on this platform. Wild Eye (Wild Capture) is the first implementation.
> Implementation artifacts: `.claude/skills/wild-eye-reel/SKILL.md`, `docs/wild-eye/integration-and-video-pipeline.md`

---

## 0. Brief creation — entry point to the lifecycle

A brief is a `content_items` row with `status='brief'`. It is the input to the generation pipeline. Two entry points exist — both call the **same shared script**, ensuring identical validation and AI behaviour regardless of how the brief was created.

### 0.1 Two entry points, one script

```
Entry A — Interactive (Claude skill)         Entry B — Programmatic (CLI / bulk)
─────────────────────────────────────        ──────────────────────────────────────
User types: /new-11s-reel "concept"          node apps/video/scripts/create-brief.mjs \
                                               --channel "wildlife/intimacy/EN" \
Claude skill (wild-eye-brief):                 --concept "A cavy waking at dawn" \
  • takes user input                           --format 11s
  • calls create-brief.mjs
    with --concept and optional --format
                │                                           │
                └───────────────────┬───────────────────────┘
                                    ↓
              apps/video/scripts/create-brief.mjs
              ════════════════════════════════════
              Phase 1 — AI steps (Claude API)
                1. Species / concept check
                   → reject if primary subject is not cavy (Wild Eye rule)
                   → suggest cavy reframe if rejected
                2. Format recommendation
                   → if --format omitted, recommend based on concept
                   → intimate/single-moment → 11s
                   → tension/threat arc     → 21s
                   → single striking close-up → portrait
                3. Title generation
                   → curiosity-gap headline, 1 emoji, < 10 words
                   → e.g. "What She Does Before the World Wakes Up 🌅"
                4. Narrative tension check (21s only)
                   → verify concept supplies 3-beat arc: calm → threat → resolution
                   → if not, output a clarifying question and STOP

              Phase 2 — Deterministic steps (no AI)
                5. Slot validation
                   → derive slot from format + channel config
                   → reject Tue/Wed/Thu for Reels (house rule)
                6. Near-duplicate check
                   → query content_items (last 30 days, same channel)
                   → query reels_log (topic_hash match, channel='Wild Capture')
                   → if match found: warn and ask to confirm
                7. INSERT content_items
                   → channel_key, format, title, description, slot, scheduled_for
                   → status = 'brief', scenes = '[]'
                8. Return { id, title, format, slot }
              ════════════════════════════════════
```

### 0.2 Script interface

```bash
node apps/video/scripts/create-brief.mjs [options]

Required:
  --channel   Channel key, e.g. "wildlife/intimacy/EN"
  --concept   Raw idea text (one sentence or more)

Optional:
  --format    Format key: 11s | 21s | portrait
              If omitted, AI recommends based on concept.
  --slot      Override posting slot, e.g. "Fri 23:00 BST"
              If omitted, derived from format + channel config.
  --scheduled-for  ISO datetime for absolute scheduling

Output (stdout, JSON):
  { "id": 42, "title": "...", "format": "11s", "slot": "Fri 23:00 BST" }
```

### 0.3 File locations

| File                                     | Role                                                                                |
| ---------------------------------------- | ----------------------------------------------------------------------------------- |
| `apps/video/scripts/create-brief.mjs`    | Single source of truth — AI steps + INSERT. Called by both entry points.            |
| `packages/database/briefs.js`            | `createBrief()` — pure INSERT function; called by `create-brief.mjs` after AI steps |
| `.claude/skills/wild-eye-brief/SKILL.md` | Interactive entry point — takes user input, calls `create-brief.mjs`                |
| `.claude/commands/new-11s-reel.md`       | Slash command wrapper — passes concept + `--format 11s` to the skill                |
| `.claude/commands/new-21s-reel.md`       | Slash command wrapper — passes concept + `--format 21s` to the skill                |
| `.claude/commands/new-portrait.md`       | Slash command wrapper — passes concept + `--format portrait` to the skill           |

### 0.4 AI steps — shared prompt

The AI steps in Phase 1 use the same system context for both entry points:

- `apps/video/knowledge/<channel>/house-style.md` — species rules, format guidance, scheduling rules
- `apps/video/knowledge/<channel>/script-library.md` — proven title patterns

This ensures consistent species checking, title quality, and format recommendations regardless of whether the brief was created interactively or via script.

### 0.5 `apps/video/scripts/create-brief.mjs` — specification

The single source of truth for brief creation. Called by both the Claude skill and the CLI.

```
Inputs (CLI args):
  --channel        required  Channel key, e.g. "wildlife/intimacy/EN"
  --concept        required  Raw concept text
  --format         optional  11s | 21s | portrait (AI recommends if omitted)
  --slot           optional  Override posting slot
  --scheduled-for  optional  ISO datetime

Environment variables required:
  ANTHROPIC_KEY        for AI steps (Claude API) — see packages/config/schema.js
  SUPABASE_URL         for DB steps
  SUPABASE_SERVICE_ROLE_KEY  for DB steps

Execution flow:
  Phase 1 — AI steps (calls Claude API with house-style context)
    a. Load channel config from channels.js → get format rules, slot rules
    b. Load apps/video/knowledge/<channel>/house-style.md
    c. Load apps/video/knowledge/<channel>/script-library.md
    d. Call Claude API with structured prompt:
         - species / concept check → STOP + message if rejected
         - format recommendation   → if --format not provided
         - title generation        → curiosity-gap, 1 emoji, < 10 words
         - tension check (21s)     → STOP + clarifying question if arc missing
       Receives JSON: { ok, title, format, slot, rejection?, clarification? }
    e. If rejected or clarification needed → exit non-zero with message on stdout

  Phase 2 — Deterministic steps (no AI)
    f. Validate slot day-of-week against channel rules (no Tue/Wed/Thu for Reels)
    g. Near-duplicate check:
         SELECT id, title FROM content_items
         WHERE channel_key = $channel AND created_at > now() - interval '30 days'
         SELECT topic_title FROM reels_log
         WHERE channel = $pageName AND created_at > now() - interval '30 days'
       If match → exit non-zero with warning message (caller decides whether to re-run with --force)
    h. Call createBrief() from packages/database/briefs.js → INSERT + return id

Output (stdout, JSON):
  Success:  { "id": 42, "title": "...", "format": "11s", "slot": "Fri 23:00 BST" }
  Rejected: { "error": "species", "message": "...", "suggestion": "..." }
  Duplicate:{ "error": "duplicate", "message": "...", "match": { "id": 38, "title": "..." } }
  Tension:  { "error": "tension", "clarification": "What is the threat in scene 2?" }

Exit codes:
  0  success — brief created
  1  rejected (species, duplicate, tension) — message in stdout JSON
  2  unexpected error — message in stderr
```

### 0.6 `packages/database/briefs.js` — specification

Pure database function. No AI, no validation. Called only by `create-brief.mjs` after all AI and validation steps have passed.

```js
/**
 * Insert a validated brief into content_items.
 * All AI checks and slot validation must be done by the caller before this.
 *
 * @param {object} params
 * @param {string} params.channelKey      e.g. 'wildlife/intimacy/EN'
 * @param {string} params.format          e.g. '11s'
 * @param {string} params.title           curiosity-gap headline
 * @param {string} params.description     raw concept text
 * @param {string} [params.slot]          e.g. 'Fri 23:00 BST'
 * @param {string} [params.scheduledFor]  ISO datetime string
 * @returns {Promise<{ id: number, title: string, format: string, slot: string }>}
 */
export async function createBrief(params) { ... }
```

SQL executed:

```sql
INSERT INTO content_items (
  channel_key, format,
  title, description,
  status, scenes,
  slot, scheduled_for
) VALUES (
  $channelKey, $format,
  $title, $description,
  'brief', '[]',
  $slot, $scheduledFor
) RETURNING id, title, format, slot;
```

No `niche`, `style`, `language`, `source_type`, `source_clips`, `target_platforms` — those are channel config, not brief data.

### 0.7 Result

On success, a row exists in `content_items`:

```
channel_key  = 'wildlife/intimacy/EN'
format       = '11s'
title        = 'What She Does Before the World Wakes Up 🌅'
description  = 'A cavy waking at dawn in her burrow'
status       = 'brief'
slot         = 'Fri 23:00 BST'
scenes       = '[]'
status_note  = NULL
```

This row is now ready to be picked up by the generation agent (`wild-eye-reel` skill).

---

## 1. Generation strategies

Every format in every channel declares a `generationStrategy`. This is the single config value that drives what the generation agent does after picking up a `status='brief'` row.

### 1.1 Strategy taxonomy

| Strategy            | Type            | Duration        | Clips         | Sessions            | Assembly                     | Narration    |
| ------------------- | --------------- | --------------- | ------------- | ------------------- | ---------------------------- | ------------ |
| `image_only`        | image           | —               | 1 image       | 1                   | none                         | none         |
| `start_frame_chain` | short video     | ≤ 60s           | 1–5 clips     | 1                   | manual (CapCut) V1 → auto V2 | optional     |
| `chapter_chain`     | long-form video | 1 min – 30 min+ | 10–300+ clips | N (one per chapter) | automated (FFmpeg)           | configurable |
| `storyboard_direct` | any             | any             | N clips       | 1+                  | manual or automated          | optional     |

---

### 1.2 `image_only`

Generate a single photorealistic image. No video step.

```
Brief → scene prompt → Higgsfield start frame (2K image) → status='image_done'
rendered_video_url = NULL (image is in scenes[0].start_frame_url)
```

Used by: portrait format.

---

### 1.3 `start_frame_chain`

For short reels (≤ 60s). One or more clips generated in a single session. Each clip uses a dedicated start frame; the final frame of clip N becomes the start frame of clip N+1 to maintain continuity.

```
Brief → storyboard (composite preview) → per-scene loop:
  1. Generate start frame (Higgsfield image, 2K)
  2. Continuity check (Claude vision)  ← hard-stop if conflict
  3. Generate video clip (Higgsfield video, --start-image=start_frame_url)
  4. Extract final frame → reference for next scene
→ SEO package
→ status='rendered', rendered_video_url = clip_url (11s) | NULL (21s, manual assembly)
```

Used by: `11s`, `21s` formats.

---

### 1.4 `chapter_chain`

For long-form videos (1 min to 30 min+). Identical mechanism to `start_frame_chain` at the clip level, but clips are grouped into chapters. Each chapter runs as its own generation session. Chapters are automatically assembled into the final video.

```
Math: 30 min at 6s/clip, 15 clips/chapter → 300 clips → 20 chapters → 20 sessions

Brief
  ↓
Full script generation (Claude API) — narration for every scene written upfront
  ↓
Chapter 1 (clips 1–15) — one generation session
  ↓ final frame of clip 15
Chapter 2 (clips 16–30) — one generation session
  ↓ final frame of clip 30
...
Chapter N (last batch) — one generation session
  ↓
Audio generation (per scene) — Kokoro TTS or Higgsfield audio, per channel config
  ↓
Chapter assembly (FFmpeg) — audio + video mixed per chapter → chapter_N_video.mp4
  ↓
Final assembly (FFmpeg) — all chapters concatenated + music track → final_video.mp4
  ↓
status='rendered', rendered_video_url = final_video.mp4
```

**Key differences from `start_frame_chain`:**

- Narration script written for ALL scenes before generation begins (not per-scene during generation)
- Audio generated separately, mixed in assembly step
- Assembly is automated (never manual CapCut)
- DB needs `chapters` jsonb column — tracks per-chapter status and chapter video URL
- Each scene in `scenes` jsonb carries a `chapter_n` field
- `target_duration_sec` stored at the content_items row level

**Chapter config in `channels.js`:**

```js
'long_form': {
  type: 'long_form',
  generationStrategy: 'chapter_chain',
  clipDurationSec: 6,           // seconds per individual Higgsfield clip
  scenesPerChapter: 15,         // clips per generation session (memory + cost balance)
  narration: true,              // whether to generate narration
  narrationProvider: 'higgsfield', // 'kokoro' | 'higgsfield'
  music: true,                  // background music track
  // targetDurationSec is NOT in channel config — it's per-brief (passed as --target-duration)
}
```

**`create-brief.mjs` for long-form:**

```bash
node apps/video/scripts/create-brief.mjs \
  --channel "documentary/intimacy/EN" \
  --format long_form \
  --target-duration 1800 \         # 30 minutes in seconds
  --concept "A day in the life of a wild cavy family across the seasons"
```

**DB changes needed when implementing `chapter_chain` (not yet applied):**

- `target_duration_sec integer` column on `content_items`
- `chapters jsonb` column: `[{ n, title, status, scene_range, chapter_video_url, chapter_audio_url }]`
- Each scene in `scenes` jsonb gains a `chapter_n` field

---

### 1.5 `storyboard_direct`

Alternative to `start_frame_chain`. Uses storyboard panels directly as video references — skips the dedicated start frame generation step. Cheaper and faster; less precise control over the first frame.

```
Brief → storyboard (composite image, N panels) → per-scene:
  1. Use storyboard panel N as reference image
  2. Generate video clip (Higgsfield video, --reference-image=panel)
→ Assembly (same as start_frame_chain)
```

Best for: Seedance 2.0 or other models that take reference images well. Use when speed and cost matter more than exact frame control.

Continuity note: no final-frame-to-start-frame chain. Cross-scene consistency depends on the model's reference adherence. Works well for 1-3 scene short-form; not recommended for long-form.

---

### 1.6 Narration in `chapter_chain`

Long-form narration is a configurable per-channel option:

| Provider     | How                                                                          | Quality       | Cost    |
| ------------ | ---------------------------------------------------------------------------- | ------------- | ------- |
| `kokoro`     | Kokoro TTS (local, `packages/media`)                                         | Good, fast    | Free    |
| `higgsfield` | `mcp__claude_ai_higgsfield__generate_audio` or `higgsfield:generate --audio` | High, natural | Credits |
| `none`       | No narration — music + natural audio only                                    | —             | Free    |

Channel config sets `narrationProvider`. The pipeline generates per-scene audio clips, then FFmpeg mixes them with the video in the chapter assembly step.

---

### 1.7 Format config pattern (channels.js)

Every format object must now include `generationStrategy`. Short-form Wild Eye (existing):

```js
formats: {
  '11s': {
    type: 'reel',
    generationStrategy: 'start_frame_chain',
    durationSec: 11, scenes: 1,
    register: 'hidden-intimacy',
    slot: 'Fri 23:00 BST',
  },
  '21s': {
    type: 'reel',
    generationStrategy: 'start_frame_chain',
    durationSec: 21, scenes: 3,
    register: 'tension-survival',
    slot: 'Sat 07:30 BST',
  },
  'portrait': {
    type: 'image',
    generationStrategy: 'image_only',
    durationSec: null, scenes: 1,
    register: 'portrait',
    slot: 'Sun/Thu 10:00 BST',
  },
}
```

A future documentary channel (long-form):

```js
formats: {
  'long_form': {
    type: 'long_form',
    generationStrategy: 'chapter_chain',
    clipDurationSec: 6,
    scenesPerChapter: 15,
    narration: true,
    narrationProvider: 'higgsfield',
    music: true,
    // targetDurationSec: specified per-brief via --target-duration
  },
}
```

---

## 2. Brief expansion — how Claude writes the scene plan

Brief expansion is the first thing the generation agent does after picking up a `status='brief'` row. It is a pure AI step: Claude reads the concept and format, then writes a per-scene plan into `scenes[]`. No Higgsfield calls happen here. Nothing is generated. The only output is the scene plan written to the DB.

### 2.1 What happens

```
Generation agent starts
       │
       ▼
Reads content_items row:
  title       = "What She Does Before the World Wakes Up 🌅"
  description = "A cavy waking at dawn in her burrow"
  format      = '21s'
  channel_key = 'wildlife/intimacy/EN'
       │
       ▼
Loads channel knowledge (house-style.md, script-library.md)
       │
       ▼
Claude AI call — brief expansion:
  Input:  concept + format + house-style rules
  Output: per-scene plan (camera, prompts, scenario per scene)
       │
       ▼
Writes scenes[] to content_items (status still = 'brief')
       │
       ▼
Generates storyboard → status = 'storyboard'
       │
       ▼
[Human reviews storyboard — optional approval gate]
       │
       ▼
Generation proceeds per-scene using the plan
```

### 2.2 The three generation scenarios

Every scene in the plan carries a `scenario` field. Claude sets this during brief expansion based on the camera angle relationship between adjacent scenes.

```
SCENARIO 1 — Storyboard direct
  Use when: quick prototype, budget-first, model handles reference well
  What Claude provides: storyboard panel → video reference
  Video call receives: storyboard panel as --reference-image
  Continuity: model-dependent (no explicit chain)

  Scene 1 (storyboard panel 1) → video
  Scene 2 (storyboard panel 2) → video
  Scene 3 (storyboard panel 3) → video

──────────────────────────────────────────────────────────────────

SCENARIO 2 — Start image only (cut-based)
  Use when: camera angle changes between scenes
  What Claude provides: fresh dedicated start frame per scene
  Video call receives: start_frame_url as --start-image (no end frame)
  Continuity: final_frame_url from clip N used as CHARACTER REFERENCE
              when generating start frame for scene N+1 — NOT as visual start
  Cut: happens in assembly between clips, not inside a clip

  Scene 1: [generate start frame] → video → extract final_frame_1
                                                    │
                                         character ref only ↓
  Scene 2: [generate start frame (new angle)] → video → extract final_frame_2
                                                                │
                                                     character ref only ↓
  Scene 3: [generate start frame (new angle)] → video

──────────────────────────────────────────────────────────────────

SCENARIO 3 — Start + End image chain (continuity-based)
  Use when: same camera angle throughout, seamless flow required
  What Claude provides: dedicated start frame for every scene
  Video call receives: start_frame_url + end_frame_url
                       where end_frame_url = next scene's start_frame_url
  Continuity: the end of clip N IS the start of clip N+1 (exact same image)
  Generation order: ALL start frames generated first, THEN all videos

  Step 1 — Generate all start frames (sequential, each uses prev as character ref):
    SF1 (scene 1 prompt)
      │ character ref ↓
    SF2 (scene 2 prompt + SF1 as reference)
      │ character ref ↓
    SF3 (scene 3 prompt + SF2 as reference)

  Step 2 — Generate all videos (can parallelise):
    Video 1: start=SF1, end=SF2   → clip ends exactly at SF2
    Video 2: start=SF2, end=SF3   → clip starts exactly where clip 1 ended
    Video 3: start=SF3, end=none  → last scene, no end constraint
```

### 2.3 How Claude decides the scenario per scene

Claude reads the concept and applies these rules during brief expansion:

```
For each pair of adjacent scenes (N → N+1):

  Is this a quick draft / storyboard prototype?
    → scenario 1 for all scenes

  Does the camera angle or environment change between N and N+1?
    → scene N+1: scenario 2
    → mark transition = 'cut'

  Is the camera angle the same and action continuous?
    → scene N+1: scenario 3
    → mark transition = 'chain'

  Scene 1 is always scenario 2 or 3 (never storyboard-direct alone).

Defaults by format:
  11s   → 1 scene → scenario 3 (start+end, single scene)
  21s   → 3 scenes → scenario 3 by default (all chain), scenario 2 if concept demands angle cuts
  portrait → image_only (no scenario needed)
  long_form → mix: scenario 3 within chapters, scenario 2 on deliberate angle cuts
```

### 2.4 The storyboard as the review checkpoint

The storyboard is generated immediately after the scene plan is written. Its purpose:

```
Scene plan (in scenes[] jsonb)       Storyboard (composite Higgsfield image)
─────────────────────────────        ──────────────────────────────────────────
Camera angles per scene         →    Visually confirms whether the angle plan works
Scenario per scene              →    Panel quality shows if storyboard-direct is viable
Prompts for each scene          →    Panels show if the prompts describe the right thing

Human review: approve OR edit
  • "change scene 2 to front angle" → update scenes[1].camera and image_prompt
  • "this needs a cut not a chain"  → update scenes[2].scenario = 2
  • "regenerate scene 3 panel"      → regenerate storyboard with updated prompt

After approval: generation proceeds. Per-scene video credits only spent on approved plan.
```

Storyboard is cheap (one Higgsfield image call). It is always generated regardless of which scenario the scenes use.

---

## 3. Lifecycle overview

```
BRIEF CREATED
     │
     ▼
[status='brief']
Prompt: title, format, concept only
scenes = []
     │
     │  Agent Step 2 — expand brief into per-scene prompts
     │  Agent Step 3 — generate storyboard image
     ▼
[status='storyboard']
Prompt fields written into scenes jsonb
Storyboard image URL stored
     │
     │  Agent claims row (concurrency guard)
     │  Agent Step 4 — per-scene: start frame → continuity → video
     ▼
[status='generating']
     │
     │  Per scene: image_done → video_done (or image_done for portrait)
     │  Agent Steps 5–6 — SEO + persist
     ▼
[status='rendered']
All clips + SEO stored in DB
rendered_video_url set
STOP — no upload
     │
     ▼
  (separate upload / publish flow — out of scope for generation agent)
```

---

## 4. Status values — what each means

| Status       | Set by                      | Meaning                                                                             |
| ------------ | --------------------------- | ----------------------------------------------------------------------------------- |
| `brief`      | User / brief command        | Row exists; concept only; no scene prompts yet                                      |
| `storyboard` | Generation agent            | Scene prompts written; storyboard image generated; awaiting generation              |
| `generating` | Generation agent            | Row is claimed; per-scene generation in progress                                    |
| `rendered`   | Generation agent            | All scenes complete; SEO written; clips stored; publisher-ready                     |
| `publishing` | Publish agent               | Upload to platform in progress                                                      |
| `posted`     | Publish agent               | Live on platform                                                                    |
| `blocked`    | Generation agent            | On hold — `status_note` has the reason; needs human decision before continuing      |
| `failed`     | Generation or publish agent | Terminal error — `status_note` has the reason; cannot continue without intervention |

**`status_note` field** (renamed from `status_note`):

- Non-null means something needs human attention
- `blocked` → `status_note = 'storyboard: <reason>'` or `'scene N: <reason>'`
- `failed` → `status_note = 'generation failed: <reason>'` or `'publish failed: <reason>'`
- Cleared by human after resolution; `status` reset to `brief` (full restart) or `storyboard` (resume from generation)

---

## 5. `content_items` columns — Wild Eye relevant fields

| Column               | Type        | Default   | Set when                                                               |
| -------------------- | ----------- | --------- | ---------------------------------------------------------------------- |
| `channel_key`        | text        | required  | Brief creation                                                         |
| `format`             | text        | required  | Brief creation — `'11s'` / `'21s'` / `'portrait'`                      |
| `title`              | text        | required  | Brief creation                                                         |
| `description`        | text        | optional  | Brief creation — working concept                                       |
| `status`             | text        | `'brief'` | Transitions through lifecycle                                          |
| `scenes`             | jsonb       | `'[]'`    | Populated progressively (see §4)                                       |
| `status_note`        | text        | NULL      | Human-readable reason for `blocked` or `failed`; cleared on resolution |
| `slot`               | text        | optional  | Brief creation — e.g. `'Fri 23:00 BST'`                                |
| `scheduled_for`      | timestamptz | optional  | Brief creation or after rendering                                      |
| `seo`                | jsonb       | NULL      | After all scenes are done (Step 5)                                     |
| `rendered_video_url` | text        | NULL      | Final step — single asset URL for publisher                            |
| `rendered_at`        | timestamptz | NULL      | Final step                                                             |

**`rendered_video_url` by format:**

- `11s` reel: set to `scenes[0].clip_url` (single clip, no assembly needed)
- `21s` reel: set to assembled video URL (NOT set until clips are stitched — see §7)
- `portrait`: set to `scenes[0].start_frame_url` (the portrait image IS the final asset)

---

## 6. `scenes` jsonb — canonical shape

The `scenes` column starts as `[]` and is populated progressively. Never write binaries — text and URLs only.

### 6.1 After prompt expansion (status = 'storyboard')

```jsonc
[
  {
    "n": 1,

    // ── Scene plan (written by brief expansion AI step) ──────────────────
    "camera": "low ground-level side angle, static",
    "scenario": 3,
    // scenario 1 = storyboard panel → video directly
    // scenario 2 = fresh start frame only (cut-based, angle changes)
    // scenario 3 = start frame + end frame chain (same angle, seamless flow)

    "transition": "fresh",
    // 'fresh'  = generate a new start frame for this scene
    //            (always 'fresh' for scene 1; also for scenario 2 scenes)
    // 'chain'  = scenario 3 only — end frame of prev clip IS this scene's start frame
    // 'panel'  = scenario 1 only — use storyboard panel as video reference

    "image_prompt": "A flowing prose paragraph for Higgsfield image generation. Photorealistic, mood-led. No bracketed labels.",
    "video_prompt": {
      "composition": "...",
      "style": "ultrarealistic, wildlife documentary cinematography, film grain",
      "cameraMotion": "...",
      "subjects": "...",
      "action": "micro-event, not macro-drama",
      "location": "...",
      "audioCues": "...",
      "lighting": "always directional, emotionally purposeful",
      "durationSec": 7
    },
    "scene_status": "pending"
  },
  {
    "n": 2,
    "camera": "low ground-level side angle, static",
    "scenario": 3,
    "transition": "chain",   // same angle as scene 1 → chain from scene 1's end frame
    "image_prompt": "...",
    "video_prompt": { ... },
    "scene_status": "pending"
  },
  {
    "n": 3,
    "camera": "overhead top-down",
    "scenario": 2,
    "transition": "fresh",   // angle changed → cut → fresh start frame
    "image_prompt": "...",
    "video_prompt": { ... },
    "scene_status": "pending"
  }
]
```

**Number of scenes by format:**

- `11s` → 1 scene, `durationSec: 11`, always `scenario: 3`, `transition: 'fresh'`
- `21s` → 3 scenes, `durationSec: 7` each — scenarios set per-scene by brief expansion
- `portrait` → 1 scene; `video_prompt` omitted (no video generated)

### 6.2 After storyboard image (still status = 'storyboard')

`scenes[0].storyboard_url` is added — the URL of the single composite storyboard image that previews all scenes. Stored on scene 1 only; references the whole grid.

```jsonc
[
  {
    "n": 1,
    "image_prompt": "...",
    "video_prompt": { ... },
    "storyboard_url": "https://cdn.higgsfield.ai/storyboard-abc123.jpg",
    "scene_status": "pending"
  },
  ...
]
```

### 6.3 During generation (status = 'generating')

After each generation sub-step, the scene's fields are written immediately. Never wait until the end of the scene loop. Fields populated depend on which scenario the scene uses.

---

**Scenario 1 — storyboard direct**

No start frame generation. Storyboard panel is passed directly to video generation.

```jsonc
{
  "n": 2,
  "camera": "side angle",
  "scenario": 1,
  "transition": "panel",
  "storyboard_url": "https://cdn.higgsfield.ai/storyboard-abc123.jpg",
  "higgsfield_video_job": "vid_job_xyz789",
  "clip_url": "https://cdn.higgsfield.ai/clip-xyz789.mp4",
  "scene_status": "video_done",
  // no start_frame_url, no end_frame_url, no final_frame_url
}
```

---

**Scenario 2 — start image only (cut-based)**

Start frame generated fresh per scene. No end frame. `final_frame_url` extracted after video and used ONLY as character reference for the NEXT scene's start frame generation — never as a visual start frame.

After start frame + vision gate pass:

```jsonc
{
  "n": 2,
  "camera": "overhead top-down",
  "scenario": 2,
  "transition": "fresh",
  "higgsfield_image_job": "img_job_abc123",
  "start_frame_url": "https://cdn.higgsfield.ai/frame-abc123.jpg",
  "vision_check": {
    "status": "pass",
    "score": 8,
    "attempts": 1,
    "issues": [],
  },
  "scene_status": "image_done",
}
```

After video:

```jsonc
{
  "n": 2,
  "camera": "overhead top-down",
  "scenario": 2,
  "transition": "fresh",
  "higgsfield_image_job": "img_job_abc123",
  "start_frame_url": "https://cdn.higgsfield.ai/frame-abc123.jpg",
  "vision_check": {
    "status": "pass",
    "score": 8,
    "attempts": 1,
    "issues": [],
  },
  "higgsfield_video_job": "vid_job_xyz789",
  "clip_url": "https://cdn.higgsfield.ai/clip-xyz789.mp4",
  "final_frame_url": "https://cdn.higgsfield.ai/final-xyz789.jpg",
  // final_frame_url → character reference only when generating next scene's start frame
  "scene_status": "video_done",
}
```

---

**Scenario 3 — start + end image chain**

All start frames are generated first (across ALL scenes), then videos are generated. Each video receives both a start frame and an end frame. The end frame of scene N = the start frame of scene N+1.

Generation order for a 3-scene Scenario 3 video:

```
Phase A — all start frames first:
  Scene 1: generate start frame (SF1) from image_prompt
  Scene 2: generate start frame (SF2) from image_prompt, SF1 as character reference
  Scene 3: generate start frame (SF3) from image_prompt, SF2 as character reference

Phase B — all videos:
  Scene 1 video: --start-image=SF1, --end-image=SF2
  Scene 2 video: --start-image=SF2, --end-image=SF3
  Scene 3 video: --start-image=SF3  (last scene — no end frame constraint)
```

After start frame + vision gate pass (Phase A complete for this scene):

```jsonc
{
  "n": 1,
  "camera": "side angle",
  "scenario": 3,
  "transition": "fresh",
  "higgsfield_image_job": "img_job_sf1",
  "start_frame_url": "https://cdn.higgsfield.ai/sf1.jpg",
  "vision_check": {
    "status": "pass",
    "score": 9,
    "attempts": 1,
    "issues": [],
  },
  "scene_status": "image_done",
}
```

After video (Phase B complete for this scene):

```jsonc
{
  "n": 1,
  "camera": "side angle",
  "scenario": 3,
  "transition": "fresh",
  "higgsfield_image_job": "img_job_sf1",
  "start_frame_url": "https://cdn.higgsfield.ai/sf1.jpg",
  "vision_check": {
    "status": "pass",
    "score": 9,
    "attempts": 1,
    "issues": [],
  },
  "end_frame_url": "https://cdn.higgsfield.ai/sf2.jpg",
  // end_frame_url = scenes[1].start_frame_url — the EXACT frame this clip ends on
  "higgsfield_video_job": "vid_job_xyz789",
  "clip_url": "https://cdn.higgsfield.ai/clip-xyz789.mp4",
  "scene_status": "video_done",
  // no final_frame_url needed — end point was predetermined, not extracted
}
```

**Key difference from Scenario 2:** In Scenario 3, the clip ends at a CHOSEN image (`end_frame_url`). In Scenario 2, the clip ends wherever the model stops and the final frame is extracted afterward.

### 6.4 Portrait format (full terminal state)

Portrait has no video step. Terminal `scene_status` is `image_done`, not `video_done`.

```jsonc
[
  {
    "n": 1,
    "image_prompt": "...",
    "storyboard_url": "https://cdn.higgsfield.ai/portrait-preview.jpg",
    "higgsfield_image_job": "img_job_abc123",
    "start_frame_url": "https://cdn.higgsfield.ai/portrait-abc123.jpg",
    "scene_status": "image_done",
  },
]
```

`start_frame_url` on scene 1 IS the final portrait asset. The agent sets `rendered_video_url = scenes[0].start_frame_url` in Step 6.

### 6.5 Blocked scene

```jsonc
{
  "n": 2,
  "...",
  "higgsfield_image_job": "img_job_abc123",
  "start_frame_url": "...",
  "scene_status": "blocked"
}
```

`content_items.status_note` is set with the reason. `status = 'blocked'`.

---

## 7. Step-by-step generation flow

### Step 1 — Session start

1. Read `apps/video/knowledge/wild-eye/house-style.md`
2. Read `apps/video/knowledge/wild-eye/script-library.md`
3. Invoke `higgsfield-credit-guard` → balance check; get session config (`videoResolution`, `imageResolution`, `model`)
4. Cloud mode: confirm Supabase project `nnxtvbolhuvihlpwppbj`

### Step 2 — Load and validate brief

```sql
SELECT * FROM content_items
WHERE channel_key = 'wildlife/intimacy/EN' AND status = 'brief'
ORDER BY created_at ASC LIMIT 1;
-- Or: WHERE id = $id
```

Confirm `format` is `'11s'` / `'21s'` / `'portrait'`. If not, STOP.

Load format rules from house-style:

- `11s` → Formula A, 1 scene, `durationSec: 11`
- `21s` → Formula B, 3 scenes, `durationSec: 7` each
- `portrait` → single extreme-close-up image, no video

### Step 3 — Expand brief into scene prompts

For each scene (1 scene for 11s/portrait, 3 for 21s):

**3a. Image prompt** — flowing prose, photorealistic, mood-led. Must include:

- Specific location (burrow interior / grassland / water's edge)
- Directional light quality ("warm amber shaft catching only the eye")
- Subject detail (fur texture, eye catching light)
- Camera feel
- For scene N+1: explicit visual element carried over from scene N

**3b. Video prompt** — structured fields (omit for portrait):
`composition / style / cameraMotion / subjects / action / location / audioCues / lighting / durationSec`

**3c. Run `safe-language-lint`** on every `image_prompt` before writing.
Substitutions: `exposed roots → tangled root structures` · `predawn → cool morning light` · `toe pads → small paws` · `nose leather → muzzle detail` · `iris texture → eye catching light`

**3d. Write to DB:**

```sql
UPDATE content_items
SET scenes = $scenesArray,
    status = 'storyboard'
WHERE id = $id;
```

Each scene object: `{ n, image_prompt, video_prompt, scene_status: 'pending' }` (portrait omits `video_prompt`).

### Step 4 — Storyboard image

**4a. Compose storyboard prompt:**

- `11s` / `portrait`: single panel
- `21s`: 3-panel horizontal grid; each panel includes that scene's core visual + label ("Scene 1: 7s")
- Total prompt under 400 words; 2K resolution; 9:16 aspect ratio

**4b. Generate:**

- Cloud: `higgsfield:generate --type image --wait`
- Interactive: `mcp__claude_ai_higgsfield__generate_image`

**4c. Vision quality gate — storyboard (Tier 2):**

Invoke `image-quality-gate` agent with:

- `imageUrl`: storyboard URL
- `imagePrompt`: combined scene descriptions
- `checkType`: `'storyboard'`
- `channelRules`: house-style.md content

Result is **advisory** for storyboard (never blocks):

- Issues are noted in `status_note` for human awareness
- Generation continues regardless — storyboard is the human review point

**4d. Decision gate:**

- **Interactive:** show storyboard + vision gate issues to user, wait for approval. User may edit scene prompts → redo Step 3 → regenerate (cheap: 1 image, not N videos).
- **Cloud:** if vision gate flagged issues → `status_note = 'storyboard advisory: <issues>'` (non-blocking). Any missing cavy or prohibited content → `status = 'blocked'`, STOP.

**4d. Write storyboard URL:**

```sql
UPDATE content_items
SET scenes = jsonb_set(scenes, '{0,storyboard_url}', '"<url>"')
WHERE id = $id;
```

### Step 5 — Claim row (concurrency guard)

```sql
UPDATE content_items SET status = 'generating' WHERE id = $id;
```

Any other session seeing `status = 'generating'` will not pick this row.

### Step 6 — Per-scene generation

Iterate scenes in order n=1 → n=2 → n=3.

#### 6a. Skip if done

If `scene.scene_status === 'video_done'` (reel) or `'image_done'` (portrait), skip this scene. Enables idempotent resume after crash.

#### 6b. Credit re-check (cloud only)

Run `higgsfield account balance`. If < 50 credits → STOP, leave `status = 'generating'` (locked), output warning.

#### 6c. Start-frame image generation

- Prompt: `scene.image_prompt`
- Reference: `prevFinalFrameUrl` (scene N-1's `final_frame_url`; absent for scene 1)
- Resolution: 2K, aspect ratio: 9:16
- **Cloud:** `higgsfield:generate --type image --reference <prevFinalFrameUrl> --resolution 2K --wait`
- **Interactive:** `mcp__claude_ai_higgsfield__generate_image` with reference image

**Blocked/rights handling:**

1. On blocked: call `reveal_generation` / `higgsfield generate reveal`, wait 5s, re-poll
2. After 2 failures: write `scene_status = 'blocked'` to scenes, set `status_note = 'scene N image blocked: <reason>'`, set `status = 'blocked'`, STOP

**Write immediately after success (don't wait for video):**

```sql
UPDATE content_items
SET scenes = jsonb_set(
  jsonb_set(scenes, '{N-1,higgsfield_image_job}', '"<job_id>"'),
  '{N-1,start_frame_url}', '"<url>"'
) || jsonb_set(scenes, '{N-1,scene_status}', '"image_done"')
WHERE id = $id;
```

(N-1 = zero-based index)

#### 6d. Vision quality gate — start frame (Tier 2, hard gate)

Invoke `image-quality-gate` agent with:

- `imageUrl`: `scene.start_frame_url`
- `imagePrompt`: `scene.image_prompt`
- `checkType`: `'start_frame'`
- `channelRules`: house-style.md content
- `sceneN`: scene number
- `attempt`: current attempt count (starts at 1)

**Result handling:**

| Result                             | Action                                                                                                      |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `pass` (score ≥ 7)                 | Write `vision_check` to DB → proceed to continuity check (6e)                                               |
| `retry` (score < 7, attempt < 2)   | Regenerate start frame → re-run vision gate (attempt++)                                                     |
| `blocked` (score < 7, attempt ≥ 2) | Write `scene_status='blocked'`, `status='blocked'`, `status_note='scene N vision gate: <top issue>'` → STOP |

**Write vision_check to DB immediately on pass:**

```sql
UPDATE content_items
SET scenes = jsonb_set(scenes, '{N-1,vision_check}',
  '{"status":"pass","score":8,"attempts":1,"issues":[]}'
)
WHERE id = $id;
```

This is a **hard gate** — no video credits are spent until the start frame passes.

#### 6e. Continuity check (Tier 2 — all channels)

Invoke `continuity-checker` agent with:

- `startFrame`: `scene.start_frame_url`
- `scenePrompt`: `scene.video_prompt`
- `prevFinalFrame`: `prevFinalFrameUrl` (omit for scene 1)

Result: `{ conflict: 'none' | 'soft' | 'hard', reason: '...' }`

- `none` → proceed
- `soft` → log warning in `status_note` but proceed (cloud mode)
- `hard` → set `status_note = 'scene N continuity: <reason>'`, set `status = 'blocked'`, STOP

#### 6f. End frame generation (Scenario 3 only — skip for Scenarios 1 and 2)

For scenes where `scenario = 3` and this is NOT the last scene, generate the end frame before the video. The end frame = the next scene's start frame URL (which is generated in the NEXT scene's 6c step).

**Generation order for Scenario 3:**

- Phase A (all scenes): run steps 6a → 6c → 6d (vision gate) → 6e (continuity) for ALL scenes first → collect all `start_frame_url` values
- Phase B (all scenes): generate videos using `start_frame_url[N]` as start and `start_frame_url[N+1]` as end

**Vision gate for end frames** — if a separately generated end frame is used (not next scene's start frame), run `image-quality-gate` with `checkType: 'end_frame'` before the video call. Same pass/retry/blocked logic as 6d.

#### 6g. Video generation (reel formats only — skip for portrait)

- Start image: `scene.start_frame_url`
- Model: Seedance 2.0 (default); resolution: 720p (cloud) / 1080p (interactive)
- Natural audio ON; NO music score; NO drone unless scene explicitly earns it
- Build video prompt string from all `video_prompt` fields concatenated in order
- **Cloud:** `higgsfield:generate --type video --start-image <startFrameUrl> --model seedance-2 --duration <durationSec> --resolution 720p --wait`
- **Interactive:** `mcp__claude_ai_higgsfield__generate_video`

**Blocked handling:** same as 6c — reveal → retry → blocked.

**Write immediately after success:**

```sql
UPDATE content_items
SET scenes = <updated scenes with higgsfield_video_job, clip_url, final_frame_url, scene_status='video_done'>
WHERE id = $id;
```

#### 6h. Chain to next scene

Set `prevFinalFrameUrl = scene.final_frame_url`. This becomes the reference image for scene N+1's start frame (Scenario 2) or character reference for next start frame generation (Scenario 3).

### Step 7 — SEO (after all scenes terminal)

Reel terminal check: ALL scenes have `scene_status = 'video_done'`.
Portrait terminal check: scene 1 has `scene_status = 'image_done'`.

**House rule: SEO is NEVER generated before all scenes are terminal. Abort SEO and STOP if any scene is not done.**

Invoke `seo-writer` subagent (Tier 2) with: title, description, narration, format, channel=Wild Capture.

Store result:

```sql
UPDATE content_items
SET seo = '{ "title": "...", "description": "...", "hashtags": ["..."] }'
WHERE id = $id;
```

### Step 8 — Set rendered_video_url

```
11s   → rendered_video_url = scenes[0].clip_url
21s   → rendered_video_url = NULL (clips need assembly first — see §7)
portrait → rendered_video_url = scenes[0].start_frame_url
```

### Step 9 — Persist

```sql
UPDATE content_items SET
  status = 'rendered',
  rendered_at = now(),
  rendered_video_url = $url   -- as determined in Step 8
WHERE id = $id;
```

**STOP. Do not upload. Do not publish.**

### Step 10 — Report

```
✅ Wild Eye reel C-{id} rendered
Format: {format}  |  Scenes: {n}  |  Channel: Wild Capture
Clips:  scene 1: {clip_url}
        scene 2: {clip_url}  (if 21s)
        scene 3: {clip_url}  (if 21s)
SEO title: "{title}"
Assembly needed: {yes (21s) / no (11s, portrait)}
Next: upload clips, then run publish.js when ready.
```

---

## 8. Format-specific summary

| Property                          | 11s reel             | 21s reel                       | portrait                    |
| --------------------------------- | -------------------- | ------------------------------ | --------------------------- |
| Scenes                            | 1                    | 3                              | 1                           |
| `video_prompt` in scenes          | ✅                   | ✅                             | ❌ (omitted)                |
| Storyboard image                  | Single panel         | 3-panel grid                   | Single panel                |
| Start-frame generated             | ✅                   | ✅ (×3)                        | ✅                          |
| Video generated                   | ✅                   | ✅ (×3)                        | ❌                          |
| Terminal `scene_status`           | `video_done`         | `video_done`                   | `image_done`                |
| Assembly needed                   | No                   | Yes                            | No                          |
| `rendered_video_url` set by agent | `scenes[0].clip_url` | NULL                           | `scenes[0].start_frame_url` |
| Facebook post type                | Reel (video)         | Reel (video, after assembly)   | Photo                       |
| Continuity chain                  | N/A (1 scene)        | `final_frame_url` → next scene | N/A                         |
| Narration                         | No                   | Yes (caption in description)   | No                          |
| SEO hashtag count                 | 15–20                | 15–20                          | 6–8                         |

---

## 9. 21s assembly (V1 manual, V2 automated)

The cloud agent STOPS at Step 9 with 3 individual clips stored in `scenes[0,1,2].clip_url`. The `rendered_video_url` is NULL.

**V1 manual assembly path:**

1. Download 3 clips from Higgsfield CDN
2. Stitch in CapCut / FFmpeg: `ffmpeg -concat -i scene1.mp4 -i scene2.mp4 -i scene3.mp4 output.mp4`
3. Upload assembled video to Higgsfield or R2
4. `UPDATE content_items SET rendered_video_url = '<assembled_url>' WHERE id = $id`
5. Publish

**V2 automated assembly (future):**
FFmpeg is available on `ubuntu-latest` runners. Auto-stitch as a post-generation step by downloading clips to the runner disk, running concat, uploading to R2, and setting `rendered_video_url`. Not in scope for V1.

---

## 10. Error states and recovery

| Error condition                                 | What agent writes                    | `status`             | `status_note`                       | Recovery                                                                               |
| ----------------------------------------------- | ------------------------------------ | -------------------- | ----------------------------------- | -------------------------------------------------------------------------------------- |
| Credit < 50 at session start                    | nothing                              | unchanged (`brief`)  | not set                             | Top up Higgsfield, re-run                                                              |
| Credit < 50 mid-run                             | nothing (row stays `generating`)     | `generating`         | not set                             | Top up, re-run (idempotent — done scenes skipped)                                      |
| Storyboard generation blocked                   | nothing to scenes                    | `blocked`            | `'storyboard: <reason>'`            | Review, optionally regenerate, clear `status_note`, reset to `brief`                   |
| Storyboard continuity conflict (cloud)          | storyboard_url written               | `blocked`            | `'storyboard: <conflict>'`          | Revise prompts, clear thread, reset to `brief`, re-run                                 |
| Start-frame image blocked (2 retries exhausted) | `scene_status='blocked'` in scenes   | `blocked`            | `'scene N image blocked: <reason>'` | Revise image_prompt, clear thread, reset to `storyboard`, re-run (done scenes skipped) |
| Continuity hard conflict                        | `scene_status='image_done'` retained | `blocked`            | `'scene N continuity: <reason>'`    | Accept or regenerate, clear thread, reset to `storyboard`, re-run                      |
| Video generation blocked (2 retries)            | `scene_status='blocked'` in scenes   | `blocked`            | `'scene N video blocked: <reason>'` | Revise video_prompt, clear thread, reset to `storyboard`, re-run                       |
| SEO agent fails                                 | scenes complete; seo=NULL            | remains `generating` | not set                             | Re-run (Step 7 re-invokes seo-writer; all scenes already done)                         |

**Idempotency guarantee:** re-running a `storyboard` or `generating` row always skips scenes with `scene_status = 'video_done'` or `'image_done'`. No credits are spent on completed work.

---

## 11. What the publisher receives (status='rendered')

When the upload/publish agent picks up a `rendered` row, it reads:

```js
{
  format: '11s' | '21s' | 'portrait',
  rendered_video_url: '<single asset URL or NULL for un-assembled 21s>',
  seo: { title, description, hashtags },
  scenes: [...]   // clip_url per scene, for 21s assembly check
}
```

The publisher:

- For `11s` / `portrait`: uses `rendered_video_url` directly (always set by agent)
- For `21s`: checks `rendered_video_url !== NULL` before posting; blocks if NULL (assembly not done)
- Reads `channelConfig.formats[format].type` (`'reel'` vs `'image'`) to choose FB Graph endpoint
