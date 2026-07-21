# "The Same Coin | Paraguay's Run Ends Against France" — Production Log

The Underdog Archive, Video #4 candidate. File-based long-form project, sequel to `silenced-goalkeeper` (Video #1) — same goalkeeper (Orlando Gill), eleven days later. Built with the same stills + Ken Burns pipeline as every other project in this channel. If picking this up cold: read this file, then `silenced-goalkeeper/PROGRESS.md` for the underlying pipeline mechanics.

---

## 1. Source material and scope decision

From `temp/new/Paraguay's World Cup Exit vs. France/`: `SHOT_LIST_The_Same_Coin_UPDATED.md` (25 scenes, Paraguay vs France, Round of 16, Philadelphia, July 4 2026 — France win 1–0 on a 70th-minute Mbappé penalty) + `New Text Document.txt` (scene→asset mapping) + `images/` (41 files: 23 unique concepts, most with two generated variants).

**Flag, resolved with the user:** the source doc's own production notes say this is a **first draft, short of the 8–9 min target** (~4:32 as scripted vs the stated goal) and explicitly recommend expanding it before generation — "most naturally in Act 3." The images provided only cover the current (short) scene count; expansion would mean new scenes with no art yet. Per explicit user instruction (`AskUserQuestion`: "Build as-is now"), built at the scripted 4:32 length — expansion is a separate future step, not done here.

## 2. Image variant resolution

Most Paraguay/France stills had two generated versions in the source folder (a base file and a `_2` file). Per user instruction ("use the `_2` version, that is the updated version"), the `_2` variant was used for every scene that had one; 5 scenes (S5, S7, S13, S14, S15) only had a base version, so those were used as-is.

## 3. Shotlist port

Ported into `shotlist-v2.md` — 25 scenes, 5 acts + cold open + outro, durations summing exactly to 272s (4:32), matching the source doc's own timecodes. VO ported verbatim. Voice: Kokoro `am_adam`.

**Notable deviation:** the source doc introduces a new **HEAT** grade (bleached daylight, heat-shimmer — the Philadelphia heatwave match) that `motion.js` has no regrade preset for. Mapped to WARM (closest available), flagged in the shotlist header rather than silently dropped. No new preset was implemented — out of scope for this build.

**S3 and S24 (title cards) have no pre-baked background image** — unlike every other project in this channel, this source asset folder didn't include dedicated title-card art. These render via `buildTextCard`'s plain-black-background fallback (confirmed this path already existed and works, no code change needed).

## 4. Render

Full 1–25 render: `output/v1-full.mp4` — 272.04s (4:32), 56.8MB, 0 render errors. Verified via frame checks: S1 (dive save + caption), S3 (plain black title card, correct), S14 (VAR referee), S19 (the no-handshake moment).

## 5. Known open QC issue — not yet fixed

**S19** (the no-handshake scene, ~3:44 — "At the final whistle, Mbappé doesn't shake his hand...") shows two figures with fully visible, detailed faces, not the anonymous/face-in-shadow treatment used everywhere else in this channel's house style. They read close enough to real player likenesses (build/kit matching Mbappé and a Kane-type figure) to be a real flag, not just a style nitpick. Not yet regenerated or replaced.

## 6. SEO + thumbnail (today's session)

- SEO package (YouTube + Facebook) written to `content/longform/SEO-PACKAGES.md`.
- `thumbnail.jpg` (1280x720): built from **S01** (Gill's full-stretch dive, WARM grade) — matches the source shot list's own thumbnail spec almost exactly ("extreme close-up, anonymous goalkeeper, mid-dive, intensity... amber/warm accent"). No Higgsfield generation used (balance below the 50-credit safety floor) — built via FFmpeg crop + drawtext on the existing still, zero cost.
- **Revision (same session):** user reviewed all 5 channel thumbnails and flagged that a bare score with no context wasn't informative or attractive enough. Redesigned to a two-tier layout: large "1-0" + smaller tracked-letter "MBAPPE STRIKES" underneath, plus a tighter crop on S01 (Gill's dive already spans most of the frame diagonally, so this mainly tightened dead space around the edges). Result now names the actual event (Mbappé's penalty), not just the score.

## 7. What's left

- **Fix S19** (§5) — regenerate with proper anonymous/shadowed treatment.
- **Consider script expansion** to hit the 8–9 min target (§1) — deliberately deferred, not started.
- **User watch-through** — not yet done.
- **Audio mix, final LUFS pass** — untouched.
