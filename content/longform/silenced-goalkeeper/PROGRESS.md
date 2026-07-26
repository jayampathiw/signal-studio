# "Silenced: The Night a Goalkeeper Sent Germany Home" — Production Log

The Underdog Archive, Video #1. File-based long-form project (no Supabase/`content_clips`), built with the same stills + Ken Burns pipeline as `son-also-saves` (project 30) / `one-match-short` (project 3). If picking this up cold: read this whole file, then those two projects' `PROGRESS.md` for the underlying pipeline mechanics (this project reuses them unchanged, plus one project-specific fix — §3).

---

## 1. Source material and a scope decision

Everything came from `temp/Silenced The Night a Goalkeeper Sent Germany Home/`:
- `SHOT_LIST_v2_..._Updated.md` — a 51-scene shot list for Paraguay vs Germany (Round of 32, Gillette Stadium, June 29 2026 — Paraguay win 4–3 on penalties after 1–1).
- `New Text Document.txt` — Scene ID → generated-image-description mapping.
- `images/` — 52 generated still files (51 scenes' worth + 1 spare/alternate).

**Important flag, resolved with the user before building anything:** the shot list's own header says this is *"a reference document, not a re-production order... Video #1 is live and published... nothing here should trigger a re-render."* The doc frames itself as a retroactive conversion of an already-published (old Higgsfield-video-clip-era) video into the current shot-list format, for documentation consistency only. Despite that, the user explicitly asked to build it as a new stills-pipeline production — confirmed via `AskUserQuestion` ("Build it anyway") before proceeding, since 51 ready-to-use generated stills existed and the intent was clearly to produce a real video, not just archive the doc.

## 2. Asset mapping — filenames don't always match content

The scene→image mapping doc's filenames are close-but-imprecise matches to actual file names (many truncated with a literal `…` character). Two apparent duplicates (`Goalkeeper_in_empty_stadium`, `Monochrome_goalkeeper_action_his…`) turned out on inspection to actually be: a **second, distinct SILENCED title-card image** (used for the different S3/S50 intro/outro treatments — one wide-stadium, one close/intimate for the fade) and a spare alternate 3-keeper-lineup shot (not needed, since `Goalkeeper_silhouettes_in_a_row` already covers S45). Resolved by opening and visually comparing the ambiguous files rather than trusting filenames — worth doing again if a future project's mapping doc looks similarly imprecise.

Final mapping: all 51 scenes → `stills/S01-A.jpg` through `S51-A.jpg`. S3 and S50 use the two distinct title-card images (both have "SILENCED" baked into the art).

## 3. Shotlist port + one pipeline extension

Ported into `shotlist-v2.md` (parser-syntax) — 51 scenes, 6 acts, durations summing exactly to 543s (9:03), matching the source doc's own timecodes verbatim. VO carried over unchanged (per the source doc's own note that it was already fact-checked/published). Voice: Kokoro `am_adam` (established Underdog Archive default).

