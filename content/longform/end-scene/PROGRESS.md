# Common Ending Scene — Production Log

A single shared outro scene, built to be appended to (or swapped in for) the end of every Underdog Archive video, replacing each video's own bespoke end-screen scene with one consistent brand card. Built with the same file-based stills + Ken Burns pipeline as every other project in this channel.

## 1. Source material

User supplied one background plate: `Minimalist_background_plate_with…_2K_202607202042.jpeg` (2752×1536, ~16:9). "THE UNDERDOG ARCHIVE" wordmark baked in, dark navy-to-amber radial background with faint world-map line art, and two empty placeholder shapes (a circle and a rectangle) reserved for a future subscribe-icon / next-video-thumbnail overlay — not composited yet, left blank in this pass.

## 2. What was built

| Step | Result |
|---|---|
| Directory setup | `content/longform/end-scene/{stills/,vo/,output/}`; still copied in as `stills/S01-A.jpg` |
| `shotlist-v2.md` | Single 13s scene. `STATIC` motion (same fix used for `silenced-goalkeeper` S51 — shows the full plate with no crop, since every other motion type including `HOLD` permanently crops to the center ~66% of the frame). Parses cleanly. |
| Narration | Written fresh for this scene — deliberately generic/region-agnostic (not tied to any one country's story), so it works appended after any video in the channel: *"If you want the stories the highlight reels skip — the underdogs, the rivalries, the forgotten history behind the world's game — this is the channel. Subscribe, and the next one's already on its way."* |
| TTS | `generate-tts-local.mjs --voice am_adam` (the channel's standard voice). VO duration 13.03s, essentially exact match to the 13s scripted target. |
| Captions | `generate-captions.mjs` — 8 Whisper-timed caption chunks, running amber word-highlight style, same as every other project. |
| Render | `assemble-local.mjs`, default watermark on. **Output: `output/v1-end-scene.mp4`** — 13.48s, 0 render errors. |

Spot-checked frames at 1s/6s/12s: full plate visible with no cropping, captions sit clear of both placeholder shapes (circle and rectangle), watermark bottom-right doesn't collide with anything.

## 3. What's left

- **User watch-through with audio** — not yet done.
- **Placeholder shapes are still empty** — the circle and rectangle in the source plate are reserved for a subscribe icon and a next-video thumbnail respectively, but nothing is composited into them yet. Worth a follow-up pass once you decide what goes in each (e.g. drop the channel's ball-mark icon into the circle, a rotating/most-recent video thumbnail into the rectangle).
- **Not yet spliced into any of the 5 published videos.** This is currently just a standalone 13.5s clip. Splicing options once approved: (a) replace each video's own S51/S35/etc. end-screen scene the way `silenced-goalkeeper` was patched (trim + concat), or (b) simply concatenate this clip onto the end of each video's final render as an added outro, leaving each video's existing ending scene in place. Needs a decision before proceeding.
- No audio mix/music bed — VO only, consistent with the rest of the channel's current state.
