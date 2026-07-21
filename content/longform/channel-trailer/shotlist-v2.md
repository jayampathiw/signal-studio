# SHOT LIST v2 (IMAGE-FIRST) — "This Is The Underdog Archive" (Channel Trailer, SIMPLE rebuild)
### The Underdog Archive — Launch Promo · Stills + Ken Burns pipeline

**TITLE:** This Is The Underdog Archive
**TARGET_DURATION_SEC:** 48
**PIPELINE:** Brand/promotional trailer, not a match documentary. Rebuilt from `temp/new/trailer/SHOT_LIST_Channel_Trailer_SIMPLE_UPDATED.md` — a deliberately simpler 12-scene replacement for the original 19-scene trailer (`v1_backup/`), which the user felt was too complex. Plain, jargon-free VO (~73 words), aimed at viewers who've never seen a match.
**ASSET SOURCING:** per the source doc's own instruction ("reuse existing rendered stills wherever noted"), every reused scene pulls the **actual verified still file** from that video's own `stills/` folder — not the placeholder images provided alongside this shot list (see rejections below). This matches the sourcing discipline used for `v1_backup`.
**LOGO CHECK (per explicit user instruction this round):** the real brand assets live in `temp/new/trailer/TheUnderdogArchive/` — confirmed byte-identical (md5sum) to the ones already used in `v1_backup` (`temp/new/intro/TheUnderdogArchive/`), so no logo correction was needed this time; the placeholder brand-card images in `temp/new/trailer/images/` (Wordmark/brand-lockup/end-screen-plate) were generic stand-ins, not wrong-brand contamination like last time, but still not the real logo — real logo files used for all 5 brand cards (S3, S9, S10, S11, S12), same as `v1_backup`.
**REJECTED PLACEHOLDER IMAGES (real-photo/brand contamination — same class of issue as silenced-goalkeeper/fifth-match):**
- `Goalkeeper_save_at_Boston_Stadium` (meant for S4) — goalkeeper's face fully visible, not shadowed.
- `Goalkeeper_diving_for_ball` (meant for S7) — real "Lincoln Financial Field" venue signage, branded kit with sponsor logo, real crowd/players visible.
- `Atlanta_Stadium_pitch_after_whistle` (meant for S8) — real PUMA sponsor logo, real jersey numbers, reads as an actual match photo.
- All 3 replaced with real, already-QC'd stills from their source projects (see Source Map). The remaining 2 "reused" placeholders (`Goalkeeper_in_stadium_before_shootout`, `Penalty_area_after_shootout`) and the 3 storm/brand placeholders were clean but superseded anyway per the sourcing rule — real project stills used instead throughout.
**Voice:** Kokoro `am_adam`, matching every other Underdog Archive video.

---

## SECTION A — SOURCE MAP (which finished video each "reused" scene pulls from)

