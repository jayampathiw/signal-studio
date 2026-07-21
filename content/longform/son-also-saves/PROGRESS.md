# "The Son Also Saves | Egypt's Impossible Night" — Production Log

Video #30, The Underdog Archive channel. This document is a complete record of everything done on this project so far, kept so context survives a session loss. If you're picking this up cold: read this whole file before touching anything.

---

## 1. Where this project started

Video #30 originally existed only as an ad-hoc edit built from real Grok-generated video clips (`temp/grok-assets (1)/`, 272 files), tracked in a hand-reconstructed `content/longform/son-also-saves/edl.json`. It had **zero footprint in Supabase** and never went through the standard `content_clips`/`content_stills` DB pipeline that project 29 (the reference/working project) uses.

The user identified two problems after watching that cut:
1. Most scenes held a single still for 10+ seconds with no visual interrupt (boring).
2. No text-overlay system — no spectator counts, names, scores, or word-synced emphasis (like "Enjoy").

The user then rewrote the shotlist from scratch (v2, 41 scenes) to fix both: multi-still scenes, plus a two-tier text overlay system:
- **Tier 1 — hero cards**: stats, scorelines, chapter labels. Bebas Neue, cream body + one amber emphasis word, 80px+, 2–5s.
- **Tier 2 — word-sync accents**: single words/short phrases punched in at the exact instant they're spoken (the "Enjoy" moment being the flagship example). Amber, 50–65px, contextual placement, not a fixed grid.

## 2. Early research (before implementation)

Before any of this, the user asked how text overlays are currently added to videos in this codebase generally. Findings (still true, foundational to everything below):
- **All text overlays are FFmpeg `drawtext`-based** — no Remotion, no `.ass`/subtitle-file burn-in, despite `packages/render/remotion` existing as an unused stub.
- Two independent, hardcoded overlay code paths existed before this project: `apps/video/src/renderers/reel.js` (short-form CTA text) and `apps/video/src/longform/motion.js` + `assemble-longform.mjs` (long-form, 3 fixed drawtext styles: `small_cream`/`lower_third`/`stamp`, single flat overlay list, hardcoded 4s duration).
- This is why the user's new script's claim that overlays are "built in Remotion" is simply wrong for this codebase — it was corrected during porting (see §4).

## 3. Key decisions locked in with the user

Before writing any code, these were explicitly decided (see the approved plan, still at `/home/jayam/.claude/plans/refactored-zooming-teacup.md`):

1. **Abandon the Grok video-clip approach entirely** — pivot fully to stills + Ken Burns, matching project 29's visual model.
2. **Do not touch Supabase / `content_clips` / `content_stills`** for this project — stay fully file-based under `content/longform/son-also-saves/`. That DB system stays reserved for a future decision, not used here.
3. **Use FFmpeg `drawtext`, not Remotion** — matches what the codebase actually does elsewhere.
4. **Build the Tier 1/Tier 2 overlay system as reusable pipeline code** (parser + `motion.js` + new helpers), not a one-off hack, so project 29 and future videos benefit too.
5. **VO strategy**: no usable existing narration existed (old VO was muxed into old test-cut MP4s built against the *old* script). Regenerate narration fresh via Kokoro TTS per scene, then derive real Tier-2 timing from word-level Whisper alignment against that freshly-synthesized audio.

## 4. Files created/modified — the pipeline itself

All of this is new, reusable, DB-agnostic pipeline code (works for project 29 too, not just this video):