**Real bug found and fixed during QC, before calling this final:** Scene 51 (the end-screen) already has the full outro sentence *and* a "Subscribe" button baked into the still image itself — but S51 has real VO, so the running-caption system was auto-generating and overlaying a duplicate caption on top of that pre-baked text, making both unreadable. Fixed by adding a `NO_CAPTION_SCENES_BY_PROJECT` map to `apps/video/scripts/longform/assemble-local.mjs` (keyed by project directory name, not a flat scene-number set — so numbers don't collide across projects), suppressing captions on `silenced-goalkeeper` scene 51 specifically. Verified via isolated re-render + frame check before the full re-render.

## 4. Render history

- `output/v1-full.mp4` — first full 51-scene render. 543.16s, 0 render errors. Has the S51 double-caption bug, and (unknown at the time) the S26/S33 bad-asset problem from §5.
- `output/v2-s51-fix.mp4` — S51 caption fix applied. 543.16s, 117.5MB, 0 render errors. Still has the S26/S33 bad-asset problem, found later during thumbnail work (§5).
- `output/v3-s26-s33-fix.mp4` — S26 and S33 swapped for real, user-generated, style-compliant replacements (see §5 for the fix and the prompts used). Full 1–51 re-render, verified via isolated single-scene test renders of S26 and S33 before the full pass. 543.16s (9:03), 116.3MB, 0 render errors.
- `output/v4-s51-static.mp4` — **current final, upload-ready.** S51 (end screen) motion changed from `HOLD` to a new `STATIC` mode (see §5.1) so the full end-screen composition renders with no crop. Built by splicing rather than a full 51-scene re-render: `v3`'s first 531.00s (everything before S51) re-encoded/trimmed, concatenated with a freshly rendered S51 clip. 543.20s, 116.6MB. Spot-checked the splice point (clean, no glitch/duplicate frame) and the new S51 frame (full image visible, no crop).

## 5. Bad-asset QC issue — found during thumbnail work, now fixed

### 5.1 Pipeline fix: new `STATIC` motion mode (no crop/no zoom)

While preparing S51 for upload, found that this pipeline's Ken Burns engine (`apps/video/src/longform/motion.js`) pre-scales every still by 1.5× overscan and then center-crops back down to frame size — **even for `HOLD`**, which permanently discards the outer ~33% of every still (width and height) regardless of motion type. Harmless for most shots (subject is usually centered), but S51's end-screen composition has content spanning the full frame edge-to-edge (subscribe button bottom-left, next-video box far right) — HOLD was silently cropping both out.

Added a new `static` motion type (`motion.js` + recognized in `parse-shotlist-v2.js` via `STATIC`/`no zoom`/`no-zoom` in the shotlist's `🎞️` line) that skips the overscan/crop entirely and does a plain fit-to-frame scale — shows 100% of the source still, letterboxing only if the still's aspect ratio doesn't already match 16:9 (S51's didn't need it — exact match). Scoped to this one scene via the shotlist edit; every other scene in every project keeps the existing HOLD/PUSH/PULL/etc. behavior unchanged. Worth remembering for any future end-screen or full-bleed-layout still on this pipeline.

### 5.2 Real/uncredited photo assets (S26, S33)

**S26 was not a usable asset.** While picking a thumbnail source image (see §6), S26 (`stills/S26-A.jpg` — meant to be "Orlando Gill at full stretch, palming a save away") turned out on inspection to be an actual, real/uncredited match photograph — visible sponsor branding, a real club crest, and a red/black kit that doesn't even match Paraguay's red/white stripes. This slipped through the original full-render QC pass undetected (that pass spot-checked S9, S37, S39, S45, S51 — not S26).

**S33 had the same problem.** `stills/S33-A.jpg` (S33's actual video scene: "Havertz steps up. And Gill guesses right. Saved.") was a real match photo — visible real jersey number ("7"), real sponsor branding ("Orlando Health"), real ball design.

Two bad assets got through the original full-render QC pass undetected — that pass only spot-checked 5 of 51 scenes. **A full visual pass over the remaining 46 unchecked stills is still recommended** before treating this video as fully final; there may be more.

**Fix applied.** Wrote detailed replacement prompts for both scenes (full [STYLE] block + explicit "no real crests/logos/branding, not a real photograph" language, since that's exactly what broke last time) and handed them to the user to generate externally. User returned 2 clean images (`temp/download (3)/Goalkeeper_making_save_stadium_...jpeg` for S26, `temp/download (3)/Goalkeeper_saving_penalty_kick_...jpeg` for S33) — both visually verified anonymous/unbranded before use. Old bad assets backed up to `stills/replaced_bad_assets/` (not deleted). New assets copied in as `S26-A.jpg`/`S33-A.jpg`, verified via isolated single-scene test renders (both clean — anonymous navy kit, no crests, captions/watermark correct, no double-text), then the full project was re-rendered — see §4, `v3-s26-s33-fix.mp4`.

### 5.3 Full sweep (Shorts image-validation pass, 2026-07-24) — found 8 more real photos

The "full visual pass" §5.2 called out as still-outstanding was run as part of building 9:16 Shorts (see `content/shorts/`, `docs/shorts-916-implementation-plan.md`). Reviewed the specific scenes selected for the first 3 Shorts videos (10 stills from this project) and found **S27, S28, S29, S30, S39 are the same class of bug as S26/S33** — real, legible venue/league branding ("Gillette Stadium", a real Premier League referee-badge patch, real "GER" crest + adidas logo) rather than the anonymous stylized generation the shot list called for. 3 more of the same kind were found in `same-coin` (S12, S13, S18) — not this project, noted here for the pattern. The remaining ~40 stills in this project outside the Shorts-selected set are still unswept.

**S39, S27, S28, S29, S30 all fixed** (2026-07-24): replaced with the approved images from `temp/new asserts/` (mapping in its `New Text Document.txt`) — all anonymous, no real stadium/league/crest branding. Old assets backed up to `stills/replaced_bad_assets/S{n}-A-realphoto-badcrest.jpg` for each. That's every scene used across all 3 Silenced Shorts (S1: 37,38,39 · S2: 27,28,29,30 · S3: 44,45,46) now compliance-checked. The remaining ~40 stills outside the Shorts-selected set are still unswept — still true that a full pass hasn't happened.

**S45 vertical exception:** Scene 45 (the 3-keepers-in-a-row lineage shot) has no workable 9:16 crop of its 16:9 original — a purpose-built vertical replacement (`Goalkeeper_lineage_vertical_comp…_202607241324.jpeg`, native 768×1376, figures stacked vertically instead of side-by-side) lives at `content/shorts/silenced/vertical-assets/S45-A-vertical.jpg` and is used **only** by the Short via `still_override` — the long-form video's own `stills/S45-A.jpg` (16:9) is untouched.

## 6. SEO + thumbnail (today's session)

- Full SEO package (YouTube title/description/timestamps/hashtags + Facebook caption) written to `content/longform/SEO-PACKAGES.md`, using the `youtube-seo` and `caption-writer-sms` skills (newly installed this session, see memory).
- **Thumbnail:** `thumbnail.jpg` (1280x720). Higgsfield balance was 30.25 credits — below the credit-guard's 50-credit safety floor — so no new AI generation was done; built from an existing still via FFmpeg crop + Bebas Neue drawtext instead (zero cost). First candidate (S26) was rejected for the reason in §5 above (also had a second candidate rejected for double-text clutter against its own baked-in scoreline). Final pick: **S02** (the solitary goalkeeper silhouette in the empty stadium).
- **Revision 1 (same session):** user reviewed all 5 channel thumbnails and flagged that single-word/score-only text with lots of empty space wasn't attractive or informative enough. Redesigned to a two-tier layout matching `one-match-short`'s existing "4–3 / SHOOTOUT" pattern: large score (`4-3`) + smaller tracked-letter hook line (`GERMANY OUT`) underneath, plus aggressive zoom/crop on S02. Still failed the mobile-scale check (see Revision 2).
- **Revision 2 (same session) — actual mobile-scale validation.** User separately flagged the thumbnail looked hard to read on small phone screens. Rather than guess, ran the `youtube-thumbnail-design` skill's own "120px test" — downscaled each of the 5 thumbnails to 120px wide and inspected them directly. Confirmed empirically: **Silenced was the only one that failed** (goalkeeper reduced to an invisible dark speck against empty stadium — S02 is inherently a wide isolation shot, not fixable by cropping alone, since the subject is already near-black against a barely-lit pitch). The other 4 videos' thumbnails passed on inspection.
  - **Root fix:** swapped the source still from S02 to **S46** (`Orlando Gill: The 21 Shots` — a converging-defenders action shot with the goalkeeper front-and-center, well-lit orange kit, high subject-to-frame ratio; this still already had its own baked-in title text, cropped out via `crop=1280:720:(in_w-1280)/2:203` before applying our own two-tier text, avoiding a double-text collision). Re-ran the 120px test on the result — passes clearly now, face/kit/converging figures and text all legible at mobile scroll size.
  - Also checked S33 as a candidate first and rejected it — same class of problem as S26 (§5): a real, uncredited match photo (visible real jersey number, real sponsor branding, real ball) rather than a generated/stylized asset. Not used anywhere.

## 7. What's left

- **Full visual QC pass over all 51 stills** — only spot-checked during the original render (plus S26/S33 individually since fixed); two bad assets getting through shows spot-checking alone isn't sufficient. Worth a complete pass before publishing.
- **Audio mix** (music bed/SFX) and **final LUFS pass** — untouched, same gap as every other project in this channel.

## 8. YouTube upload (this session)

First video uploaded to the live channel. Full walkthrough followed the general playbook (title/description/thumbnail from `SEO-PACKAGES.md`, general channel settings, per-video settings) — worth noting here only the things that deviated from the plan or are specific to this upload:

- **File uploaded:** `output/v4-s51-static.mp4` (renamed locally to `Paraguay-Beat-Germany-on-Penalties-SILENCED.mp4` before upload, per the filename-as-metadata practice). **Video link:** `https://youtu.be/a-GwxmJEWTE`.
- **Playlist created:** "Underdog Archive" (new — this is the channel's first playlist). Set to Public visibility, sort order **Date published (oldest)** so new viewers watch the catalog in release order starting with this video (Video #1).
- **One-time phone verification** was required mid-upload to unlock advanced features (custom thumbnail, etc.) — completed, unblocked the rest of the flow.
- **No monetization/ad-suitability screens appeared** — the channel isn't yet accepted into the YouTube Partner Program, so those steps in the general playbook don't apply yet. Nothing to configure; revisit once the channel is monetized.
- **AI-use disclosure:** answered **Yes** (the video is AI-narrated/AI-stills depicting a real match).
- **Category** changed from YouTube's "People & Blogs" default to **Sports**.
- **End screen — had to deviate from the plan.** The playbook called for a "watch next video" element, but since this is the *first* video on the channel, there's no second video yet to link to. Used a **Subscribe-only end screen** instead (added the "1 video, 1 subscribe" template, then deleted the video element, keeping only Subscribe). **Revisit this after the second video goes live** — swap in a real "watch next" element pointing at it.
- **Known cosmetic gap, not fixed:** the Subscribe element doesn't sit pixel-perfectly over the circular shape baked into the S51 still (which was designed with a dedicated circle for exactly this purpose) — YouTube's end-screen editor has a UI quirk where the video player's control bar overlaps the bottom of the preview and blocks dragging elements there. Tried keyboard-nudge and browser-zoom workarounds; element still wouldn't move. Deliberately left as-is (minor, doesn't affect function) rather than block the upload on it.
- **Player showed 8:54 instead of the expected 9:03 (543s)** during the upload flow — flagged as worth a post-publish sanity check (watch the full duration once live) in case anything got truncated, though this is very likely just the Studio UI showing pre-final-processing duration, not an actual truncation.
- **Subtitles:** left as YouTube's auto-generated English captions (no manual upload).
- **Saved as Private** after the Checks screen passed with no copyright issues — sitting in the required 2-hour-minimum buffer before the full rewatch + scheduling.

## 9. What's left (updated)

- **Rewatch `v4-s51-static.mp4` in full** once the 2-hour processing buffer has passed — check chapters line up, confirm no truncation (see the 8:54 vs 9:03 note above), then move from Private to Scheduled/Public.
- **Swap the end screen** to point at the second video once it's uploaded.
- Everything from §7 (full 51-still QC pass, audio mix/LUFS) still applies.
