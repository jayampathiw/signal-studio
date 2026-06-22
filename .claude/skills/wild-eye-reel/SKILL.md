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

**Interactive mode:** show storyboard inline, wait for human approval. Allow edits → revise Step 2 prompts → regenerate (one image, not N videos).
**Cloud mode:** invoke `continuity-checker` agent on the storyboard layout. Any `hard` conflict or missing cavy → `status = 'blocked'`, `status_note = 'storyboard: <conflict>'`, STOP.

Write storyboard URL to scene 1 and update status:
```sql
UPDATE content_items
SET scenes = jsonb_set(scenes, '{0,storyboard_url}', '"<storyboard_url>"'),
    status = 'storyboard'
WHERE id = $id;
```

### Step 4 — Per-scene video generation

Claim the row: `UPDATE content_items SET status = 'generating' WHERE id = $id` — prevents collision with another session.

For each scene in order (n=1, 2, 3):

**a. Skip if done:** if `scene.scene_status === 'video_done'`, skip — idempotent resume on crash.

**b. Credit re-check (cloud mode):** invoke `higgsfield-credit-guard` balance check before each scene. If < 50 credits, STOP without updating DB.

**c. Start-frame image:**
- Prompt: `scene.image_prompt`
- Reference: `prevFinalFrameUrl` (the previous scene's `final_frame_url`) — this IS the continuity mechanism
- **Cloud:** `higgsfield:generate --type image --reference <prevFinalFrameUrl> --resolution 2K --wait`
- **Interactive:** `mcp__claude_ai_higgsfield__generate_image` with reference image set to `prevFinalFrameUrl`
- Blocked/rights: call `reveal_generation` or `higgsfield generate reveal`, wait 5s, retry once. After 2 failures → write `scene_status = 'blocked'` to scenes jsonb, set `status = 'blocked'`, `status_note = 'scene N image blocked: <reason>'`, STOP.
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

**d. Continuity check (Tier 2):** invoke `continuity-checker` agent with:
- `startFrame`: `scene.start_frame_url`
- `scenePrompt`: `scene.video_prompt`
- `prevFinalFrame`: `prevFinalFrameUrl` (omit for scene n=1)
- `none` → proceed | `soft` → log in status_note but proceed (cloud) | `hard` → `status = 'blocked'`, `status_note = 'scene N continuity: <reason>'`, STOP

**e. Video generation (SKIP for portrait format — terminal state is `image_done`):**
- Build prompt string from `video_prompt` fields in order: composition, style, cameraMotion, subjects, action, location, audioCues, lighting, durationSec
- Start image: `scene.start_frame_url`; model: Seedance 2.0; natural audio ON, NO music score
- **Cloud:** `higgsfield:generate --type video --start-image <startFrameUrl> --model seedance-2 --duration <durationSec> --resolution 720p --wait`
- **Interactive:** `mcp__claude_ai_higgsfield__generate_video` with start image and structured prompt at 1080p
- Blocked handling: same as step (c) — reveal → retry → `scene_status = 'blocked'` + `status = 'blocked'` + `status_note`.
- **Write to DB immediately after success:**
  ```sql
  UPDATE content_items
  SET scenes = <updated scenes with higgsfield_video_job, clip_url, final_frame_url, scene_status='video_done'>
  WHERE id = $id;
  ```

**f. Chain:** set `prevFinalFrameUrl = scene.final_frame_url` — passed as continuity reference into next scene's step (c).

### Step 5 — SEO (ONLY after all scenes reach terminal status)

Terminal check before invoking SEO:
- Reel (`11s` / `21s`): ALL scenes must have `scene_status = 'video_done'`
- Portrait: scene 1 must have `scene_status = 'image_done'`

**House rule: SEO is NEVER generated before all scenes are terminal. STOP if any scene is not done.**

Invoke `seo-writer` subagent (Tier 2) with: title, description, format, scene descriptions, channel=Wild Capture.

Store: `UPDATE content_items SET seo = '{ "title": "...", "description": "...", "hashtags": ["..."] }' WHERE id = $id`.

### Step 6 — Set rendered_video_url and persist

Determine `rendered_video_url` by format:
- `11s` → `scenes[0].clip_url` (single clip; no assembly needed)
- `21s` → NULL (3 clips in `scenes[0,1,2].clip_url` need manual or automated assembly first)
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
Re-run with the same `id`. Step 4(a) skips scenes already `video_done`. Step 3 is skipped if `status` is already past `'storyboard'`. Fully idempotent — no credits re-spent on completed work.
