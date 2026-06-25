# Higgsfield Models — Reference

**Source:** Live query via `models_explore` MCP tool · Jun 2026  
**Scope:** All models relevant to Signal Studio (9:16 ratio, photorealistic, start/end frame support)

---

## How to query available models

In any interactive Claude session (claude.ai/code) the Higgsfield MCP is available automatically:

```js
// List all image models
models_explore({ action: 'list', type: 'image' })

// List all video models
models_explore({ action: 'list', type: 'video' })

// Get constraints for a specific model (aspect ratios, params, media roles)
models_explore({ action: 'get', model_id: 'seedance_2_0' })

// Get a recommendation for a use-case
models_explore({ action: 'recommend', query: 'wildlife portrait 9:16 start-frame chain' })
```

The `id` field on each result is the exact value to pass as `model` in `generate_image` / `generate_video`.

---

## Image models

Models that support 9:16 aspect ratio and are suitable for photorealistic wildlife start frames.

| Model ID | Name | Provider | Resolution options | Best for |
|---|---|---|---|---|
| `nano_banana_pro` | Nano Banana Pro | Google | 1k · 2k · 4k | Ultimate quality, precise prompts, text rendering |
| `nano_banana_2` | Nano Banana 2 | Google | 1k · 2k · 4k | Fast + high quality, photorealistic |
| `nano_banana` | Nano Banana | Google | default (1k) | Budget, realistic, affordable |
| `cinematic_studio_2_5` | Cinema Studio Image 2.5 | Higgsfield | 1k · 2k · 4k | Cinematic stills, dramatic lighting |
| `soul_cinematic` | Soul Cinema | Higgsfield | 1.5k · 2k | Cinema-grade stills, concept art |
| `seedream_v4_5` | Seedream 4.5 | Bytedance | basic · high | 4K precise control, transformations |
| `flux_2` | Flux 2.0 | Black Forest Labs | 1k · 2k | Precise prompt adherence; sub-variants: pro/flex/max |
| `kling_omni_image` | Kling O1 Image | Kling | 1k · 2k | Versatile photorealistic |

**Wild Eye default:** `nano_banana_pro` — supports 9:16, 2K, photorealistic, strong prompt adherence for cavy anatomy detail.

### Image model parameters

```js
generate_image({ params: {
  model: 'nano_banana_pro',
  prompt: scene.image_prompt,       // from scenes jsonb
  aspect_ratio: '9:16',
  resolution: '2k',                 // or '4k' for storyboard composite
  // medias: [{ role: 'image', value: referenceMediaId }]  // optional reference
}})
```

---

## Video models

Models that support `start_image` and/or `end_image` media roles, required for Wild Eye Scenario 3 (start + end frame chain).

| Model ID | Name | Provider | Duration range | Resolution | start+end frame | Notes |
|---|---|---|---|---|---|---|
| `seedance_2_0` | Seedance 2.0 | Bytedance | 4–15s | 480p · 720p · 1080p · 4K | ✓ | **Wild Eye default.** Native audio. Genre hints. 4K = std mode only. |
| `seedance_2_0_mini` | Seedance 2.0 Mini | Bytedance | 4–15s | 480p · 720p | ✓ | Budget/fast variant. Same media roles. |
| `seedance_1_5` | Seedance 1.5 Pro | Bytedance | 4 · 8 · 12s | 480p · 720p · 1080p | ✓ (start+end) | Fixed durations only. |
| `kling3_0` | Kling 3.0 | Kling | 3–15s | std · pro · 4K | ✓ | Multi-shot, audio sync, motion transfer. |
| `kling3_0_turbo` | Kling 3.0 Turbo | Kling | 3–15s | 720p · 1080p | start only | Fast, cheaper. No end_image. |
| `wan2_7` | Wan 2.7 | Wan | 2–15s | 720p · 1080p | ✓ | Audio sync, character-consistent. |
| `cinematic_studio_3_0` | Cinema Studio Video 3.0 | Higgsfield | 4–15s | — | ✓ | Premium cinema-grade. |

**Wild Eye default:** `seedance_2_0` — supports `start_image` + `end_image` (Scenario 3), 9:16, up to 4K, native audio, 4–15s range covers both 11s and 21s formats.

### Seedance 2.0 full parameter reference

