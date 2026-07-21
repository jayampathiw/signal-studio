# "This Is The Underdog Archive" (Channel Trailer) — Production Log

The Underdog Archive channel trailer / launch promo. File-based, same stills + Ken Burns pipeline as every video in this channel — but structurally different: it's a 60–75s brand promo that reuses real frames from the 5 already-produced videos, not a new documentary story.

---

## 1. Source material and the one rule that mattered

From `temp/new/intro/`: `SHOT_LIST_Channel_Trailer_Underdog_Archive_UPDATED.md` (19 scenes) + `image mapping.txt` + `images/` (19 placeholder stills).

The source doc opens with an explicit, bolded instruction: **"Reuse existing rendered stills/motifs from the 5 videos wherever possible — don't regenerate from scratch."** This shaped almost everything about how this project was built — see §2 and §3.

## 2. Two rounds of bad-asset discovery in the placeholder batch

**Round 1 — real-photo contamination (same class of bug found earlier this session in `silenced-goalkeeper` and `fifth-match`):** the placeholder image meant for S11 ("Striker boot hitting ball") turned out to be a real, uncredited photo — visible real Nike swoosh on the boots, real Adidas branding on the ball, repeated real "PHILADELPHIA" venue signage, plus its own baked-in "AND THIS TIME" text. Not used. Replaced with a cropped version of `same-coin`'s own S16 (Gill diving the wrong way as the actual France goal goes in) — cropped to remove that still's baked-in "FRANCE 1–0 PARAGUAY" scoreline text first, avoiding a double-text collision.

**Round 2 — wrong logo entirely, caught by the user:** two of the "brand card" placeholders (meant for the logo/wordmark reveal beats) turned out to be completely unrelated branding — one an unrelated bulldog/baseball emblem with the tagline "stories of resilience... the spirit of the grind," the other literally branded **"RESONATE"**, a different company's logo and URL. The user caught this before any of it got used and pointed to the real logo folder: `temp/new/intro/TheUnderdogArchive/`.

## 3. Real brand assets and reuse discipline

Found in `temp/new/intro/TheUnderdogArchive/`: the actual logo files (`underdog_archive_final_logo_ball_mark.png`, `underdog_archive_standalone_icon.png`, `underdog_archive_banner_text_wrapped.png`, `underdog_archive_watermark.png` — this last one is the same file already used as the default watermark on every other video in this channel, confirming consistency) plus a `knowladge/` folder containing the actual brand kit doc (`UnderdogArchive_BRAND_KIT.md`) with exact hex values: navy `#16243a`/`#0c1320` (deepest), rust `#c96a3e`, amber `#e8a559`, cream `#f2ece1`.

All "reused" scenes (10 of 19) pull the actual still file from that video's own project, not a regenerated approximation:

| Trailer scene | Source | Source scene |
|---|---|---|
| S2, S3, S5 | `silenced-goalkeeper` | S02, S26, S45 |
| S6, S7 | `one-match-short` | S02, S33 |
| S8, S9 | `fifth-match` | S02, S14 |
| S10, S11 | `same-coin` | S01, S16 (cropped) |
| S12, S13 | `son-also-saves` | S21, S29 |

**son-also-saves substitution note:** the source trailer doc's own S12/S13 VO and image direction were explicitly flagged by its author as *"built from your memory summary, not a verified source file... swap in the real beat before finalizing."* Read `son-also-saves/shotlist-v2.md` directly and swapped in the actual, stronger beat — Shobeir's Messi penalty save (S21) and the grounded/head-bowed aftermath (S29) — rather than the placeholder's generic "Egypt goalkeeper diving save at Atlanta" framing. The scripted VO lines ("A goalkeeper's son...", "Almost.") still work thematically with the real beat, so no VO rewrite was needed, only the image swap.

## 4. Brand cards — composited fresh, not reused images

7 scenes (S4, S14–S19) needed new brand-only material with no video equivalent. Built by compositing the real logo files onto solid `#0c1320` navy canvases via FFmpeg (`scale` + `overlay`, no Higgsfield generation, zero cost):

- **S4, S15, S18:** full lockup (`underdog_archive_final_logo_ball_mark.png`) centered on navy.
- **S14:** standalone icon only (`underdog_archive_standalone_icon.png`), for the "logo emerging" beat.
- **S16:** the real banner asset (`underdog_archive_banner_text_wrapped.png`) — already ~16:9, has the actual tagline baked in ("Cinematic football stories · World Cup / South America · Underdogs · New stories weekly").
- **S17:** the real watermark badge (`underdog_archive_watermark.png`, has "Subscribe for more" built in), centered on navy.
- **S19:** custom composite — logo in the upper half, lower half left plain navy for YouTube's actual subscribe button + video grid overlay.

