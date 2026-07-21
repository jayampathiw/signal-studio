# "One Match Short | Colombia's World Cup Heartbreak" — Production Log

The Underdog Archive, Video #3 candidate. File-based long-form project (no Supabase/`content_clips`), built with the same pipeline as `content/longform/son-also-saves/` (project 30). If you're picking this up cold: read this whole file, then `content/longform/son-also-saves/PROGRESS.md` for the underlying pipeline mechanics (this project reuses it unchanged).

---

## 1. Source material

Everything came from `temp/One Match Short/`:
- `Colombia_Exit_ShotList_v1.md` — the user's 35-scene shot list (Colombia's Round of 16 penalty-shootout exit to Switzerland, World Cup 2026), with verified facts, VO, grades, kit tags, and a scene→asset mapping doc.
- `New Text Document.txt` — master scene→asset_id map (Grok Imagine asset IDs), covering all 35 scenes + 5 kit/venue reference sheets + 2 thumbnail variants, plus a "DO NOT USE — superseded" list of old asset IDs.
- `assets/` — 44 `grok-<uuid>.jpg` files, cross-referenced against the map: **all present, no missing files.**

One detail was deliberately excluded per the source doc's own instruction: an unconfirmed claim about match officials, flagged in the source doc as "do not use until confirmed." Not included anywhere in this project.

## 2. Pipeline decision

