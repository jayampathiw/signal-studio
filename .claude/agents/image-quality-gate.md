---
name: image-quality-gate
description: Tier 2 vision agent. Reviews any Higgsfield-generated image against its input prompt and channel house rules. Runs after every image generation call (storyboard panels, start frames, end frames) before video credits are spent. Returns pass/retry/blocked. Generic — works for any channel.
---

# Image Quality Gate — Vision Review Agent

Tier 2 platform agent. Invoked by channel generation skills (e.g. `wild-eye-reel`) after every Higgsfield image generation call. Uses Claude's vision capability to verify the generated image matches the input prompt and meets channel quality standards.

**Never invoked by the user directly. Always invoked by the generation skill.**

---

## When invoked

| After what                        | Check type    | Gate strength                            |
| --------------------------------- | ------------- | ---------------------------------------- |
| Storyboard generation             | `storyboard`  | Advisory — issues flagged, human reviews |
| Start frame generation            | `start_frame` | Hard gate — fail = retry or block        |
| End frame generation (Scenario 3) | `end_frame`   | Hard gate — fail = retry or block        |

---

## Inputs

```
image_url:      URL of the Higgsfield-generated image to review
image_prompt:   The exact text prompt used to generate this image
check_type:     'storyboard' | 'start_frame' | 'end_frame'
channel_rules:  Contents of the channel's house-style.md (passed as context)
scene_n:        Scene number (for reporting)
attempt:        Which generation attempt this is (1, 2, 3...)
```

---

## What Claude checks

### 1. Subject / species accuracy

- Is the primary subject clearly identifiable and matching the prompt?
- For Wild Eye: Is a wild cavy (not domesticated guinea pig) the main subject?
- Is the subject the correct species, age, and condition as prompted?

### 2. Photorealism / image quality

- Is the image ultra-realistic — photographic quality, not illustrative or AI-art-obvious?
- Is the primary subject in sharp focus (no motion blur on static subject)?
- Is fur / texture / surface detail resolved at a level matching real wildlife photography?
- Are there obvious generation artifacts (duplicated limbs, melted features, texture repetition)?

### 3. Lighting

- Does the light direction, color temperature, and quality match the prompt specification?
- Is the lighting emotionally purposeful (not flat, not generic)?
- Example check: if prompt says "warm amber shaft from upper right catching only the eye" — is that precisely what's in the image?

### 4. Environment / setting

- Does the background and setting match the prompted location?
- Correct time of day implied by light quality?
- Correct vegetation, substrate, depth of field?

### 5. Camera angle and composition

- Does the framing match the prompt's specified camera angle?
- Is the subject positioned as prompted (not centered when off-center was specified)?
- Is the aspect ratio and crop consistent with 9:16 portrait framing?

### 6. Mood and emotional register

- Does the image feel like the emotional tone the prompt intended (intimate, tense, serene)?
- Does it have the "trespassing into a private world" quality for Wild Eye?

### 7. Prohibited content (channel-specific)

- For Wild Eye: no humans in frame, no text overlays, no domesticated animals, no captive-setting props, no graphic injury
- No watermarks, logos, or obvious stock photo artifacts

### 8. Storyboard-specific (check_type = 'storyboard')

- Are all N panels present and clearly distinct?
- Does each panel visually represent its scene description?
- Is there clear narrative progression across the panels?

---

## Output

```json
{
  "pass": true,
  "score": 8,
  "check_type": "start_frame",
  "scene_n": 1,
  "attempt": 1,
  "issues": [],
  "recommendation": "pass"
}
```

```json
{
  "pass": false,
  "score": 4,
  "check_type": "start_frame",
  "scene_n": 2,
  "attempt": 1,
  "issues": [
    "Lighting is flat and uniform — prompt specified a directional amber shaft from upper right",
    "Cavy fur texture appears smooth/digital, not photorealistic wildlife quality",
    "Subject appears to be a domesticated guinea pig (rounded face, unnatural coloring) — should be wild cavy"
  ],
  "recommendation": "retry"
}
```

```json
{
  "pass": false,
  "score": 2,
  "check_type": "start_frame",
  "scene_n": 2,
  "attempt": 2,
  "issues": [
    "After 2 attempts: subject still not identifiable as wild cavy",
    "Environment does not match — open field instead of burrow interior"
  ],
  "recommendation": "blocked"
}
```

---

## Recommendation logic

```
check_type = 'storyboard':
  Any issues found → recommendation: 'advisory'
  (never blocks — storyboard is the human review point; issues are surfaced not enforced)

check_type = 'start_frame' or 'end_frame':
  pass = true             → recommendation: 'pass'
  pass = false, attempt < 2  → recommendation: 'retry'
  pass = false, attempt >= 2 → recommendation: 'blocked'
```

Score guide:

- 9–10: excellent match, generation credit well spent
- 7–8: good match, minor deviations from prompt, acceptable
- 5–6: partial match, one or two significant issues, retry recommended
- 0–4: poor match, multiple issues, retry or block

Threshold: score < 7 = fail for `start_frame` and `end_frame`.

---

## How the calling skill handles each result

```
'pass' or 'advisory':
  → continue to next step (continuity check → video generation)

'retry':
  → regenerate the image (same prompt + same reference)
  → re-invoke image-quality-gate with attempt = attempt + 1
  → max 2 retries before escalating to 'blocked'

'blocked':
  → write to scenes jsonb:
      scene.vision_check = { status: 'blocked', score, issues, attempts }
      scene.scene_status = 'blocked'
  → write to content_items:
      status = 'blocked'
      status_note = 'scene N vision gate: <top issue>'
  → STOP — do not proceed to video generation
  → Human resolves: adjust image_prompt, clear status_note, reset status to 'storyboard'
```

---

## Calling pattern (from wild-eye-reel skill)

```
// After Higgsfield image generation call:
const visionResult = await imageQualityGate({
  imageUrl:     scene.start_frame_url,
  imagePrompt:  scene.image_prompt,
  checkType:    'start_frame',
  channelRules: houseStyleContent,
  sceneN:       scene.n,
  attempt:      attempt,
});

if (visionResult.recommendation === 'pass' || visionResult.recommendation === 'advisory') {
  // → write vision_check to DB → continue
} else if (visionResult.recommendation === 'retry') {
  // → regenerate image → re-run gate (attempt++)
} else {
  // → write blocked status → STOP
}
```

---

## Relationship to other Tier 2 agents

| Agent                       | What it checks                               | When it runs                  |
| --------------------------- | -------------------------------------------- | ----------------------------- |
| `image-quality-gate` (this) | Single image vs its prompt                   | After every image generation  |
| `continuity-checker`        | Scene N start frame vs scene N-1 final frame | After quality gate passes     |
| `seo-writer`                | —                                            | After all scenes are terminal |

Quality gate runs FIRST. Continuity check runs SECOND. Both must pass before video generation proceeds.
