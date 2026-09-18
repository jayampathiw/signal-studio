---
name: wild-eye-reel
description: Orchestrator for Wild Capture (Wild Eye) reel generation. Runs brief → storyboard → per-scene generate → SEO → persist. Uses Tier 1 higgsfield:generate for all Higgsfield calls. Composes with Wild Eye house-style rules.
---

# Wild Eye Reel — Generation Orchestrator

Full pipeline from a brief row to `status='rendered'`. Runs in both interactive (`claude.ai` / `claude.ai/code`) and cloud-deployed agent mode.

**Tier:** T3 (channel-specific) | **Channel:** `wildlife/intimacy/EN` | **Page:** Wild Capture | **Brand:** Wild Eye

**Higgsfield generation:** use `higgsfield:generate` (Tier 1, cloud/CLI) or `mcp__claude_ai_higgsfield__generate_image` / `generate_video` (interactive MCP). The same orchestration logic applies in both modes.

## Session start — always do these first

1. Read `apps/video/knowledge/wild-eye/house-style.md` — this governs every creative decision
2. Read `apps/video/knowledge/wild-eye/script-library.md` — use as pattern-matching for prompts
3. Invoke `higgsfield-credit-guard` skill — check balance, set quality defaults for this session
4. (Cloud mode) Confirm Supabase project: `nnxtvbolhuvihlpwppbj`. All `execute_sql` calls target this project.

## Inputs

- `id` (optional): specific content_item id to work on
- If no id: query Supabase for oldest row WHERE `channel_key = 'wildlife/intimacy/EN'` AND `status = 'brief'`

## Pipeline

### Step 1 — Load brief

```sql
SELECT * FROM content_items WHERE id = $id AND channel_key = 'wildlife/intimacy/EN';
```

Confirm: `status = 'brief'`, `format` is one of `'11s'`, `'21s'`, `'portrait'`.

Read format config from house-style.md:

- `11s` → Formula A: 1 scene, hidden intimacy, cavy-only, confined/intimate space
- `21s` → Formula B: 3 scenes, tension arc (calm → threat → resolution or unresolved)
- `portrait` → Single photorealistic frame, extreme close-up, one dramatic light source

### Step 2 — Expand brief into scene prompts

For each scene (1 for 11s/portrait; 3 for 21s):

**a. Image prompt** — flowing paragraph, photorealistic, mood-led, NO bracketed labels. Must convey:

- Specific location (burrow interior / open grassland / water's edge)
- Light quality (directional, emotionally purposeful — "warm amber shaft catching only the eye")
- Subject detail (photorealistic fur texture, eye catching light)
- Camera feel (confined space = intimacy; open space = vulnerability)
- For scene N+1: explicitly state what visual element carries over from scene N's final frame

**b. Video prompt** — structured fields in this EXACT order:

- **Composition:** framing, subject placement, orientation
- **Style:** ultrarealistic, wildlife documentary cinematography, film grain
- **Camera Motion:** named and justified (e.g. "near-imperceptible push-in building intimacy")
- **Subjects:** species detail, fur/eye description, props
- **Action:** micro-events NOT macro-drama ("one pup's paw twitches and stills" not "animals sleep peacefully")
- **Location:** interior/exterior, specifics
- **Audio Cues:** specific, never vague ("layered soft breathing of four animals slightly out of sync" not "quiet sounds"). Natural audio ONLY — NO music score, NO drone layer unless scene explicitly earns a barely-audible tension pulse.
- **Lighting:** always directional, always emotionally purposeful
- **Duration:** durationSec for this scene

**Run `safe-language-lint` on EVERY image prompt before proceeding.**
Substitutions: `exposed roots → tangled root structures` · `predawn → cool morning light` · `toe pads → small paws` · `nose leather → muzzle detail` · `iris texture → eye catching light`

**Narration (21s Formula B only):** first-person animal POV, whispered register, 1-2 lines max, present tense. Reference proven lines in house-style.md.

**c. Scenario + transition** — set on every scene; this is the single value that drives how Step 4 generates the scene:

| Scenario                   | Use when                                                                | `transition`                               | Step 4 behaviour                                                                                                      |
| -------------------------- | ----------------------------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `1` storyboard-direct      | quick draft / budget-first / model handles reference images well        | `panel`                                    | storyboard panel → video reference; NO dedicated start frame, NO start-frame vision gate                              |
| `2` start-frame-only (cut) | camera angle or environment changes between this scene and the previous | `fresh`                                    | fresh start frame per scene; previous `final_frame_url` used as CHARACTER reference only; the cut happens in assembly |
| `3` start+end chain        | same camera angle, seamless flow required                               | `fresh` (scene 1) / `chain` (later scenes) | start frame + end frame; the end frame of clip N is exactly the start frame of clip N+1                               |

Assignment rules:

- Scene 1 is always scenario `2` or `3` — never `1` alone.
- For each adjacent pair N → N+1: angle/environment changes → scene N+1 is scenario `2` (`transition: 'fresh'`); same angle with continuous action → scenario `3` (`transition: 'chain'`).
- Defaults by format: `11s` → 1 scene, scenario `3`, `transition: 'fresh'`. `21s` → 3 scenes, scenario `3` throughout unless the concept demands an angle cut (that scene becomes scenario `2`). `portrait` → `image_only`, no `scenario` field.

Write `scenario` and `transition` onto each scene object.

Write scene prompts into `scenes` jsonb. Update DB: `status = 'storyboard'`.

### Step 3 — Storyboard

Compose a single multi-panel storyboard image prompt:

- **1-scene** (11s / portrait): single panel showing the scene's core visual
- **3-scene** (21s): 3-panel grid, each panel shows core visual + brief label (e.g. "Scene 1: 7s")
- Weave each scene's `image_prompt` into its panel description; keep total prompt under 400 words
- Params: 2K resolution, 9:16 aspect ratio

Generate the storyboard image:

- **Cloud:** `higgsfield:generate --type image --wait` with the composed prompt
- **Interactive:** `mcp__claude_ai_higgsfield__generate_image`

**Vision quality gate — storyboard (Tier 2, ADVISORY).** Invoke the `image-quality-gate` agent:

- `imageUrl`: storyboard URL · `imagePrompt`: combined panel/scene descriptions · `checkType`: `'storyboard'` · `channelRules`: house-style.md content · `sceneN`: 0 · `attempt`: 1
- The result is **advisory — it NEVER blocks** (the storyboard is the human review point). If `issues` are returned, surface them: set `status_note = 'storyboard advisory: <issues>'` (non-blocking). Generation continues regardless. (This is the only advisory gate; the start-frame gate in Step 4 is hard.)

**Interactive mode:** show storyboard inline alongside any vision-gate issues, wait for human approval. Allow edits → revise Step 2 prompts → regenerate (one image, not N videos).
**Cloud mode:** invoke `continuity-checker` agent on the storyboard layout. Any `hard` conflict or missing cavy → `status = 'blocked'`, `status_note = 'storyboard: <conflict>'`, STOP.

Write storyboard URL to scene 1 and update status:

```sql
UPDATE content_items
SET scenes = jsonb_set(scenes, '{0,storyboard_url}', '"<storyboard_url>"'),
    status = 'storyboard'
WHERE id = $id;
```

### Step 4 — Per-scene generation

Claim the row: `UPDATE content_items SET status = 'generating' WHERE id = $id` — prevents collision with another session.

**Generation config resolution.** Model and resolution are NOT hardcoded. There are **three** layers, in precedence order: per-reel `gen_config` → **channel config** (`channel_configs` table) → channel code default (`apps/video/src/config/channels.js`, the `wildlife/intimacy/EN` block). First **fetch the channel config row** via the Supabase MCP:

```sql
SELECT config FROM channel_configs WHERE channel_key = '<channel_key>';  -- jsonb; {} or no row = none set
```

Call its `config` jsonb `chan_cfg` (treat a missing row as `{}`), and `channel` the code-default block. Resolve each value:

```
imageModel = gen_config.imageModel ?? chan_cfg.imageModel ?? channel.imageModel   // default 'nano_banana_pro'
videoModel = gen_config.videoModel ?? chan_cfg.videoModel ?? channel.videoModel   // default 'seedance_2_0'
imageRes   = gen_config.imageRes   ?? chan_cfg.imageRes   ?? channel.imageRes      // default '2k'
videoRes   = gen_config.videoRes   ?? chan_cfg.videoRes   ?? channel.videoRes      // default '720p'
aspectRatio= gen_config.aspectRatio?? chan_cfg.aspectRatio?? channel.aspectRatio   // default '9:16'
generateAudio = channel.generateAudio                                             // default true
durationSec= scene.durationSec ?? gen_config.duration ?? chan_cfg.duration ?? format.durationSec
```

**Duration:** resolve per scene as `scene.durationSec ?? gen_config.duration ?? chan_cfg.duration ?? format.durationSec` (11s preset → 11, 21s preset → 21 split across its scenes). A per-scene `durationSec` always wins; `gen_config.duration` is the single-clip override for single-scene formats (e.g. an `11s`-format reel set to 15s); `chan_cfg.duration` is the channel-wide default when no reel override is set. **Clamp** the final value to the chosen `videoModel`'s valid range (see `docs/higgsfield-models.md`: `seedance_2_0`/`mini` 4–15s, `kling3_0` 3–15s, `wan2_7` 2–15s, `seedance_1_5` only 4/8/12s) — never pass `--duration` outside it.

`gen_config` is the per-reel jsonb column on `content_items` (set from the dashboard Config tab; null when unset). `channel_configs` holds per-channel (“page”) defaults set from the dashboard page-strip **⚙ Defaults** editor (keyed by `channel_key`; absent = use code defaults). Use the canonical MCP model IDs — see `docs/higgsfield-models.md` for the authoritative list (`nano_banana_pro`, `seedance_2_0`, etc.). For `21s` (scenario `3`) the video model MUST support the `end_image` role — `seedance_2_0`, `kling3_0`, `wan2_7`, `cinematic_studio_3_0`, `seedance_1_5` do; `kling3_0_turbo` does NOT.

**Generation order depends on the scenarios assigned in Step 2:**

- **Any scene is scenario `3` (chain):** run **two-phase** — Phase A generates ALL start frames first, then Phase B generates all videos (each video's end frame = the next scene's start frame). The chain only works if every start frame exists before any video is generated.
- **All scenes are scenario `1` or `2` (and every single-scene `11s` / `portrait`):** run a **single per-scene loop** — start frame → video, scene by scene.

The lettered sub-steps below are the building blocks; the two execution orders at the end of this step say which sub-steps run in which sequence.

**(skip) Skip if done:** if `scene.scene_status === 'video_done'` (reel) or `'image_done'` (portrait), skip — idempotent resume on crash. A scene whose `vision_check.status === 'pass'` is not re-gated.

**(credit) Credit re-check (cloud mode):** invoke `higgsfield-credit-guard` balance check. If < 50 credits, STOP without updating DB (row stays `generating`).

**(start-frame) Start-frame image — SKIP for scenario `1` (uses the storyboard panel instead):**

- Prompt: `scene.image_prompt`
- Reference image: scenario `2` → previous scene's `final_frame_url` as CHARACTER reference; scenario `3` → previous scene's `start_frame_url` as CHARACTER reference; absent for scene 1
- Model: `imageModel` (resolved above; default `nano_banana_pro`); resolution: `imageRes` (default `2k`); aspect ratio: `aspectRatio` (default `9:16`)
- **Cloud:** `higgsfield:generate --type image --model <imageModel> --reference <referenceUrl> --resolution <imageRes> --wait`
- **Interactive:** `mcp__claude_ai_higgsfield__generate_image` with `params.model = <imageModel>`, `resolution = <imageRes>`, `aspect_ratio = <aspectRatio>`, and the reference image
- Blocked/rights: call `reveal_generation` or `higgsfield generate reveal`, wait 5s, retry once. After 2 failures → write `scene_status = 'blocked'`, set `status = 'blocked'`, `status_note = 'scene N image blocked: <reason>'`, STOP.
- **Write to DB immediately after success** (do not wait for video):
  ```sql
  UPDATE content_items
  SET scenes = jsonb_set(jsonb_set(scenes,
    '{N,higgsfield_image_job}', '"<job_id>"'),
    '{N,start_frame_url}', '"<url>"')
    || jsonb_set(scenes, '{N,scene_status}', '"image_done"')
  WHERE id = $id;
  ```
  (N = zero-based scene index)

**(vision-gate) Vision quality gate — start / end frame (Tier 2, HARD gate) — SKIP for scenario `1`:**
Invoke the `image-quality-gate` agent:

- `imageUrl`: the frame just generated · `imagePrompt`: `scene.image_prompt` · `checkType`: `'start_frame'` (or `'end_frame'` for a separately-generated scenario-3 end frame) · `channelRules`: house-style.md content · `sceneN`: scene number · `attempt`: current attempt count (starts at 1)

| `recommendation`                   | Action                                                                                                                                                                                  |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pass` (score ≥ 7)                 | write `scene.vision_check = { status:'pass', score, attempts, issues:[] }` → proceed to continuity                                                                                      |
| `retry` (score < 7, attempt < 2)   | regenerate the SAME frame (same prompt + same reference) → re-invoke gate with `attempt + 1`                                                                                            |
| `blocked` (score < 7, attempt ≥ 2) | write `scene.vision_check = { status:'blocked', score, attempts, issues }`, `scene_status = 'blocked'`, `status = 'blocked'`, `status_note = 'scene N vision gate: <top issue>'` → STOP |

This is a **HARD gate**: NO video credits are spent until the start frame passes. (The Step 3 storyboard gate is advisory; this one blocks.) Write `vision_check` to the DB immediately on `pass`:

```sql
UPDATE content_items
SET scenes = jsonb_set(scenes, '{N,vision_check}',
  '{"status":"pass","score":8,"attempts":1,"issues":[]}')
WHERE id = $id;
```

**(continuity) Continuity check (Tier 2):** invoke `continuity-checker` with:

- `startFrame`: `scene.start_frame_url` · `scenePrompt`: `scene.video_prompt` · `prevFinalFrame`: previous scene's `final_frame_url` (omit for scene 1)
- `none` → proceed | `soft` → log in `status_note` but proceed (cloud) | `hard` → `status = 'blocked'`, `status_note = 'scene N continuity: <reason>'`, STOP

**(video) Video generation — SKIP for portrait (terminal state is `image_done`):**

- Build prompt string from `video_prompt` fields in order: composition, style, cameraMotion, subjects, action, location, audioCues, lighting, durationSec
- Start image: `scene.start_frame_url` (scenario `2` / `3`) or the storyboard panel (scenario `1`)
- End image: scenario `3` non-final scene only → the next scene's `start_frame_url` (`--end-image`); scenario `1` / `2` and the last scene → none
- Model: `videoModel` (resolved above; default `seedance_2_0`); audio: `generateAudio` (default ON), NO music score; resolution: `videoRes` (default `720p`)
- **Cloud:** `higgsfield:generate --type video --start-image <startUrl> [--end-image <nextStartUrl>] --model <videoModel> --duration <durationSec> --resolution <videoRes> --wait`
- **Interactive:** `mcp__claude_ai_higgsfield__generate_video` with `params.model = <videoModel>`, `resolution = <videoRes>`, `aspect_ratio = <aspectRatio>`, `generate_audio = <generateAudio>`, and start (and end, for scenario `3`) images
- Blocked handling: same as start-frame — reveal → retry → `scene_status = 'blocked'` + `status = 'blocked'` + `status_note`.
- **Write to DB immediately after success:** `higgsfield_video_job`, `clip_url`, `scene_status = 'video_done'`, plus — **scenario `2` only** — `final_frame_url` (extracted from the clip). Scenario `3` needs no `final_frame_url`: the clip's end point was the predetermined end frame.

**(chain) Chain reference:** scenario `2` → set the next scene's reference to `scene.final_frame_url`. Scenario `3` → the next scene's start frame already exists from Phase A; its end frame was wired into the video call above. Scenario `1` → no chain.

---

**Execution order — two-phase (any scenario `3` present):**

1. **Phase A** — for every scene in order n=1,2,3: `(skip)` → `(credit)` → `(start-frame)` → `(vision-gate)` → `(continuity)`. Collect every `start_frame_url`. STOP immediately on any block.
2. **Phase B** — for every non-portrait scene in order: `(skip)` → `(credit)` → `(video)`, passing `--end-image = scenes[n+1].start_frame_url` for all scenes except the last.

**Execution order — single loop (all scenario `1`/`2`, or single-scene `11s`/`portrait`):**
For each scene n=1,2,3 in order: `(skip)` → `(credit)` → `(start-frame, unless scenario 1)` → `(vision-gate, unless scenario 1)` → `(continuity)` → `(video)` → `(chain)`.

### Step 5 — SEO (ONLY after all scenes reach terminal status)

Terminal check before invoking SEO:

- Reel (`11s` / `21s`): ALL scenes must have `scene_status = 'video_done'`
- Portrait: scene 1 must have `scene_status = 'image_done'`

**House rule: SEO is NEVER generated before all scenes are terminal. STOP if any scene is not done.**

Invoke `seo-writer` subagent (Tier 2) with: title, description, format, scene descriptions, channel=Wild Capture.

Store: `UPDATE content_items SET seo = '{ "title": "...", "description": "...", "hashtags": ["..."] }' WHERE id = $id`.

### Step 6 — Set rendered_video_url and persist

**Step 6.5 — 21s auto-stitch (run ONLY for 21s, after all 3 scenes reach `video_done`):**

Download the 3 scene clips, concatenate via FFmpeg, upload to R2, and write `rendered_video_url` by running:

```bash
node apps/video/scripts/assemble-reel.mjs --id <id>
```

The script exits 0 and prints `{ id, rendered_video_url }` on success, or exits 1 with `{ error, message }` on failure. On failure: set `status = 'failed'`, `status_note = 'assembly failed: <message>'`, STOP.

Requires on PATH: `ffmpeg`. Requires env: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_RENDERED`, `R2_PUBLIC_BASE_URL`.

---

Determine `rendered_video_url` by format:

- `11s` → `scenes[0].clip_url` (single clip; no assembly needed)
- `21s` → output of Step 6.5 `assemble-reel.mjs` (3 clips stitched into one MP4 on R2)
- `portrait` → `scenes[0].start_frame_url` (the portrait image IS the final asset)

```sql
UPDATE content_items SET
  status = 'rendered',
  rendered_at = now(),
  rendered_video_url = $renderedVideoUrl
WHERE id = $id;
```

**STOP HERE.** Do not upload, do not publish. Upload is the user's separate plan.

### Step 7 — Report

```
✅ Wild Eye {format} C-{id} rendered
Channel: Wild Capture
Scenes:  scene 1: {clip_url or start_frame_url}
         scene 2: {clip_url}  (21s only)
         scene 3: {clip_url}  (21s only)
SEO title: "{title}"
Assembly: {NEEDED — 3 clips must be stitched before publishing (21s) | NOT NEEDED}
Next: upload, then run publish.js when ready.
```

## House rules enforced by this skill

- Cavy ONLY until page reaches 2,000 followers — reject any concept with other species
- NEVER schedule Tue/Wed/Thu — flag if `slot` field violates this
- Natural audio only — no music score, no ambient drone unless the scene explicitly earns a barely-audible tension pulse
- SEO held until all scenes are video_done
- Reel descriptions end exactly: `Follow for more hidden moments from the wild.` (portraits end with a question)
- No graphic predator kills, no human presence in frame, no captive animals

## Recovery / resume

Re-run with the same `id`. Step 4's `(skip)` sub-step skips scenes already `video_done` (or `image_done` for portrait), and a scene whose `vision_check.status === 'pass'` is not re-gated — so no image or video credits are re-spent on completed work. Step 3 is skipped if `status` is already past `'storyboard'`. For a two-phase scenario-`3` run, Phase A start frames already written with `vision_check.pass` are reused; Phase B resumes at the first scene without a `clip_url`. Fully idempotent.
