# "The Fifth Match | Mexico's Fortress Falls" — Production Log

The Underdog Archive, Video #5 candidate. File-based long-form project, built alongside `same-coin` (Video #4) in the same session — set up in parallel, TTS/render run sequentially (this machine is a 4-core/8-thread box; sequential avoided render contention). Same stills + Ken Burns pipeline as every other project in this channel.

---

## 1. Source material and scope decision

From `temp/new/Mexico's World Cup Exit at the Azteca/`: `SHOT_LIST_The_Fifth_Match_UPDATED.md` (28 scenes, Mexico vs England, Round of 16, Estadio Azteca, July 5 2026 — England win 3–2, Mexico's first-ever home World Cup defeat) + `New Text Document.txt` (scene→asset mapping) + `images/` (28 files, clean 1:1 mapping, no duplicate variants — unlike `same-coin`).

**Same flag as `same-coin`:** the source doc's production notes call this the *third script in a row* landing short of the 8–9 min target (~5:06 as scripted) and recommend budgeting 45–50 scenes going forward. Per the same user decision as `same-coin` ("build as-is now"), built at the scripted 5:06 length.

## 2. Shotlist port

Ported into `shotlist-v2.md` — 28 scenes, 5 acts + cold open + outro, durations summing exactly to 306s (5:06). VO ported verbatim. Voice: Kokoro `am_adam`.

**Notable deviation:** the source doc introduces a new **STORM** grade (dark clouds, rain-streaked light — the pre-match thunderstorm delay) with no `motion.js` preset. Mapped to COLD (closest cool/teal-leaning preset), flagged in the shotlist header.

**S3 and S27 (title cards) DO have real pre-baked background art** in this project's asset folder (unlike `same-coin`) — `Clean_title_card_dark_background` and `THE_FIFTH_MATCH_title_card`. First draft of the shotlist mistakenly included a `🖼️` still-line for these two scenes, which would have routed them through the normal Ken-Burns still path instead of `buildTextCard`'s background-image convention (the established pattern for title cards in every project in this channel). Caught before rendering and fixed — removed the stray still lines, confirmed via parser check that both scenes correctly show zero parsed stills.

## 3. Silent-beat fix (S22)

S22 (the full-time whistle, ~3:52) has real VO but the source doc explicitly instructs *"let the final whistle land silently"* — no caption on that beat, matching `silenced-goalkeeper`'s S38 silent-beat convention. Since S22 has real VO, the running-caption system would otherwise auto-generate and render a caption there, contradicting the intent. Fixed by extending the `NO_CAPTION_SCENES_BY_PROJECT` map (added to `assemble-local.mjs` during this same session, originally for `silenced-goalkeeper`'s S51) to also cover `fifth-match` scene 22. Verified via isolated re-render + frame check (confirmed no caption text on screen) before the full render.

## 4. Render

Full 1–28 render: `output/v1-full.mp4` — 306.04s (5:06), 70.0MB, 0 render errors. Verified via frame checks: S21 (Pickford's save — clean, anonymous), S23 (stadium emptying — clean), S27 (title card, no double-text).

## 5. Known open QC issue — serious, not yet fixed

**S22 is not a usable asset — much more serious than a style violation.** It shows a real, unedited-looking match photograph: a visible referee's face, visible player faces, and what appear to be actual club crests and sponsor logos on the kits (this could plausibly be a real Liga MX or similar match photo, not Mexico vs England at all). This is the worst single-asset violation found across any of the five channel videos so far. Checked S21 and S23 immediately after and both are properly stylized/anonymous, so this looks like one bad asset slipping into the batch rather than a systemic generation problem — but it's currently rendered into `v1-full.mp4` and must be swapped before this video is usable.

## 6. SEO + thumbnail (today's session)

- SEO package (YouTube + Facebook) written to `content/longform/SEO-PACKAGES.md`.
- `thumbnail.jpg` (1280x720): built from **S01** (the single figure sitting on the pitch, head in hands, MOURNFUL grade) — matches the source shot list's own thumbnail spec ("extreme close-up... devastation, not defiance... cream text: THE FIFTH MATCH or 3–2"). No Higgsfield generation used (balance below the 50-credit safety floor) — built via FFmpeg crop + drawtext, zero cost.
- **Revision (same session):** user reviewed all 5 channel thumbnails and flagged that a bare score with no context wasn't informative or attractive enough. Redesigned to a two-tier layout: large "3-2" + smaller tracked-letter "AZTECA FALLS" underneath, plus a tighter crop on S01 to reduce dead stand space above the seated figure. Result now names the venue/story ("Azteca falls"), not just the score.

## 7. What's left

- **Fix S22 (§5) — highest priority of any open item across all 5 videos.** Real/mismatched photo currently in the rendered video; needs replacement and a re-render before this can be called usable, let alone final.
- **Consider script expansion** to hit the 8–9 min target (§1) — deliberately deferred, not started.
- **User watch-through** — not yet done.
- **Audio mix, final LUFS pass** — untouched.