| File | What it does |
|---|---|
| `content/longform/son-also-saves/shotlist-v2.md` | The user's 41-scene script, ported into the exact markdown syntax the parser expects. Corrected the "built in Remotion" claim. Fixed a few parseability issues from the original (see §4a). |
| `apps/video/src/longform/parse-shotlist-v2.js` | Extended to dispatch `📝` (Tier 1 hero card) vs `🔤` (Tier 2 word-sync accent) lines into `{tier, text, amber_word, zone, duration_sec, at_sec}`. New lines are tagged `format: 'tiered'` so legacy project-29 overlay parsing is completely unaffected (verified byte-identical via MD5 regression check). Also exported `tcToSec` for reuse. |
| `apps/video/src/longform/fonts.js` | Added `BEBAS_FONT` constant alongside existing `SERIF_FONT`. |
| `apps/video/assets/fonts/BebasNeue-Regular.ttf` | New font asset (Google Fonts OFL release). |
| `apps/video/src/longform/text-metrics.js` | Uses `fontkit` (new dependency, added to `apps/video/package.json`) to measure real glyph pixel widths — needed so a Tier-1 card's amber emphasis word can be split into separately-colored `drawtext` filters positioned contiguously. |
| `apps/video/src/longform/placement.js` | ~10 named anchor zones (upper-left, lower-right, center-low, etc.) with drawtext x/y expressions, plus `resolvePlacement(freeText)` that keyword-matches each scene's human-written placement description to the nearest anchor. Not image-content-aware — a keyword match, not vision. |
| `apps/video/src/longform/motion.js` | Extended `buildDrawtext` to dispatch: legacy shape (unchanged, byte-identical) vs `format:'tiered'` (Tier 1 hero cards handled here; Tier 2 word accents explicitly `return null` — they're handled by a completely different mechanism, see next row). |
| `apps/video/src/longform/word-accent.js` | **The Tier-2 scale-punch renderer.** See §5 — this went through several iterations after real ffmpeg bugs were found. |
| `apps/video/src/longform/render.js` | Extracted `buildTextCard`, `buildCut`, `buildStillsScene`, `buildWithXfade` out of `assemble-longform.mjs` into a DB-agnostic module (behavior-preserving refactor, verified via MD5-identical regression render). `buildCut` now splits overlays into inline-drawtext (hero cards + legacy) vs PNG-overlay (Tier 2 word accents) and composites both. `buildTextCard` extended to accept an optional background image (see §7). |
| `apps/video/scripts/longform/assemble-longform.mjs` | Refactored to import from `render.js` instead of defining functions inline. No logic change — confirmed via MD5-identical output before/after. |
| `apps/video/scripts/longform/assemble-local.mjs` | **New.** The local/non-DB assembler — parses `shotlist-v2.md` directly, resolves stills from `content/longform/son-also-saves/stills/` (`S{n}-{cut}.jpg` naming) and VO from `.../vo/S{n}.wav`, calls the same shared `render.js` functions as the DB-backed assembler. Supports `--scenes N-M` for incremental rendering. Applies `overlay-resync.json` overrides on top of script-estimated Tier-2 timing. **Dispatch nuance**: a scene is treated as a true text card (via `buildTextCard`) only when it has **zero parsed stills** — not based on the shotlist header saying "EDITOR GRAPHIC"/"EDITOR BUILD" (which S13, S17, and S32 all say despite having real stills to animate). This lets S13/S17/S32 correctly go through the normal Ken-Burns `buildStillsScene` path instead of being mistaken for plain title cards. |
| `packages/media/subtitles.js` | Added `generateWordTimestamps(audioPath, jsonPath, initialPrompt)` — real per-word timestamps from Whisper's JSON output (the existing `generateSubtitles` only kept sentence-level `.srt`). The `initialPrompt` param was added later after discovering Whisper mis-transcribes uncommon names (see §8). |
| `apps/video/scripts/longform/generate-tts-local.mjs` | **New.** Synthesizes Kokoro TTS per scene from the parsed shotlist's `vo_text`, writes to `content/longform/son-also-saves/vo/S{n}.wav`. Skips scenes with no VO text (title cards) and scenes already having a WAV. |
| `apps/video/scripts/longform/resync-tier2.mjs` | **New.** For each scene with Tier-2 overlays: loads/generates word timestamps for that scene's VO (biased via `initialPrompt`, see §8), fuzzy-matches the overlay text against the transcript (handles digit-vs-spelled-out-number mismatches too), writes real `at_sec`/`duration_sec` into `content/longform/son-also-saves/overlay-resync.json`. Prints a before/after table. |

### 4a. Shotlist porting notes (deviations from the user's original v2 script text)
- "Built in Remotion" → corrected to describe the actual FFmpeg drawtext engine.
- `STILL A (if generated):` (scenes 13, 17 in the original) → simplified to plain `STILL A:` — the parenthetical broke the parser's still-line regex, and these scenes are in fact being generated now, not left to the editor.
- Scenes 32-A / 32-B (original had these as two separate scene blocks, 6:55–7:03 and 7:03–7:15) → **merged into one Scene 32** (6:55–7:15) with two stills (A/B), matching how every other two-still scene in this shotlist already works. No content was dropped — all four Tier-2 beats (Belgium / New Zealand·Iran / Australia / Egypt 2–0) are still there under `S32-A`/`S32-B` file naming.

## 5. The Tier-2 scale-punch implementation — what actually works, and three real FFmpeg bugs found

### 5.0 First bug (found early, during the initial Tier 1/Tier 2 build, before the scale-punch work below)

The very first real end-to-end test of a Tier-1 hero card (`buildHeroCard` in `motion.js`) — text "EGYPT'S FIRST EVER WORLD CUP WIN: 2026" — rendered as **blank** except for the amber word. The card text containing an apostrophe (`EGYPT'S`) silently failed to draw at all, and the log showed ffmpeg silently falling back to a default system font. Root cause: the existing codebase's inline `drawtext=text='...'` escaping convention for apostrophes (close-quote, escaped-quote, reopen-quote — `'\''`) **does not actually work on this ffmpeg build (4.4.2)** — the whole filter silently no-ops instead of erroring.

**Fix**: switched to `textfile=` (writing the text to a scratch file, then referencing the file path) instead of inline `text=`. This is the same technique the short-form reel pipeline (`apps/video/src/renderers/reel.js`) already uses specifically to dodge this exact class of escaping issue — confirming it's a known, pre-existing quirk of this environment, not something new. `motion.js`'s hero-card and word-accent renderers, and `word-accent.js`'s PNG generation, all use `textfile=` via a shared scratch-dir cache (`/tmp/signal-studio-drawtext/`, hashed by content) rather than inline `text=`.

### 5.1 The scale-punch animation itself

The original plan was: live per-frame `scale`/`crop` with a `t`-based expression (the same idiom `motion.js` already uses for Ken Burns push/pull/smash zooms), mirroring how the background zoom works.

**This does not work on this repo's FFmpeg build (4.4.2), and this was proven empirically, not assumed:**
- Tested `crop`/`scale` with a dramatic 3x size change over 3 seconds using `t`-based width/height expressions → pixel-identical frames at start and end. No animation.
- Tested the same `crop` with **fixed** width/height and only `x` (position) animated → real, visible pan. Confirmed by pixel diff (mean diff ~15 vs ~0.1 for the size-animation attempt).
- **Conclusion: on this FFmpeg build, `crop`/`scale` only re-evaluate x/y position per frame — width/height are frozen at their first evaluation.** This is a genuine, confirmed limitation of this environment's FFmpeg, not a coding mistake. It's also worth knowing this might mean the existing Ken Burns push/pull/smash zoom motions elsewhere in `motion.js` don't actually animate in this local sandbox either (though they might work fine wherever the real production rendering happens — this was not tested, and is worth checking before assuming the wider Ken Burns system works here).

**The actual working solution** (in `word-accent.js`): pre-bake the scale ramp as real pixel frames.
1. Render the accent text once to a transparent PNG at natural (1.0x) size.
2. Generate `PUNCH_FRAMES` (≈5, matching 0.2s at 25fps) literal, non-expression `scale`+`pad` calls — each one a plain, deterministic ffmpeg invocation with a JS-computed target size, immune to the per-frame-expression limitation above.
3. Encode those frames into a short lossless alpha clip (`qtrle`, `.mov`).
4. Composite: the baked punch clip plays during `[at_sec, at_sec+0.2)`, then the static full-size PNG (with a `fade` filter alpha fade-out — `fade` DOES animate correctly per frame, confirmed separately, since it changes pixel values not frame geometry) takes over for the hold + fade-out.
5. `render.js`'s `buildCut` orchestrates 2 extra ffmpeg inputs per Tier-2 accent (punch clip + looped static PNG) and a `filter_complex` chain to composite them onto the Ken-Burns base.

### 5.2 Second bug found along the way

The `color` lavfi source (used to make the transparent canvas the text is drawn onto) silently discards its `@opacity` component and produces an **opaque** `yuv420p` frame regardless — UNLESS `format=rgba` is chained **inside the same `-i` lavfi string** (e.g. `-i "color=c=black@0.0:s=WxH:d=1,format=rgba"`). Applying `format=rgba` as a separate later `-vf` filter does **not** work — by then the source has already materialized as opaque with no real alpha to convert from. This was caught because a rendered title card showed a visible black box behind semi-transparent text; fixed in `word-accent.js`'s PNG-generation step.

**Verified end to end**: measured actual pixel width across 5 frames of a real `buildCut()` render — 290→296→303→309→316px, a clean monotonic ~9% growth matching the intended 0.9→1.0 ratio, with no black-box artifact. Confirmed on real production art too (not just synthetic test images).

## 6. Regression safety

Every change to shared code (`motion.js`, `render.js`, the parser) was checked against project 29 by re-rendering `--project 29 --scenes 1-3` before and after, and diffing MD5 checksums of the output. **Every single check came back byte-identical** (`9389e044442a32b6a5d5533dbccf66d6`), including after: the initial two-tier overlay work, the `render.js` extraction, and the `buildTextCard` background-image extension. Zero regression risk to project 29 at any point.

## 7. Real production images integrated

The user pasted real generated stills + a scene→asset mapping file into `temp/assets/` (`New Text Document.txt`), covering **all 40 scenes** (not just the sample batch) plus 7 kit-reference sheets and a watermark asset.

- Cross-referenced all 69 mapped asset IDs against actual files in `temp/assets/` — **all present**, no missing files.
- Copied and renamed 55 scene stills + `S32-B` (the "4 route-lines" variant, per user's choice over the "3 route-lines" alt) into `content/longform/son-also-saves/stills/`, matching the `S{n}-{cut}.jpg` convention.
- Copied the 7 kit-reference images into `content/longform/son-also-saves/stills/refs/` (`egygk.jpg`, `egyout.jpg`, `argout.jpg`, `arggk.jpg`, `gk90s.jpg`, `ball.jpg`, `stadium.jpg`).

**Bug found and fixed**: scenes 5, 39, and 40 (title card / end screen) have mapped images that are **fully-finished graphics** — title text, "The Underdog Archive" branding, "SUBSCRIBE"/"NEXT VIDEO" layout all already baked into the image itself, not photo backgrounds. The original `buildTextCard` background-image code was drawing a *second*, redundant copy of the title text on top in a mismatched serif font (visually confirmed: "THE SON ALSO SAVES" appearing twice, once large/translucent from the image, once small/white from drawtext). Fixed: when `bgImagePath` is given, `buildTextCard` now just holds/shows the image as-is with **no drawtext at all**. Also deliberately **no Ken Burns zoom** on these — a static hold was chosen specifically to sidestep the crop/scale limitation from §5 rather than risk a silent no-op animation.

## 8. VO generation + Tier-2 resync — done for scenes 1–12

- Confirmed Kokoro TTS works in this environment (`kokoro` pip package present; `espeak-ng` binary is missing but doesn't block synthesis — a warning only).
- Ran `generate-tts-local.mjs --scenes 1-12`: all 11 scenes with VO text synthesized cleanly (S05 correctly skipped, no VO text).
- Ran `resync-tier2.mjs --scenes 1-12` — initial result: **3/6 matched**. Investigated the 3 failures:
  - **Bug found**: Whisper's tiny model badly mis-transcribes uncommon proper nouns — "Mostafa Shobeir" came out as "most of a sober"; "Ahmed Shobeir" as "Ack Med Shobr" (confirmed by inspecting the raw word-timestamp JSON).
  - **Fix attempt 1**: tried a larger model (`base`) — still wrong ("most of a showber"). Model size wasn't the issue.
  - **Fix attempt 2 (worked)**: Whisper CLI's `--initial_prompt` flag, biasing the decoder toward expected vocabulary. Tested manually: passing `"Mostafa Shobeir, Ahmed Shobeir, Al Ahly, Egypt, goalkeeper"` as the prompt fixed the transcription outright.
  - **Subtlety found**: the bias only works in **natural title case** — passing the shotlist's raw all-caps card text (`"AHMED SHOBEIR"`) as the prompt did *not* help; converting to `"Ahmed Shobeir"` did. Added a `titleCase()` helper in `resync-tier2.mjs` and wired the scene's own Tier-2 text (title-cased) as the `initialPrompt` argument to `generateWordTimestamps`.
  - Cleared stale cached `.words.json` files for the affected scenes and re-ran.
  - **Final result: 5/6 matched exactly.** The 6th (`S02`, "TENS OF THOUSANDS WATCHING") correctly falls back to the script-estimated timing — that text is a supplementary stat never literally spoken in the VO at all (the shotlist's own production notes already flagged this line as an unverified placeholder), so a "no match" here is the *correct* outcome, not a bug.
- Re-rendered scenes 1–12 with VO + the corrected Tier-2 timing baked in (`assemble-local.mjs --scenes 1-12`).

## 9. Current state / where things are

**⚠️ Superseded — see §12 for the current state.** Everything below in this section was accurate as of when §1–§8 were written, but the Tier-2 overlay approach it describes was subsequently replaced (§12.1), and VO/render coverage has moved far past scenes 1–12. Left as-is for the historical record.

**Rendered and verified (visually, with actual extracted frames):**
- Scenes 1–12 (Cold Open + all of Act 1), with real production stills, real Kokoro VO narration, and resynced Tier-2 timing.
- Confirmed correct: S05 title card (clean, no double-text), S11 hero card ("8 CAPS BEFORE 2026", amber "8", correctly in the sky gap between the two goalkeepers), S12 the flagship "ENJOY" word-sync moment (landing in the upper-right void, timed to the actual spoken word).

**Persistent output location:**
```
content/longform/son-also-saves/output/scenes-1-12.mp4
```
(152.5s, h264 video + aac audio, confirmed via ffprobe — this is the version WITH VO and resynced Tier-2 timing, not the earlier silent version.)

**Assets in place for the whole video (not just scenes 1–12):**
- All 55 scene stills + `S32-B` copied into `content/longform/son-also-saves/stills/` — covers scenes 1–40.
- 7 kit-reference sheets in `content/longform/son-also-saves/stills/refs/`.
- VO + resync only done for scenes 1–12 so far — **scenes 13–40 have no VO yet and have not been rendered.**

**Not yet done (stale — all superseded by §12, which has the real current list):**
- ~~VO generation for scenes 13–40~~ — done, see §12.2 (all 38 VO-bearing scenes complete).
- ~~Tier-2 resync for scenes 13–40~~ — the whole resync approach was replaced by running captions, see §12.1/§12.3 (all scenes have captions.json entries now).
- ~~Full render of scenes 13–40~~ — a full 1–40 render is in progress, see §12.4.
- Audio mix (music bed, SFX) — still not touched, still true, see §12.5.
- Watermark — still not wired into `assemble-local.mjs`, still true, see §12.5.
- Final loudness/LUFS pass, full watch-through QC — still not done, see §12.5.

## 10. How to continue (exact commands)

**⚠️ Stale — see §12.5 for the real current punch list.** Kept for the historical record; VO + captions are now done for the whole video (§12.2/§12.3) and the commands below (VO gen, `resync-tier2.mjs`) are no longer the right next step.

```bash
# Generate VO for the rest of the video
node apps/video/scripts/longform/generate-tts-local.mjs --dir content/longform/son-also-saves --scenes 13-40

# Resync Tier-2 accents against the new VO
node apps/video/scripts/longform/resync-tier2.mjs --dir content/longform/son-also-saves --scenes 13-40

# Render the rest
node apps/video/scripts/longform/assemble-local.mjs --dir content/longform/son-also-saves --scenes 13-40 --output /tmp/act2-5.mp4

# (Then decide: stitch with scenes-1-12.mp4 via ffmpeg concat, or re-run the whole 1-40 range in one pass)
```

Rendering is slow in this sandbox — real production images with the full Ken Burns + noise + vignette + overlay filter chain take roughly 1–3 minutes of wall-clock time per scene-cut here. A 12-scene batch took approximately 25–35 minutes end to end. Budget accordingly for the remaining ~28 scenes.

**Current actual next step (see §12.4):** a full 1–40 render is already running — `node apps/video/scripts/longform/assemble-local.mjs --dir content/longform/son-also-saves --output /tmp/full-video.mp4`. Once it finishes, work through the §12.5 punch list (full watch-through, hero-card decision, audio mix, watermark, LUFS/QC).

## 11. Known open items / things to double check later

- **Letter-spacing/tracking not implemented.** The script's Tier 1 spec calls for "opacity 0→1 over 0.4s, letter-spacing expand 0.04→0.12em simultaneously." Only the opacity fade was implemented — FFmpeg `drawtext` has no native letter-spacing/tracking animation support, and this wasn't worked around (unlike the Tier-2 scale-punch, which got a full pixel-baking workaround — see §5). Hero cards currently fade in at fixed tracking. Worth a future pass if this visual detail matters enough to justify the same kind of baked-frame-sequence workaround.
- The two "rules" documents the user mentioned early on (an "UnderdogArchive Production SOP" and "UnderdogArchive Text Overlay Rules", discussed in a separate chat) were never uploaded to this repo. If they get added later, diff their content against this project's placement/tier rules (§4, §5) for material differences before treating this pipeline as fully final.
- `edl.json` and `temp/grok-assets (1)/` (the old Grok video-clip approach) are left untouched, unused — not cleaned up. Revisit if the user wants that ~240MB removed.
- Whether the Ken Burns push/pull/smash zoom motions actually animate in whatever environment does the *real* production rendering (vs. this local sandbox, where they're confirmed NOT to animate) has not been checked. Worth verifying before assuming the wider motion system works as designed outside this sandbox.
- `apps/video/package.json` gained a new dependency: `fontkit` (for Tier-1 amber-word width measurement).

---

## 12. STATUS UPDATE (post-§9) — running captions replace Tier-2, VO complete for all scenes, full render in progress

Everything in this section happened after §1–§11 were written and is more current than anything above. Read this section first if picking the project up cold.

### 12.1 The pivot: isolated Tier-2 word-punch → full running captions

After watching the scenes 1–12 render (§9's snapshot), the user found the Tier-2 mechanism described in §5 — a single bare word (e.g. "26") scale-punching onto screen in isolation, with no sentence context — unsatisfying. Per user request, it was replaced with **karaoke-style running captions**: the scene's *entire* VO narration is chunked into short on-screen phrases (not just the shotlist's hand-picked Tier-2 words), each word highlighting amber exactly as it's spoken, cream otherwise. This is a materially different design from §5's pixel-baked scale-punch PNG technique — the new captions are plain multi-segment `drawtext` (color swap only, no animation, no PNG baking needed), reusing the same `textfile=` escaping fix and `measureSegments`/fontkit contiguous-layout technique the Tier-1 hero cards already used.

New/changed files for this:
| File | What it does |
|---|---|
| `apps/video/src/longform/captions.js` | **New.** `chunkCaptions(voText, whisperWords, opts)` — tokenizes the shotlist's own script text (so displayed spelling/casing is always correct, Whisper is only used as a clock), pairs tokens 1:1 against Whisper words when counts match, falls back to proportional-by-character-length distribution when they don't (ASR drops/merges/splits a word occasionally). Chunks break on clause punctuation (`,.!?;:—-`) or after 8 words, whichever comes first. A `tailPad` (0.3s, clamped to the next chunk's start) keeps a chunk from vanishing the instant speech stops. Also folds stray punctuation-only tokens (a lone `—` from an em-dash line) into the previous word on both the script-token side and the Whisper-word side, so counts don't silently drift out of parity for the wrong reason. |
| `apps/video/scripts/longform/generate-captions.mjs` | **New — supersedes `resync-tier2.mjs` for this project.** For every scene with VO text + audio, gets real Whisper word timestamps (biased via `--initial_prompt` using the scene's own title-cased VO text — the same fix from §8, now applied to the whole narration, not just a short target phrase) and writes `chunkCaptions()` output to `content/longform/son-also-saves/captions.json`, keyed `S{n}` → array of `{at_sec, duration_sec, words:[{text, offset_start, offset_end}]}` (offsets relative to the chunk's own `at_sec`, not absolute — same reasoning as §5's Tier-2 offset design, needed because `buildStillsScene` remaps `at_sec` per-cut). `resync-tier2.mjs` itself was **not deleted** and still works standalone, but the local assembler no longer calls it. |
| `apps/video/src/longform/motion.js` | Added `buildCaptionAccent()` (the new running-caption renderer — plain drawtext, cream base layer + amber per-word overlay, no PNG baking) and `buildStandaloneAccent()` (a fallback single bare accent for shotlist Tier-2 lines whose scripted timecode falls *outside* every generated caption window for that scene — e.g. Scene 1's "26" popping up at 0:08, well after the opening line's narration already ended at ~2.9s, so the shot doesn't sit with nothing on screen). `buildDrawtext()`'s dispatch: `format:'tiered' && tier===2` now routes to `buildCaptionAccent` when `ov.words` is present (real caption chunk) or `buildStandaloneAccent` when only `ov.text` is present (shotlist fallback). The old scale-punch PNG-baking code (`word-accent.js`, §5) is **not deleted** — just no longer called by this new path — kept in case a future scene wants the punch-in effect back. |
| `apps/video/scripts/longform/assemble-local.mjs` | `mergeCaptions(sceneN, fromSec, overlays)` — loads `captions.json`, converts each chunk into a `{format:'tiered', tier:2, kind:'caption', ...}` overlay object, and **is currently the only overlay source wired into the per-scene render call** — the shotlist's own parsed `scene.overlays` (Tier 1 hero cards + any Tier 2 fallback lines) are accepted as a function parameter but **intentionally ignored** in the current return value. This was a deliberate, explicit user-requested simplification: once running captions covered the same ground with full sentence context, both the Tier-1 stat cards and the standalone Tier-2 reveals were "found to distract from the narration" per the code comment at `assemble-local.mjs:58-63`. The shotlist itself, the parser, and `buildHeroCard`/`buildStandaloneAccent` are all left fully intact and working — re-enabling either is a one-line change (include `tier1`/fallback-`tier2` entries in `mergeCaptions`'s return array) if the user wants them back later. |

### 12.2 VO generation — now complete for the entire video

`generate-tts-local.mjs` has been run across the full script. **All 38 scenes that have narration now have synthesized Kokoro VO** (`content/longform/son-also-saves/vo/S{01..38,40}.wav` — every scene except the two pure title/end cards with no `🎙️` line, Scene 5 and Scene 39; Scene 40 does have VO despite being the outro/CTA card). This is a change from §9/§11's "only scenes 1–12 done" snapshot — VO is no longer a blocker for any scene.

### 12.3 Captions — now generated for the entire video

`generate-captions.mjs` has also been run across the full script. **`captions.json` has an entry for all 38 VO-bearing scenes** (confirmed: `S01–S04, S06–S38, S40`), each with real Whisper-timed word chunks. Per-scene `.words.json` Whisper caches exist alongside every `.wav` in `vo/`. Caption generation is no longer a blocker for any scene either — only the actual video render is.

### 12.4 Render progress

- `content/longform/son-also-saves/output/scenes-1-12.mp4` — earlier silent-VO-era render (§9), now stale.
- `content/longform/son-also-saves/output/scenes-1-24.mp4` — newer render, scenes 1–24 with VO + running captions baked in.
- **A full 1–40 render is in progress right now** (no `--scenes` flag, whole video in one pass): `node apps/video/scripts/longform/assemble-local.mjs --dir content/longform/son-also-saves --output /tmp/full-video.mp4`. This is the process the user is waiting on while this section was written.

### 12.5 What's actually left after the current full render finishes

- **Watch the full 1–40 cut end to end** — first time the whole video will exist as one file with real VO + real captions throughout. Check especially: Scene 1's `buildStandaloneAccent` fallback ("26" at 0:08), scenes 5/39/40's full-graphic title/end cards (no double-text, §7's fix), and general caption readability/timing across all 5 acts.
- **Decide whether Tier-1 hero cards / standalone Tier-2 reveals stay off.** Currently fully suppressed per §12.1 — confirm that's still the call after seeing the full cut, not just the scenes-1-12/1-24 samples.
- **Audio mix** (music bed, SFX) — still completely untouched; `assemble-local.mjs` only does VO + Ken Burns + text overlays, no music layer at all.
- **Watermark** — still not wired into `assemble-local.mjs` (exists only in the DB-backed `assemble-longform.mjs` path).
- **Final loudness/LUFS pass, full watch-through QC** — not done.
- `resync-tier2.mjs` and `word-accent.js` (the old scale-punch approach) are now effectively unused dead-but-working code for this project — fine to leave as-is, or worth a cleanup pass later if the captions-only design is confirmed final.

---

## 13. STATUS UPDATE (post-§12) — full-cut QC round: caption bug fix, S14/S15-B image swap, male voice, watermark

The full 1–40 render from §12.4 finished (532s / 8:52, `/tmp/full-video.mp4`, since preserved — see §13.4). The user watched it end to end and flagged 3 issues, all now fixed, plus 2 follow-up requests (voice change, watermark). Read this section first if picking the project up cold — it supersedes §12.5's punch list on those specific points.

### 13.1 Bug found: Scene 2 caption clipped at a cut boundary

**Symptom:** the line "is standing eleven metres away" (part of Scene 2's narration) was effectively invisible in the render — present in `captions.json` but flashing for ~10ms before being cut away.

**Root cause:** `assemble-local.mjs` has no mechanism to set explicit per-cut `start_sec`/`end_sec` — every multi-still scene falls back to `render.js`'s equal-split default (`cutDur = sceneDur / stills.length`), regardless of where the dialogue naturally breaks. Scene 2's VO (16.5s) stretched the planned 15s scene to 16.9s; the resulting 50/50 split put cut A's boundary at ~8.45s — a hair after the caption "is standing eleven metres away" starts at 8.44s. The caption technically passed `render.js`'s `relAt >= 0 && relAt < cutDur` inclusion check, but with only 0.01s of cut A left before the hard cut to cut B, it had no real screen time.

**Fix** (`apps/video/scripts/longform/assemble-local.mjs`): added a `CUT_SPLIT_OVERRIDES` map (scene number → array of cut-boundary seconds, in the *planned* pre-VO-stretch timeline) and wired it into the `stillRows` construction — when a scene has an override, its stills get explicit `start_sec`/`end_sec` (which `render.js` already supported, just was never fed real values by this script). Scene 2's boundary was moved from the implicit 7.5s (50/50 of 15s) to 11s, giving cut A a final ~12.85s window — comfortably holding the full caption. This only affects scenes explicitly listed in the override map; every other scene's equal-split behavior (and project 29's rendering, which doesn't use this script) is untouched. Verified by rendering Scene 2 in isolation and extracting a frame at the caption's timestamp — text now displays correctly and holds.

### 13.2 Image fixes: S14 (wrong kit) and S15-B (faces too visible)

- **S14** was tagged `@argout` (Argentina kit — sky-blue/white stripes) despite the scene's narration being about Iran (Mostafa Shobeir saving a penalty from Mehdi Taremi) — a tagging mistake, not a stylistic call. New prompt written using a plain white kit (no `@tag` exists for Iran in the reference sheet system, so it's described inline per the master bible's kit rules) plus explicit "face in complete shadow" wording.
- **S15-B** (the Australia-win celebration huddle): kit was correct (`@egygk`/`@egyout`), but the render showed every player's face clearly lit and visible — a direct violation of the master consistency bible's "Face ALWAYS in deep shadow — no facial features ever visible" rule for `@egygk`, and the general "anonymous figures" style used everywhere else in the video. New prompt strengthens the anonymity instruction (backs to camera / heads turned / rim-lit only).
- User regenerated both externally and dropped the new files in `temp/assets/new/S14.jpg` and `temp/assets/new/S15-B.jpg`. Verified visually (Iran player now in plain white, no stripes; S15-B faces now in shadow/turned away) and copied into `content/longform/son-also-saves/stills/S14-A.jpg` and `.../stills/S15-B.jpg`, overwriting the originals.

### 13.3 Presenter voice switched to male (Kokoro `am_michael`)

- `packages/media/tts.js`'s `VOICE_MAP` (shared across all channels/projects) was **not** touched — instead `generate-tts-local.mjs` gained an optional `--voice <id>` CLI flag that overrides the country-based default for a single run, with no effect when omitted (zero regression risk to other projects/news pipeline).
- Old female VO (`af_bella`) backed up to `content/longform/son-also-saves/vo_female_backup/` (all 38 files) and `captions_female_backup.json`, before deleting the live `vo/*.wav` + `*.words.json` and regenerating.
- Regenerated all 38 scenes' VO with `node apps/video/scripts/longform/generate-tts-local.mjs --dir content/longform/son-also-saves --voice am_michael`.
- Re-ran `generate-captions.mjs` for the whole project — **required**, not optional, because word-level Whisper timing shifts with a different voice/pace; captions generated against the old female VO would drift out of sync with new audio. Re-verified the §13.1 cut-split fix still holds against the new VO's different duration (17.1s vs 16.5s) — it does, with margin.
- **13 male voice samples generated for comparison**, all reading the identical line ("But Mostafa Shobeir had been preparing for this exact moment his entire life.") for a fair side-by-side, saved to `content/longform/son-also-saves/voice-samples/`: American English — `am_adam`, `am_echo`, `am_eric`, `am_fenrir`, `am_liam`, `am_michael` (current pick), `am_onyx`, `am_puck`, `am_santa` (Kokoro's novelty "Santa" character, not neutral); British English — `bm_daniel`, `bm_fable`, `bm_george`, `bm_lewis`. Not yet auditioned by the user — `am_michael` is only the current default, not a final decision. If the user picks a different voice after listening, redo this whole regeneration chain (VO → captions → render) with the new voice ID.

### 13.4 Watermark added to the local assembler

- Previously watermarking only existed in the DB-backed `assemble-longform.mjs` path (§12.5 flagged this gap). Ported the same recipe into `assemble-local.mjs`: 80px-wide icon, 40% opacity, bottom-right with 20px padding, applied via `ffmpeg overlay` on the final concatenated video (after scene concat, before writing to `--output`).
- New `--watermark <file>` CLI flag (filename under `assets/logos/`; `--watermark none` disables). Defaults to `underdog_archive_standalone_icon.png` — this project is file-based with no `channel_key` row to look up automatically (unlike the DB path, which resolves it from `channels.js`), so the default is hardcoded to match this channel's configured watermark (`apps/video/src/config/channels.js` → `football/documentary/EN` → `watermarkFile`).
- Verified by extracting a frame from the rendered output — icon visible bottom-right, correctly subtle at 40% opacity.

### 13.5 Two output versions preserved for comparison

Per explicit user request, the pre-fix render was preserved rather than overwritten, so the user can A/B compare:

| File | Contents |
|---|---|
| `content/longform/son-also-saves/output/v1-female-voice-original-images.mp4` | The original full 1–40 render exactly as the user first watched it — female VO (`af_bella`), original (buggy) S14/S15-B images, no watermark, Scene 2 caption-clip bug still present. **Do not overwrite or regenerate — this is the comparison baseline.** |
| `content/longform/son-also-saves/output/v2-male-voice-updated-images-watermark.mp4` | Full 1–40 re-render with all of §13.1–§13.4 applied: fixed Scene 2 caption, new S14/S15-B images, male VO (`am_michael`), watermark. 544.6s (9:04) — slightly longer than v1 because the male narration paces slower and every VO-stretched scene grows with it. |

Both were produced by the same `assemble-local.mjs` full-project command (`--dir content/longform/son-also-saves --output <path>`, v2 additionally uses the now-default watermark).

### 13.6 What's left (superseded — see §14)

- ~~User to audition the 13 voice samples (§13.3) and confirm `am_michael` or pick another~~ — done, see §14: user picked `am_adam`.
- ~~User to watch v2 end to end and confirm the 3 fixes read correctly~~ — done: user confirmed v2 (the picture-lock — Scene 2 caption fix, S14/S15-B images, watermark) is correct as-is; only the voice is changing.
- Still open, untouched: audio mix (music bed/SFX via `content/audio-kit/` + `audio-mix.js`, not yet wired into `assemble-local.mjs`), final LUFS/loudness pass.

---

## 14. STATUS UPDATE (post-§13) — final voice locked to `am_adam`, re-render in progress

User reviewed all 13 male voice samples from §13.3 and picked **`am_adam`** over the current `am_michael`. User also confirmed v2 (`v2-male-voice-updated-images-watermark.mp4`) is otherwise correct/final — the caption fix, S14/S15-B images, and watermark all stay exactly as they are. This round changes **only** the narrator voice; everything else is a byte-for-byte repeat of the v2 recipe.

**Before regenerating:** backed up the `am_michael` VO set to `content/longform/son-also-saves/vo_am_michael_backup/` (38 files) and `captions_am_michael_backup.json`, so both the original female (`vo_female_backup/`, §13.3) and the `am_michael` take remain recoverable if needed. `v2-male-voice-updated-images-watermark.mp4` itself is left untouched in `output/`.

**Regeneration chain (same as §13.3, new voice ID):**
1. Deleted live `vo/*.wav` + `*.words.json`.
2. `node apps/video/scripts/longform/generate-tts-local.mjs --dir content/longform/son-also-saves --voice am_adam` — all 38 scenes.
3. `node apps/video/scripts/longform/generate-captions.mjs --dir content/longform/son-also-saves` — required again, same reason as §13.3 (word timing shifts with voice/pace).
4. Re-verified the §13.1 Scene 2 cut-split override (`CUT_SPLIT_OVERRIDES` in `assemble-local.mjs`) still holds against `am_adam`'s VO duration for that scene.
5. Full render: `node apps/video/scripts/longform/assemble-local.mjs --dir content/longform/son-also-saves --output content/longform/son-also-saves/output/v3-am_adam-final.mp4` (watermark applies by default, same as v2).

**Output:** `content/longform/son-also-saves/output/v3-am_adam-final.mp4` — the intended final version. `v1` and `v2` are both kept as-is for reference/comparison, per standing instruction not to overwrite prior outputs.

### 14.1 Render complete

`v3-am_adam-final.mp4` finished: **515.6s (8:36)**, 111.2MB. Shorter than v2's 9:04 — `am_adam` reads noticeably faster/tighter than `am_michael`, so fewer scenes needed VO-driven stretching (e.g. S02's VO dropped from 17.1s under `am_michael` to 14.75s under `am_adam`). Re-verified the §13.1 Scene 2 cut-split override against the new (shorter) VO duration before rendering — still holds with more margin than before, since a shorter VO means less scene-stretch overall.

This is the current final version, pending the user's watch-through of `v3` itself. `vo/` and `captions.json` now reflect `am_adam` (the `am_michael` take is preserved in `vo_am_michael_backup/` + `captions_am_michael_backup.json`, and the original female take in `vo_female_backup/` + `captions_female_backup.json`, if either needs to be revisited).

**Still open** (unchanged from §13.6): audio mix (music bed/SFX via `content/audio-kit/` + `audio-mix.js`, not yet wired into `assemble-local.mjs`), final LUFS/loudness pass.

## 15. SEO + thumbnail (later session — prepping for upload alongside 4 other channel videos)

- SEO package (YouTube title/description/hashtags + Facebook caption) written to `content/longform/SEO-PACKAGES.md`, using the newly-installed `youtube-seo` and `caption-writer-sms` skills.
- **Thumbnail:** `thumbnail.jpg` (1280x720), built from **S26** (goalkeeper standing alone, front-on, warm/cold split lighting). Visually verified clean before use — anonymous, no crests, no real-photo artifacts (unlike the S26 problems found in `silenced-goalkeeper` and the S22 problem in `fifth-match` during this same thumbnail pass — this project's S26 is fine, don't confuse the two). No Higgsfield generation used — Higgsfield balance was 30.25 credits, below the credit-guard's 50-credit safety floor, so the thumbnail was built via FFmpeg crop + drawtext on an existing still instead, zero cost.
- **Revision (same session):** user reviewed all 5 channel thumbnails and flagged that single-word/score-only text with empty space wasn't attractive/informative enough. Redesigned to a two-tier layout: large "IMPOSSIBLE" + smaller tracked-letter "EGYPT'S NIGHT" underneath, plus a tighter crop on S26 to reduce dead stand/sky space and bring the goalkeeper closer to filling the frame. This one didn't have the extreme wide-shot limitation `silenced-goalkeeper`'s pick did — S26's subject was already reasonably sized, so the crop alone got a good result without needing a different source still.