| Trailer scene | Source project | Source scene | Note |
|---|---|---|---|
| S2 | `silenced-goalkeeper` (Video #1) | S02 | goalkeeper alone before shootout |
| S4 | `silenced-goalkeeper` (Video #1) | S26 | the decisive save (user-fixed asset, see that project's PROGRESS.md §5) |
| S5 | `one-match-short` (Video #3, Colombia) | S33 | empty penalty spot after shootout |
| S6 | `fifth-match` (Video #5, Mexico) | S02 | Estadio Azteca storm exterior |
| S7 | `same-coin` (Video #4, Paraguay/France) | S01 | Gill's full-stretch dive |
| S8 | `son-also-saves` (Video #2, Egypt) | S29 | grounded, head bowed, teammate's hand on shoulder |

**[STYLE]** (for the 1 genuinely new photographic scene, S1) — Cinematic, dramatic, low-key lighting. Desaturated palette with warm amber accents and navy/rust brand tones. Slight film grain. No figures. 16:9.

**Note on S8:** its source still (`son-also-saves` S29) has the subject's face visible rather than fully shadowed — a pre-existing characteristic of that still in the already-published `son-also-saves` video, not something introduced here. Flagged, not fixed (out of scope for this trailer rebuild).

## SECTION B — PACING NOTE
Cuts every 4–6 seconds, VO one short plain sentence per cut. Simpler and slower than `v1_backup`'s rapid-cut version per the user's "too complex" feedback.

---

**SCENE 1 — 0:00–0:04 (4s)** · MOURNFUL grade
🖼️ STILL A: [NEW] Total darkness broken only by a single distant stadium floodlight cutting a sharp cone of warm amber light through the void. No figures. [STYLE]
🎞️ HOLD.
🎙️ "Every great story starts the same way."

**SCENE 2 — 0:04–0:08 (4s)** · COLD grade
🖼️ STILL A: [REUSED — silenced-goalkeeper S02] Lone goalkeeper silhouette standing motionless in the empty stadium before the shootout, back to camera, face lost in shadow.
🎞️ PUSH 1.00 → 1.05 over 4s.
🎙️ "Someone nobody expected to win."

**SCENE 3 — 0:08–0:10 (2s)** · WARM grade
🖼️ STILL A: [NEW — brand card] Full logo lockup (ball mark + wordmark) centered on navy.
🎞️ HOLD.

**SCENE 4 — 0:10–0:14 (4s)** · WARM grade
🖼️ STILL A: [REUSED — silenced-goalkeeper S26] Orlando Gill at full stretch, glove palming the ball away, the decisive save.
🎞️ PUSH 1.00 → 1.06 over 4s.
🎙️ "A goalkeeper who shocked the world."

**SCENE 5 — 0:14–0:18 (4s)** · MOURNFUL grade
🖼️ STILL A: [REUSED — one-match-short S33] The empty penalty spot after the shootout, abandoned, floodlights dimming.
🎞️ HOLD.
🎙️ "A team that came one kick short."

**SCENE 6 — 0:18–0:22 (4s)** · COLD grade
🖼️ STILL A: [REUSED — fifth-match S02] Estadio Azteca under a violent pre-match thunderstorm, lightning in the distance.
🎞️ PUSH 1.00 → 1.06 over 4s.
🎙️ "A fortress that fell for the first time ever."

**SCENE 7 — 0:22–0:26 (4s)** · WARM grade
🖼️ STILL A: [REUSED — same-coin S01] Gill's full-stretch dive at Philadelphia Stadium, gloves reaching for the ball.
🎞️ PUSH 1.00 → 1.06 over 4s.
🎙️ "The same hero, facing an even bigger test."

**SCENE 8 — 0:26–0:30 (4s)** · MOURNFUL grade
🖼️ STILL A: [REUSED — son-also-saves S29] Goalkeeper grounded on the pitch, head bowed, a teammate's hand on his shoulder.
🎞️ HOLD.
🎙️ "A team that almost pulled off the impossible."

**SCENE 9 — 0:30–0:34 (4s)** · WARM grade
🖼️ STILL A: [NEW — brand card] Standalone ball-mark icon on navy with "REAL MATCHES. REAL HISTORY." beneath.
🎞️ PUSH 1.00 → 1.05 over 4s.
🎙️ "Real matches. Real history. Real emotion."

**SCENE 10 — 0:34–0:38 (4s)** · WARM grade
🖼️ STILL A: [NEW — brand card] Full logo lockup centered on navy (same asset as S3).
🎞️ HOLD.
🎙️ "This is The Underdog Archive."

**SCENE 11 — 0:38–0:42 (4s)** · WARM grade
🖼️ STILL A: [NEW — brand card] Logo lockup with "NEW VIDEOS EVERY WEEK." beneath.
🎞️ HOLD.
🎙️ "New stories, every week."

**SCENE 12 — 0:42–0:48 (6s)** · WARM grade
🖼️ STILL A: [NEW — brand card] Logo lockup in the upper third; a horizontal row of all 5 videos' real thumbnails below it; bottom third left clear for platform subscribe UI.
🎞️ HOLD.
🎙️ "Subscribe. Five stories are waiting for you right now."

---

## PRODUCTION NOTES

- **Runtime as scripted:** 48s core (source doc's own 45–55s target), a deliberate simplification from `v1_backup`'s 60s/19-scene cut.
- **v1_backup/** preserves the entire original build (stills, shotlist, VO, captions) for comparison — nothing deleted.
- **Watermark:** applies by default via `assemble-local.mjs`, same as every other project.