S4 and S18 are true title cards (zero `🖼️` lines in the shotlist, per the established convention from every other project's title cards) — `buildTextCard` picks up their background art automatically via the `S04-A`/`S18-A` filename convention, no drawtext duplicate.

## 5. Shotlist port

19 scenes, durations summing to 60s (matching the source doc's own target exactly before VO stretch). One bug fixed before first render: S1's VO line was written as `🎙️ (silence)` (copying the source doc's own notation) — but the pipeline's TTS generator would have synthesized "(silence)" as literal spoken text. Removed the VO line entirely for S1, matching how every other silent scene in this channel is handled (S4/S18 also have no VO line).

## 6. Render

Verified via an isolated 1–4 scene test render first (cold open → S2's silhouette+caption → S3's fixed glove-save → S4's clean title card, no double-text) before the full render.

Full 1–19 render: `output/v1-full.mp4` — **73.0s**, 9.8MB, 0 render errors. Runtime is above the scripted 60s core but still comfortably inside the source doc's own 60–75s target — the difference is VO naturally running longer than the tight 2–3s planned windows on several cuts (expected and documented behavior of this pipeline, most visible on S12's 13-word line: 3s planned → 6.83s actual).

Spot-checked frames: S1 (floodlight), S2 (silhouette + caption), S3 (glove save, confirmed using the *fixed* S26 asset, not the original bad one), S4 (clean title card), S12 (Messi save teaser), S17 (subscribe badge with warm regrade), S19 (end-screen, logo upper-half / clear lower-half as intended). All clean.

## 7. What's left (superseded by §8 — see below)

- ~~User watch-through of the full 73s trailer — not yet done.~~ User reviewed `v1-full.mp4` and found it **too complex** — see §8.
- **Sequencing reminder from the source doc, still true:** publish this alongside or after the 5 videos go live, not before — otherwise "five stories" is inaccurate until the uploads catch up.
- No audio mix/LUFS pass done, same as every other project in this channel.

---

## 8. Full rebuild (later session) — simpler 12-scene version, per user feedback

User watched `v1-full.mp4` (19 scenes, 73s) and felt it was too complex, and separately regenerated the source shot list into a plainer, shorter version. Entire project rebuilt from scratch on the same house pipeline:

- **New source:** `temp/new/trailer/SHOT_LIST_Channel_Trailer_SIMPLE_UPDATED.md` — 12 scenes, ~73-word VO, 45–55s target, explicitly written for viewers who've never seen a match (no jargon, one plain sentence per cut, cuts every 4–6s instead of 2–4s).
- **`v1_backup/`** — the entire original 19-scene build (stills, shotlist, VO, captions) preserved for comparison, nothing deleted.
- **Logo check (per explicit user instruction this round):** user pointed to a second real-logo folder, `temp/new/trailer/TheUnderdogArchive/`, and asked to verify against it before use, plus check whether anything in the *original* `temp/new/intro/` placeholder batch was actually better. `md5sum` confirmed the two `TheUnderdogArchive/` logo folders (`temp/new/intro/` vs `temp/new/trailer/`) are byte-identical — same real assets used in `v1_backup`, so no logo swap was needed. The new placeholder brand-card images (`temp/new/trailer/images/Wordmark...`, `Brand_lockup...`, `End-screen_plate...`) were generic stand-ins rather than wrong-brand contamination like last time, but still not the real logo — real logo files used again for all 5 brand cards.
- **3 more bad reused-scene placeholders caught** (same class of issue as `silenced-goalkeeper`/`fifth-match`, now a recurring pattern worth expecting in every new asset batch): `Goalkeeper_save_at_Boston_Stadium` (face fully visible, not shadowed), `Goalkeeper_diving_for_ball` (real "Lincoln Financial Field" signage, branded kit with sponsor logo, real crowd), `Atlanta_Stadium_pitch_after_whistle` (real PUMA logo, real jersey numbers). All 3 replaced with real, already-QC'd stills pulled directly from their source projects' own `stills/` folders (same sourcing discipline as `v1_backup` — see updated Source Map below).

**New Source Map** (6 reused scenes, down from 10 — the simpler script needed fewer beats):

| Trailer scene | Source project | Source scene |
|---|---|---|
| S2, S4 | `silenced-goalkeeper` | S02, S26 |
| S5 | `one-match-short` | S33 |
| S6 | `fifth-match` | S02 |
| S7 | `same-coin` | S01 |
| S8 | `son-also-saves` | S29 |

S8 note: `son-also-saves` S29's face is visible rather than shadowed — a pre-existing characteristic of that already-published video's own still, not introduced here; flagged but out of scope to fix as part of this trailer rebuild.

**Two new bugs found and fixed during this rebuild, both worth remembering for future brand-card work on this pipeline:**

1. **Caption double-print on brand cards with baked-in tagline text.** S9 ("REAL MATCHES. REAL HISTORY.") and S11 ("NEW VIDEOS EVERY WEEK.") both have their text baked into the still itself, and the running Whisper caption printed the VO line on top of it — same bug class as `silenced-goalkeeper` S51. Fixed by extending the existing per-project `NO_CAPTION_SCENES_BY_PROJECT` mechanism in `assemble-local.mjs` (already used for `silenced-goalkeeper`/`fifth-match`) with `'channel-trailer': new Set([9, 11])`.
2. **New finding about this pipeline's Ken Burns crop:** even `HOLD` motion permanently crops every still to its **center ~66% width/height** (still gets pre-scaled 1.5× then center-cropped back down — `apps/video/src/longform/motion.js`'s `CANVAS_W/H` overscan). S12's first cut had a 5-thumbnail row spanning nearly the full 1920px width, so the outer edge thumbnails were silently cropped off in every render, not just a zoom artifact. Rebuilt S12 with the thumbnail row narrowed and centered inside the safe zone (roughly x=320–1600, y=180–900 on the 1920×1080 canvas) — confirmed clean afterward. **Any future brand card or graphic-heavy still for this pipeline needs its important content kept inside that center-66% safe zone**, not just centered on the canvas.

**Render:** verified via an isolated 1–4 scene test first, then full 1–12 render, then a second full re-render after the two fixes above. Final: **`output/v2-simple-rebuild.mp4`** — 48.6s, ~5.9MB, 0 render errors, matches the 48s scripted target almost exactly (only trivial VO stretch on S7/S9).

## 9. What's left (current)

- **User watch-through** of `v2-simple-rebuild.mp4` — not yet done.
- Sequencing reminder still applies: publish alongside/after the 5 story videos, not before.
- No audio mix/LUFS pass done, same as every other project in this channel.
- `v1_backup/` (the 19-scene version) is kept for comparison, not deleted.