Per explicit user instruction, this project uses the **son-also-saves pipeline exactly**, not the earlier Tier 1/Tier 2 hero-card system:
- File-based under `content/longform/one-match-short/` — no DB.
- Stills + Ken Burns (FFmpeg `drawtext`, no Remotion).
- **Running Whisper-timed captions only** — no Tier 1 hero cards, no Tier 2 word-punches. The shotlist's `📝 TIER 1` lines are kept (parsed, provide title-card fallback text) but inert, same as son-also-saves.
- Kokoro TTS voice: `am_adam` (son-also-saves' final pick), applied from the start — no voice-iteration round needed this time.
- Watermark on by default (`underdog_archive_standalone_icon.png`, same as son-also-saves).

## 3. What was built

| Step | Result |
|---|---|
| Directory setup | `content/longform/one-match-short/{stills/,stills/refs/,stills/thumbnails/,vo/,output/}` |
| Asset copy | All 35 scene stills renamed `S{01..35}-A.jpg`; 7 refs (`colout`, `colgk`, `swiout`, `swigk`, `james2014`, `bcplace`, `kansascity`) into `stills/refs/`; 2 thumbnail variants into `stills/thumbnails/` |
| `shotlist-v2.md` | Ported from the source doc into this codebase's parser syntax (see §4 below for porting notes). Parses cleanly: 35 scenes, target 376s. |
| TTS | `generate-tts-local.mjs --voice am_adam` — all 33 VO-bearing scenes (Scenes 3 and 34 are title cards, no VO). 0 errors. |
| Captions | `generate-captions.mjs` — all 33 scenes got real Whisper-timed caption chunks, written to `captions.json`. |
| Verification render | Scenes 1–3 rendered and visually confirmed: VO + amber word-highlight captions correct, watermark applied, title card (S03) shows the pre-baked "ONE MATCH SHORT" graphic with no duplicate drawtext. |
| Full render | `assemble-local.mjs` (no `--scenes` flag) — all 35 scenes, 0 failures, only sub-second VO stretches on S05/S08/S29/S35. **Output: `content/longform/one-match-short/output/v1-full.mp4`** — 378.2s (6:18), 89.8MB, h264+aac, watermarked. |

## 4. Shotlist porting notes (deviations from the source doc)

- Source doc used a single `🎬` line per scene for the visual description; ported to this codebase's `🖼️ STILL A:` format (all 33 real scenes are single-still, cut A only — no multi-still A/B scenes in this shot list).
- Source doc's scene-header grade format was `** · Grade: MOURNFUL`; changed to `** · MOURNFUL grade` to match the parser's grade regex (`·\s*(WARM|COLD|MONOCHROME|MOURNFUL)` — must follow `·` directly, no `Grade:` label).
- Scenes 3 and 34 ("TITLE CARD: ONE MATCH SHORT... No still needed" in the source) — kept as zero-`🖼️`-line scenes so `assemble-local.mjs` treats them as `buildTextCard` calls, but the asset map actually provides real pre-baked title graphics for both (`S03-A.jpg`, `S34-A.jpg`) — same "finished graphic, no drawtext duplicate" pattern as son-also-saves' S5/S39/S40 fix. Verified visually: clean single title render, no double text.
- Scene 35 (source doc's outro/CTA, described as "end-screen plate... space for subscribe + next-video thumbnail") has both a real generated image and real VO — rendered as a normal still scene (`HOLD` motion), not a text card.
- Source doc's `🔇 NO CAPTIONS` markers on Scenes 23/26 (originally meant to suppress isolated Tier-2 word-punches) don't map to anything in the running-captions design — the parser doesn't recognize `🔇` lines (harmless no-op), and running captions render normally across the full VO on both scenes, consistent with how son-also-saves' final design works (no per-scene caption suppression mechanism exists).
- Source doc's `📝` stat-card lines (S7, S9, S14, S30, S35 stats/scorelines) were ported into `TIER 1 at H:MM: **TEXT** — amber "WORD", <placement>. Ns.` syntax and kept in the shotlist for potential future re-enable, but are not rendered (per the pipeline decision, §2).
- Motion assignments (PUSH/PULL/SMASH/HOLD) were not in the source doc (it only had per-scene visual descriptions, not editor-side Ken Burns instructions) — assigned during porting: `SMASH` for every shootout goal/save/crossbar-hit beat (Scenes 13, 17, 18, 20, 21, 22, 23, 24, 26), `HOLD` for deliberate stillness beats (Scenes 15, 27, 33), `PULL` for reveals/walks (Scenes 6, 10, 25, 28, 32), `PUSH` (including the parser's `micro_push` classification for scenes using a `1.06` amplitude — Scenes 2, 8, 12) for everything else.

## 5. Known open item — not yet fixed

- **S23 (Kobel penalty save) shows a visible crest/badge on the Colombia jersey** — the source doc's own art-direction rules call for solid-color kits with no badges/logos/crests/FIFA marks (thumbnail spec explicitly says "no crests, no FIFA marks"). This is baked into the Grok-generated image itself, not fixable in the render pipeline — needs either a regen of that still (same recipe as son-also-saves' S14/S15-B fix, §13.2 of that project's log) or the user's sign-off that it's acceptable as-is. **Still not fixed as of §8 below** — carried unchanged through v2 and v3. Also worth a second look: S26's new replacement image (§7) shows the Swiss player's face fully visible/unshadowed, which is also a source-doc rule violation (anonymous/faces-in-shadow), not yet raised for a fix.

## 6. User review round 1 — verdict: "near perfect," two follow-up requests

The user watched `v1-full.mp4` end to end and confirmed everything else (VO, captions, watermark, title cards, pacing structure) is correct. Two things came out of that review, handled in §7 and §9 below:
1. Four specific stills needed regeneration to show baked-in scoreline text (S09, S14, S24, S26).
2. A perceived caption-position inconsistency, which turned out not to be a real issue (§8).

## 7. Scoreline image swap — S09, S14, S24, S26

User asked for a list of every scene where the VO/overlay references an actual match score together with a country name, to decide which stills needed a scoreline baked in. Identified: **S09** (Colombia 1–0 Ghana), **S26** (Switzerland win, 4–3) as exact matches, plus **S14** (xG stat line) and **S24** ("three–three", no country name in that specific VO line) as score-adjacent candidates. User supplied all 4 as new images.

New assets provided in `temp/One Match Short/new/` (all confirmed present, all with the scoreline text baked directly into the image, top-third placement — same "finished graphic" pattern as the S03/S34 title cards):

| Still | Scene | New asset_id | Baked text |
|---|---|---|---|
| `S09-A.jpg` | S09 | `0ec7b123-eb14-40cc-88bc-b50a77afca62` | COLOMBIA 1–0 GHANA |
| `S14-A.jpg` | S14 | `937e474b-cf6a-41f1-94b7-49a24ab41e4e` | COLOMBIA: 1.03 XG. SWITZERLAND: 0.35 |
| `S24-A.jpg` | S24 | `5fbe0f03-dd85-470b-af02-a832262087cf` | 3–3 |
| `S26-A.jpg` | S26 | `e61c2dcc-64f7-4cf5-9ca4-e49b1fce172f` | SWITZERLAND 4–3 COLOMBIA |

Old versions backed up (not deleted) to `content/longform/one-match-short/stills/replaced_v1/` before overwriting. Verified via a single-scene test render (S09) that the baked-in top-third scoreline text and the bottom-third running VO caption don't collide. Full 35-scene re-render: **`content/longform/one-match-short/output/v2-scoreline-images.mp4`** — 378.2s (6:18, same runtime as v1), 90.4MB, 0 render errors.

## 8. Caption vertical-position investigation — not a bug, no change made

User flagged (with a screenshot, `temp/One Match Short/v1-full-mp4-07-18-2026_12_08_PM.png`) that some running-caption lines with player names (e.g. "AND DAVINSON SÁNCHEZ —") looked positioned lower/"bottomed" compared to other caption lines. Investigated by:
1. Reading the renderer (`apps/video/src/longform/motion.js`) — `CAPTION_Y = 'h*0.80'` is a single hardcoded constant applied identically to every caption word in every scene, no per-content variation in the code.
2. Pixel-measuring the actual rendered frames from two different scenes (S09 and S20/Sánchez) via a color-match script — both captions' top edge starts at exactly row 864 of 1080px (`1080 × 0.80`), byte-identical.

**Conclusion: not a real inconsistency** — every caption in the video sits at the exact same anchor point. The perceived difference is most likely an optical effect of that particular shot's composition (goalpost framing, subject distance) or the accented "Á" reading as visually taller. **No code was changed** — matches the user's explicit preference to leave it alone unless it was a confirmed bug.

## 9. Silent-tail pacing fix — S12's 8s gap down to 6.5s, whole video 6:18 → 5:17

User separately noticed several scenes hold the still for 4–6+ seconds after the VO narration ends (measured: worst case S12 planned 12s vs VO 4.00s = **8.0s of dead air**; 16 of 33 real scenes had gaps over 3s). Discussed four options; user picked **capping the silent tail** (bounding the gap, not full shrink-to-fit) at 2.5s, after confirming with them that:
- The gap is not a technical/pipeline risk either way (doesn't affect sync, captions, or concat) — purely a pacing/retention judgment call.
- Ken Burns motion filters (`motion.js`'s `buildMotionFilter`) express push/pull/smash as `t/T` (proportional to final clip duration, not a fixed absolute time), so shrinking a scene's duration doesn't truncate an in-progress zoom — it just completes the same curve faster. Confirmed safe to shrink before implementing.

**Implementation** (opt-in only, so `son-also-saves` and project 29 keep rendering byte-identical unless a caller explicitly opts in):
- `apps/video/src/longform/render.js` — `buildStillsScene` gained a `maxSilentTail` option (default `null` = old `Math.max(plannedDur, voDur+0.4)`-only behavior, unchanged). When set, a scene with more slack than the cap gets tightened to `voDur + maxSilentTail` instead of holding the full scripted `plannedDur`.
- `apps/video/scripts/longform/assemble-local.mjs` — new `--max-silent-tail <seconds>` CLI flag, threaded through to the render call.

Verified via a single-scene test (S12: `12s → 6.50s`, logged as `[tighten]`) before running the full render. Full re-render with `--max-silent-tail 2.5`: **`content/longform/one-match-short/output/v3-tightened-pacing.mp4`** — **317.5s (5:17)**, 79.1MB, 0 render errors. 26 of 33 scenes got tightened (see the render log in this session for the exact per-scene before/after); S05/S08/S29/S35 untouched (VO already ran long, stretch path unaffected).

## 10. What's left

- **User watch-through of `v3-tightened-pacing.mp4` end to end** — this is the current candidate-final cut and has not yet been watched as a whole. Everything in this log is either a targeted fix verified in isolation or a carried-over spot-check from earlier versions — not a substitute for a full watch of v3 specifically.
- **Resolve the S23 crest issue** (§5) — still open, unchanged since v1.
- **New: S26's replacement image shows an unshadowed Swiss player face** (§5) — flagged during this session, not yet raised as a fix request.
- **Audio mix** (music bed, SFX cues like the crossbar "clang" echo between S13/S20) — not touched; `assemble-local.mjs` only does VO + Ken Burns + captions, no music layer.
- **Final loudness/LUFS pass** — not done.
- **Runtime**: now 5:17 (was 6:18 in v1, source doc's aspirational target was 8–9 min) — the tightening in §9 was an explicit, deliberate pacing choice, not drift; flagging only so it isn't mistaken for an unintentional shrink if revisited later.
- **Output versions kept for comparison, oldest to newest:** `v1-full.mp4` (original), `v2-scoreline-images.mp4` (+ 4 new stills, same runtime), `v3-tightened-pacing.mp4` (+ silent-tail cap, current candidate-final). None have been deleted.

## 11. SEO + thumbnail (later session — prepping for upload alongside 4 other channel videos)

- SEO package (YouTube title/description/timestamps/hashtags + Facebook caption) written to `content/longform/SEO-PACKAGES.md`, using the newly-installed `youtube-seo` and `caption-writer-sms` skills.
- **Thumbnail:** this project already had two finished thumbnail variants from earlier work (`stills/thumbnails/thumb-a-short.jpg`, `thumb-b-4-3.jpg`) — no new generation needed. Picked `thumb-b-4-3.jpg` (the "4–3 SHOOTOUT" version) as the stronger of the two — a score number plus a hook word beats a single word for curiosity-gap pull. Copied to `thumbnail.jpg` at the project root for consistency with the other 4 channel videos' naming.
- The §5/§10 open items (S23 crest, S26 unshadowed face) are still unresolved — not touched during this SEO/thumbnail pass.