```js
generate_video({ params: {
  model: 'seedance_2_0',
  prompt: scene.video_prompt_text,   // assembled from scenes jsonb fields
  duration: 11,                      // 4–15, any integer
  aspect_ratio: '9:16',
  resolution: '720p',                // 480p | 720p | 1080p | 4k (4k = std mode only)
  mode: 'std',                       // 'std' = quality | 'fast' = cheaper, 480p/720p only
  genre: 'auto',                     // auto | action | horror | comedy | noir | drama | epic
  generate_audio: true,              // true = natural audio | false = silent
  bitrate_mode: 'standard',          // standard | high
  medias: [
    { role: 'start_image', value: startFrameJobId },   // Scenario 2 + 3
    { role: 'end_image',   value: endFrameJobId },     // Scenario 3 only
    // { role: 'audio',    value: audioMediaId },       // optional audio reference
    // { role: 'video',    value: videoMediaId },       // optional video reference
  ]
}})
```

---

## Wiring model selection into the skill

### Channel config (`apps/video/src/config/channels.js`)

Store model IDs in the channel config so the skill inherits them and they can be overridden per-channel without touching skill code:

```js
export const channels = {
  'wildlife/intimacy/EN': {
    slug:         'wild-eye',
    engine:       'skill',
    strategy:     'start_frame_chain',
    imageModel:   'nano_banana_pro',   // passed to generate_image
    videoModel:   'seedance_2_0',      // passed to generate_video
    imageRes:     '2k',
    videoRes:     '720p',
    aspectRatio:  '9:16',
    generateAudio: true,
  }
}
```

### Inside `wild-eye-reel` skill

The skill reads these from the channel config fetched via Supabase at startup:

```js
// Step 2a — generate start frame
const imgJob = await generate_image({ params: {
  model:        channel.imageModel,    // 'nano_banana_pro'
  prompt:       scene.image_prompt,
  aspect_ratio: channel.aspectRatio,
  resolution:   channel.imageRes,
}})

// Step 2c — generate video clip (after vision gate passes)
const vidJob = await generate_video({ params: {
  model:          channel.videoModel,  // 'seedance_2_0'
  prompt:         buildVideoPrompt(scene.video_prompt),
  duration:       scene.duration_sec,  // 11 or 21
  aspect_ratio:   channel.aspectRatio,
  resolution:     channel.videoRes,
  generate_audio: channel.generateAudio,
  medias: [
    { role: 'start_image', value: imgJob.id },
    ...(scene.end_frame_job_id
      ? [{ role: 'end_image', value: scene.end_frame_job_id }]  // Scenario 3
      : [])
  ]
}})
```

### Per-scene override (from dashboard Generation Config)

When the user changes the model in the Scenes tab config panel, those values are saved to `scenes[n].gen_config` jsonb. The skill checks for a scene-level override before falling back to channel defaults:

```js
const imageModel = scene.gen_config?.imageModel ?? channel.imageModel
const videoModel = scene.gen_config?.videoModel ?? channel.videoModel
```

---

## CLI note

The `higgsfield` binary is installed in the GitHub Actions runner for the credit-guard and account-balance checks (`higgsfield account balance`). Image and video generation itself goes through the **MCP tools** (`generate_image`, `generate_video`), not the CLI, so exact CLI flag names for `--model` are not load-bearing for generation.

If CLI generation is ever needed, verify flags with:
```bash
higgsfield generate image --help
higgsfield generate video --help
```

The model IDs in this doc (`nano_banana_pro`, `seedance_2_0`, etc.) are the authoritative values returned by the MCP API and will be correct regardless of CLI flag naming.

---

## Choosing a model for Wild Eye

| Situation | Image model | Video model |
|---|---|---|
| Standard 11s reel (default) | `nano_banana_pro` | `seedance_2_0` |
| Budget run / test brief | `nano_banana_2` | `seedance_2_0_mini` |
| Maximum quality (slow) | `cinematic_studio_2_5` | `cinematic_studio_3_0` |
| Precise anatomy detail | `nano_banana_pro` | `seedance_2_0` |
| 21s three-scene chain (start+end) | `nano_banana_pro` | `seedance_2_0` (or `kling3_0`) |

**Key constraint for Scenario 3:** The video model **must** support both `start_image` and `end_image` media roles. `seedance_2_0`, `seedance_1_5`, `kling3_0`, `wan2_7`, and `cinematic_studio_3_0` all support this. `kling3_0_turbo` does not (start frame only).
