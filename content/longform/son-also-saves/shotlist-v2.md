# SHOT LIST v2 (IMAGE-FIRST) — "The Son Also Saves | Egypt's Impossible Night"
### The Underdog Archive — Video #30 · Stills + Ken Burns pipeline

**TITLE:** The Son Also Saves | Egypt's Impossible Night
**TARGET_DURATION_SEC:** 545
**PIPELINE:** Every scene is built from 1–3 generated STILL IMAGES animated in the editor (Ken Burns push/pull, 2.5D parallax, smash cuts). Video generation is used for ZERO scenes. Rebuilt from the earlier Grok-video-clip test cut — that cut and its assets (`temp/grok-assets (1)/`, `content/longform/son-also-saves/edl.json`) are superseded and left untouched.
**ASSET COUNT:** ~41 generated stills across 39 generated scenes. Scenes 5, 13, 17, 39, 40 are editor builds. Scene 34 is an asset reuse (regrade of Scene 11). 7 kit-reference sheets generated separately.
**TEXT OVERLAY ENGINE:** FFmpeg `drawtext`, rendered by `apps/video/src/longform/motion.js` + `apps/video/src/longform/render.js` — matching how the rest of this pipeline (project 29) already works. No Remotion involved.

---

## SECTION A — MASTER CONSISTENCY BIBLE

**Layer 1 — Reference Elements (do this FIRST, before any bulk generation):**
1. Generate ONE "kit reference sheet" image per token below (single anonymous figure, front view, neutral pose, full kit visible, plain dark background).
2. Approve it manually against the spec.
3. Save each approved image to `content/longform/son-also-saves/stills/refs/` with the exact @tag shown.
4. Embed the matching @tag(s) in every scene prompt.

**@egygk** — Egypt goalkeeper (Shobeir figure): deep amber-gold long-sleeved goalkeeper jersey (solid amber-gold, no patterns, no logos, no numbers), plain black goalkeeper shorts, black socks, pale grey goalkeeper gloves. Face ALWAYS in deep shadow — no facial features ever visible.

**@egyout** — Egypt outfield: solid red short-sleeved football jersey (pure red, no patterns, no badges, no numbers), plain black shorts, black socks.

**@argout** — Argentina outfield: sky-blue and white vertical stripes jersey (equal width, full length, no badges, no numbers), plain black shorts, black socks.

**@arggk** — Argentina goalkeeper: dark forest-green long-sleeved goalkeeper jersey (solid, no logos), plain black shorts, plain black gloves.

**@gk90s** — 1990s Egyptian keeper (Ahmed Shobeir era): boxy oversized 1990s-cut jersey, navy-blue base with large rust-orange angular geometric block shapes, plain black shorts, chunky cream-white gloves.

**@ball** — classic white match football, dark navy pentagonal panels, thin amber ring detail.

**@stadium** — vast modern two-tier concrete stadium at night, half-empty stands, white floodlight banks with haze, zero signage.

**[STYLE]** — Cinematic film still, 35mm lens, shallow depth of field, slight film grain, desaturated moody grade with deep navy-teal shadows and warm amber highlights, low-key dramatic lighting, anonymous stylized figures, 16:9.

**Kit decision rationale:** NOT the literal match kits. Egypt in red for warmth/legibility/brand alignment. Argentina in sky-blue/white stripes, close to real, reads cool/antagonist. Kit color is the ONLY team identifier — never varies.

---

## SECTION B — MOTION LANGUAGE (editor-side)

- **PUSH:** 1.00→1.08–1.15, Bézier ease. Default move.
- **PULL:** 1.15→1.00. Contextual reveals.
- **SMASH:** 1.00→1.30 in ~1.5s on a low-freq hit. Goals/shocks only.
- **PARALLAX:** subject on alpha layer, background pans 30% slower. Hero shots only.
- **PATTERN INTERRUPT RULE (strictly enforced):** any scene ≥10s must have at minimum ONE of: a second still (A/B cut), a Tier 1 hero card, a Tier 2 word-sync accent, or a hard SFX hit. A scene with NONE of these and a duration ≥10s is a production defect.
- **Atmosphere:** continuous particle/grain pass over all scenes.
- **Audio:** -14 LUFS master; VO -12 to -15 dB; music -22 to -25 dB.

---

## SECTION C — COLOUR GRADE SYSTEM

**WARM (default):** Egypt protagonist scenes. **COLD:** Argentina scoring/antagonist energy. **MONOCHROME:** maximum tension. **MOURNFUL:** aftermath, reflection.

**Grade transition map:** WARM 0:00–5:24 → COLD creeping 5:24–5:37 → COLD dominant 5:38–5:49 → MONOCHROME 5:50–6:09 → COLD 6:10–6:42 → MONOCHROME peaks 6:28–6:42 → COLD→MOURNFUL 6:43–6:54 → MOURNFUL WARM 6:55–8:45.

---

## SECTION D — TEXT OVERLAY SYSTEM (FFmpeg drawtext implementation)
### TWO TIERS. Rendered entirely by `apps/video/src/longform/motion.js`'s `buildDrawtext()` — never generated inside images.

Every image prompt reserves visual breathing room for text (a described negative-space zone per scene below), but final on-screen placement is resolved automatically from that description via `apps/video/src/longform/placement.js`, with a manual review pass against the actual rendered stills before final render (see production notes).

---

### TIER 1 — HERO CARDS

Used for: stats, scorelines, chapter labels, the emotional-peak reveals. Parsed from `📝 TIER 1 at H:MM: **CARD TEXT** — amber "WORD", <placement>. <N>s.` lines.

**Typeface:** Bebas Neue, all caps, wide tracking.
**Colors:** `#f2ece1` cream-white body. `#e8a559` amber for ONE emphasis word/phrase (rendered as a separately-colored, precisely-measured `drawtext` segment — see `text-metrics.js`).
**Size:** minimum 80px.
**Background:** semi-transparent navy `#16243a` at 60% opacity where legibility requires it.
**Animation:** opacity 0→1 over 0.4s.
**Duration:** 2–5s depending on card weight (see each line's trailing `Ns.`).
**Rule:** VO line before sets it up, never reads it aloud. VO line after never repeats it.

---

### TIER 2 — WORD-SYNC ACCENTS

Used for: a single word or very short phrase, punched into the frame at the instant it's spoken in the VO. Parsed from `🔤 TIER 2 at H:MM: **WORD(S)** — <placement>. holds ~<N>s.` lines. The `at H:MM` value is a script-time estimate only — real timing comes from Whisper word-level alignment against the synthesized VO (see `resync-tier2.mjs`) and overrides it before final render.

**Typeface:** Bebas Neue, all caps.
**Colors:** `#e8a559` amber by default; falls back to `#f2ece1` cream if amber would vanish against a bright/warm background (per-scene override, not automatic).
**Size:** 50–65px.
**Background:** none by default (relies on existing negative space).
**Animation:** fast alpha fade in (0→1 over 0.2s), hold, fade out (1→0 over 0.2s) — the closest fidelity FFmpeg `drawtext` supports to the intended scale-punch (drawtext cannot animate font size per frame; this is a deliberate, documented fidelity trade-off from the original scale 0.9→1.0 spec).
**Placement:** wherever the specific still's negative space actually is — resolved from the per-scene placement description, never a fixed grid position.
**Rule:** never repeats a fact a Tier 1 card in the same scene already shows.

---

## Per-scene format:
🖼️ STILL(s) — image prompt(s) for still generation
🎞️ MOTION — editor-side Ken Burns / parallax instruction
🎙️ VO — continuous narration
🔊 AUDIO — sound design cue
📝 TIER 1 — hero card
🔤 TIER 2 — word-sync accent

---

## COLD OPEN — (0:00–0:59)

**SCENE 1 — 0:00–0:06 (6s)** · WARM grade
🖼️ STILL A: @egygk Extreme close-up of a goalkeeper's pale-grey gloves held open in front of him, fingers spread wide. No face visible. Deep amber-gold jersey cuffs visible. Warm amber floodlight halo behind the gloves. Deep shadow filling the rest of the frame, generous dark negative space surrounding the gloves on all sides, especially lower-right. Cinematic film still, 35mm macro lens, very shallow depth of field, slight film grain, desaturated moody grade with deep navy-teal shadows and warm amber highlights, dramatic low-key lighting, 16:9.
🎞️ PUSH 1.00 → 1.10 over 12s into the gloves.
🎙️ "Imagine you are twenty-six years old."
🔊 A single low heartbeat.
🔤 TIER 2 at 0:08: **26** — small, lower-right dark void beside the gloves. holds ~0.8s.

**SCENE 2 — 0:12–0:27 (15s)** · WARM grade
🖼️ STILL A: @egygk @stadium Vast modern two-tier concrete stadium at night, half-empty stands, floodlight haze, zero signage. The goalkeeper stands tiny in the goalmouth at the far end, pitch-level view. Generous negative space in the upper sky/stand area above him. Cinematic film still, 35mm lens, shallow depth of field, slight film grain, desaturated moody grade, anonymous figure, 16:9.
🖼️ STILL B: @egygk Waist-up shot from behind the same goalkeeper, turned slightly away, face in complete shadow. Out of focus stadium interior beyond, floodlight haze, half-empty stands. Dark space above and to one side. Cinematic film still, 35mm lens, shallow depth of field, slight film grain, desaturated moody grade, anonymous figure, 16:9.
🎞️ A: PUSH 1.00 → 1.08 (0:12–0:20). Cut to B on "never heard of" (0:20–0:27).
🎙️ "The reigning world champions are bearing down on you. Their captain — the greatest scorer in World Cup history — is standing eleven metres away. And your country, one hundred and twenty million people, has never been here before."
🔊 Low rising stadium hum.
🔤 TIER 2 at 0:14: **TENS OF THOUSANDS WATCHING** — upper sky area above the stands. holds ~1.2s.

**SCENE 3 — 0:27–0:40 (13s)** · WARM grade
🖼️ STILL A: @egygk @argout @ball Side-on shot at penalty area level. The goalkeeper crouching on his goal line, a lone Argentina figure blurred behind at the penalty spot. Face in complete shadow. Dark negative space to the right of frame. Cinematic film still, 35mm lens, shallow depth of field, slight film grain, desaturated moody grade, anonymous figures, 16:9.
🎞️ PUSH 1.00 → 1.10.
🎙️ "Egypt had never won a World Cup match before this tournament. They had never reached a knockout round. They were not supposed to be here."
📝 TIER 1 at 0:32: **EGYPT'S FIRST EVER WORLD CUP WIN: 2026** — amber "FIRST EVER", bottom third, clear of both figures. 4s.

**SCENE 4 — 0:40–0:55 (15s)** · WARM grade
🖼️ STILL A: @egygk Extreme close-up of a goalkeeper's eyes — the only part of his face visible beneath his gloves held to his brow. Amber jersey collar visible at frame bottom. Eyes in intense focus, straight into camera. Dark negative space in the lower-right of frame, beneath and beside the eyes. Cinematic film still, 35mm macro lens, very shallow depth of field, slight film grain, desaturated moody grade, 16:9.
🎞️ Very slow PUSH 1.00 → 1.08 over 15s.
🎙️ "But Mostafa Shobeir had been preparing for this exact moment his entire life. Not because of anything he had done. Because of what his father had done — thirty-six years before he was born."
🔤 TIER 2 at 0:44: **MOSTAFA SHOBEIR** — lower-right dark void below the eyes. holds ~1.4s.

**SCENE 5 — 0:55–0:59 (4s)** · EDITOR BUILD — NO GENERATION
📝 TIER 1 at 0:55: **THE SON ALSO SAVES** — full screen title card, letter-track fade-in, hold, cut to black. 4s.

---

## ACT 1 — THE FATHER (1:00–2:30)

**SCENE 6 — 1:00–1:13 (13s)** · WARM grade
🖼️ STILL A: Stylized map of North Africa and the Middle East on dark slate. Egypt at center-left, faintly amber. Nile as a thin rust line. No text labels. Generous dark negative space to the right, over open ocean. Cinematic film still, 35mm lens, slight film grain, desaturated moody grade, 16:9.
🖼️ STILL B: Same map, tighter crop on Egypt, amber glow intensifies, all else unlit. Dark negative space to the left. Cinematic film still, 35mm, slight film grain, desaturated moody grade, 16:9.
🎞️ A: PUSH toward Egypt (1:00–1:06). Cut to B on "three thousand years" (1:06–1:13).
🎙️ "Egypt is a country of one hundred and twenty million people. It is one of the oldest civilisations on earth. It has given the world the pyramids, and the Sphinx, and three thousand years of recorded history."
📝 TIER 1 at 1:03: **120 MILLION PEOPLE** — amber "120 MILLION", right of the map, over the dark ocean space. 3s.

**SCENE 7 — 1:13–1:26 (13s)** · COLD grade (vintage historical)
🖼️ STILL A: @gk90s A lone goalkeeper silhouette crouching on a goal line, side view, dramatic chiaroscuro. Heavy vintage film grain. Generous dark negative space in the upper portion of the frame, above the crouched figure. Cinematic film still, 35mm lens, shallow depth of field, heavy vintage grain, cold desaturated grade, anonymous figure, 16:9.
🎞️ Slow PUSH 1.00 → 1.10.
🎙️ "And yet for most of its footballing history, Egypt had been invisible on the world stage. Until nineteen ninety. Until a goalkeeper named Ahmed Shobeir walked onto the pitch in Italy — and made the world notice."
🔤 TIER 2 at 1:19: **AHMED SHOBEIR** — upper region above the crouched figure. holds ~1.3s.

**SCENE 8 — 1:26–1:39 (13s)** · COLD grade (vintage historical)
🖼️ STILL A: @gk90s @ball Vintage-era back-pass moment — the goalkeeper receiving the ball at his feet, teammate in dark kit having just played it back. Cold flat vintage lighting, heavy grain. Dark negative space to the left. Cinematic film still, 35mm, heavy vintage grain, cold desaturated grade, anonymous figures, 16:9.
🖼️ STILL B: @gk90s The same goalkeeper standing upright, holding the ball at chest height. Cold vintage grade. Dark negative space above and to the right. Cinematic film still, 35mm, heavy vintage grain, cold desaturated grade, anonymous figure, 16:9.
🎞️ A holds (1:26–1:32). Cut to B on "clean sheet" (1:32–1:39).
🎙️ "Egypt's nineteen-ninety team was not expected to win. But Shobeir kept a clean sheet against Ireland — the only Egyptian goalkeeper ever to do so at a World Cup. He stopped everything. And then, when the final whistle blew, Egypt went home."
📝 TIER 1 at 1:33: **THE ONLY EGYPTIAN GK TO KEEP A WORLD CUP CLEAN SHEET** — amber "ONLY", right of frame, above the ball. 4s.

**SCENE 9 — 1:39–1:52 (13s)** · WARM grade
🖼️ STILL A: A quiet domestic interior. A framed photograph on a dark wall — an abstract goalkeeper silhouette. A child's silhouette below, looking up. Warm amber lamp light pools from off-screen. Dark negative space to the right of the photograph. Cinematic film still, 35mm lens, shallow depth of field, slight film grain, desaturated moody grade, 16:9.
🎞️ Very slow PUSH toward the photograph.
🎙️ "Ahmed Shobeir had a hundred and seven caps for Egypt. He became a legend. He became a television commentator. And he had a son."
📝 TIER 1 at 1:42: **107 CAPS FOR EGYPT** — amber "107", right of frame beside the photograph, in the dark wall space. 3s.

**SCENE 10 — 1:52–2:05 (13s)** · WARM grade
🖼️ STILL A: @egygk A young goalkeeper silhouette training alone at dusk on an empty pitch, low crouch before a dive. Long shadows, warm orange-gold horizon. Dark negative space to the left. Cinematic film still, 35mm lens, shallow depth of field, slight film grain, desaturated moody grade, anonymous figure, 16:9.
🖼️ STILL B: @egygk The same young goalkeeper mid-air, fully committed to a diving save, arms outstretched, dust and turf kicked up. Same dusk lighting. Dark negative space above him. Cinematic film still, 35mm lens, slight film grain, desaturated moody grade with warm amber dusk tones, anonymous figure, 16:9.
🎞️ A: PUSH (1:52–1:58). Cut to B on "his father's shadow" (1:58–2:05).
🎙️ "Mostafa Shobeir grew up with a father who had stood in a World Cup goal. He grew up at Al Ahly — Egypt's most decorated club — where his father had played his entire career. He grew up knowing exactly what it felt like to be in his father's shadow."
🔤 TIER 2 at 1:58: **HIS FATHER'S SHADOW** — upper-left above the diving figure. holds ~1.2s.

**SCENE 11 — 2:05–2:18 (13s)** · WARM grade
🖼️ STILL A: @gk90s @egygk Two goalkeeper figures side by side, equal height, facing away toward an empty goal in the distance. Left: 1990s kit. Right: amber-gold kit. Deep night sky above them — wide, empty, dark, the biggest open negative-space area in the whole video, directly above and between both figures. Cinematic film still, 35mm lens, slight film grain, desaturated moody grade, anonymous figures, 16:9.
🎞️ 2.5D PARALLAX: two figures on alpha layer, background pans 30% slower. PUSH 1.00 → 1.10.
🎙️ "Before this tournament, Mostafa had played just eight matches for the Egyptian national team. Eight. His father had played a hundred and seven. The comparison followed him everywhere."
📝 TIER 1 at 2:09: **8 CAPS BEFORE 2026** — amber "8", directly in the sky gap between the two figures. 4s.

**SCENE 12 — 2:18–2:30 (12s)** · WARM grade
🖼️ STILL A: @gk90s The vintage goalkeeper figure standing alone at an open gate or tunnel entrance, facing away, looking toward a brightly lit modern stadium far in the distance. He stands in shadow; the stadium glow is warm and distant. Large empty dark space fills the upper-right of the frame around the distant stadium glow. Cinematic film still, 35mm lens, shallow depth of field, slight film grain, desaturated moody grade with distant warm amber stadium light, anonymous figure, 16:9.
🎞️ Slow PUSH 1.00 → 1.08 toward the distant light.
🎙️ "But the father had one piece of advice. Always the same word. Before every club match. Before every World Cup game. Just one word. Enjoy."
🔤 TIER 2 at 2:29: **ENJOY** — far distant stadium-glow area, upper-right. holds ~1s.

---

## ACT 2 — THE RISE (2:30–4:00)

**SCENE 13 — 2:30–2:43 (13s)** · EDITOR GRAPHIC · WARM grade
🖼️ STILL A: Clean motion graphic on deep navy field. Timeline of Egypt's 2026 path — five amber dots on a thin rust line. Labels in white Bebas Neue: BELGIUM 1-1 / NEW ZEALAND W / IRAN 1-1 / AUSTRALIA (PEN) W / ARGENTINA. Wide negative space above the timeline. Cinematic film still, 35mm, slight film grain, deep navy-teal grade, 16:9.
🎞️ Editor animation — dots animate in sequence.
🎙️ "Egypt came into the twenty twenty-six World Cup having won just two of their previous seven matches at the tournament in their entire history. Two. In eighty years of trying."
📝 TIER 1 at 2:33: **2 WINS IN 80 YEARS** — amber "2", above the timeline dots. 4s.

**SCENE 14 — 2:43–2:56 (13s)** · WARM grade
🖼️ STILL A: @egygk @argout @ball Elevated behind-goal view. Argentina figure at the penalty spot with the ball. Goalkeeper crouching, ready. Both faces in shadow. Dark negative space to the left. Cinematic film still, 35mm lens, shallow depth of field, slight film grain, desaturated moody grade, anonymous figures, 16:9.
🎞️ PUSH 1.00 → 1.12 toward the penalty spot.
🎙️ "And then, in the group stage against Iran, Mostafa Shobeir saved a penalty from striker Mehdi Taremi. Egypt drew. They did not lose. They moved forward."
📝 TIER 1 at 2:49: **PENALTY SAVED** — amber "SAVED", left, above the penalty spot. 3s.

**SCENE 15 — 2:56–3:09 (13s)** · WARM grade
🖼️ STILL A: @egygk @ball A goalkeeper frozen horizontal in a full-extension diving save, glove palming the ball wide. Turf spray. Dark negative space to the right. Cinematic film still, 35mm lens, shallow depth of field, slight film grain, desaturated moody grade, anonymous figure, 16:9.
🖼️ STILL B: @egygk @egyout Celebration group embrace, keeper at the center, backlit, warm amber grade. Dark negative space to the left. Cinematic film still, 35mm lens, slight film grain, warm amber grade, anonymous figures, 16:9.
🎞️ A: SMASH 1.00 → 1.30 in 1.5s. Cut to B on "knockout-stage victory".
🎙️ "They beat Australia on penalties in the round of thirty-two — Egypt's first ever knockout-stage victory. One hundred and twenty million people watching. A nation that had waited for this their entire lives."
📝 TIER 1 at 3:01: **EGYPT'S FIRST EVER KNOCKOUT WIN** — amber "FIRST EVER", left, clear of the celebration group. 4s.

**SCENE 16 — 3:09–3:22 (13s)** · WARM grade
🖼️ STILL A: @egygk @egyout Wide stadium interior, red-jersey players scattered in quiet formation, amber-gold keeper at the center — the one figure whose kit stands apart. Dark negative space above and to the right. Cinematic film still, 35mm lens, slight film grain, warm amber and gold grade, anonymous figures, 16:9.
🎞️ Slow PULL 1.10 → 1.00 revealing the whole team.
🎙️ "And standing at the center of every one of those moments — the player who would not let them fall — was the goalkeeper with eight caps and his father's name."
🔤 TIER 2 at 3:20: **HIS FATHER'S NAME** — right, above the goalkeeper figure. holds ~1.2s.

---

## ACT 3 — THE MATCH (4:00–5:50)

**SCENE 17 — 4:00–4:10 (10s)** · EDITOR GRAPHIC · WARM grade
🖼️ STILL A: Two anonymous silhouettes face each other, one taller (Argentina, sky-blue stripes) on the left, one smaller (Egypt, red) on the right. Clean navy background. Text space between and below them.
🎞️ Editor graphic animates in.
🎙️ "On the seventh of July, two thousand and twenty-six, Egypt faced the defending world champions."
📝 TIER 1 at 4:02: **ARGENTINA vs EGYPT — ROUND OF 16** — bottom third, between the two silhouettes. 3s.

**SCENE 18 — 4:10–4:23 (13s)** · WARM grade
🖼️ STILL A: @stadium Wide exterior at night, crowds filing in, warm amber entrance lights. Dark negative space to the left. Cinematic film still, 35mm, slight film grain, desaturated moody grade, 16:9.
🖼️ STILL B: @stadium Interior from the stands, sea of warm indistinct figures, pitch glowing emerald below. Dark negative space above. Cinematic film still, 35mm, slight film grain, warm amber grade, 16:9.
🎞️ A holds (4:10–4:17). Cut to B on "eight matches" (4:17–4:23).
🎙️ "Argentina had won every World Cup match they had ever played against an African nation. Eight matches. Eight wins. No exceptions."
📝 TIER 1 at 4:15: **ARGENTINA vs AFRICA: 8 PLAYED, 8 WON** — left, over the dark sky. 4s.

**SCENE 19 — 4:23–4:36 (13s)** · WARM grade
🖼️ STILL A: @egyout @argout @ball Dense penalty-area crowd, red-jersey figure rising at the back post, ball in the air. Dark negative space to the left. Cinematic film still, 35mm, shallow depth of field, slight film grain, desaturated moody grade, anonymous figures, 16:9.
🖼️ STILL B: @egyout @argout @ball @arggk Header at exact contact, ball toward the far corner, forest-green keeper diving too late. Cinematic film still, 35mm, shallow depth of field, slight film grain, warm grade, anonymous figures, 16:9.
🎞️ A: PUSH (4:23–4:30). SMASH cut to B on the hit (4:30–4:36).
🎙️ "The fifteenth minute. Yasser Ibrahim climbs above the Argentina defence and heads it into the far corner. One–nil. Egypt lead the reigning world champions."
📝 TIER 1 at 4:30: **EGYPT 1 — ARGENTINA 0** — amber "1", left, clear of the aerial crowd. 4s.
🔊 Sharp musical hit on the goal.

**SCENE 20 — 4:36–4:49 (13s)** · MONOCHROME grade building
🖼️ STILL A: @ball Extreme close-up at grass level, ball resting on the penalty spot, keeper crouching blurred far behind. Near monochrome. Wide dark negative space above. Cinematic film still, 35mm macro, very shallow depth of field, slight film grain, near-monochrome grade, 16:9.
🖼️ STILL B: @egygk @argout @ball Side-on shot from the goal post, keeper crouching, Argentina figure at the spot. Both faces in shadow. Cold, tense. Wide dark negative space above. Cinematic film still, 35mm, shallow depth of field, slight film grain, near-monochrome grade, anonymous figures, 16:9.
🎞️ A: PUSH 1.00 → 1.08 (4:36–4:42). Cut to B on "Lionel Messi" (4:42–4:49).
🎙️ "And then Argentina win a penalty. And up steps the man with twenty goals in World Cup history. The most ever scored. Lionel Messi."
🔊 The stadium hum drops. Near silence under the VO.
🔤 TIER 2 at 4:44: **LIONEL MESSI** — upper void above the penalty spot. holds ~1s.

**SCENE 21 — 4:49–5:02 (13s)** · WARM grade blazing
🖼️ STILL A: @egygk @ball The goalkeeper frozen horizontal in a full-extension save, both gloves behind the ball. Enormous composition. Dark negative space to the right. Cinematic film still, 35mm lens, shallow depth of field, slight film grain, desaturated moody grade with blazing warm amber highlights, anonymous figure, 16:9.
🎞️ 2.5D PARALLAX. SMASH 1.00 → 1.30 on the hit.
🎙️ "Shobeir dives left. He reads it. He stops it."
📝 TIER 1 at 4:49: **MESSI'S PENALTY SAVED** — amber "SAVED", right, above the dive. 5s.
🔊 A single hard hit. Then crowd eruption.

**SCENE 22 — 5:02–5:12 (10s)** · WARM grade
🖼️ STILL A: Clean statistical graphic on deep navy field. Horizontal bar, four segments, two glowing amber. Wide negative space around the bar. Cinematic film still, 35mm, slight film grain, desaturated moody grade with amber graphic elements, 16:9.
🎞️ Slow PUSH on the graphic.
🎙️ "It was his second penalty save of the tournament. He had already stopped Iran's Taremi in the group stage."
📝 TIER 1 at 5:02: **2 OF 4 WC PENALTY SAVES: ALL SHOBEIR** — amber "2 OF 4", left, above the bar graphic. 4s.
🔤 TIER 2 at 5:08: **TAREMI** — small, beside the second amber segment. holds ~0.8s.

**SCENE 23 — 5:12–5:25 (13s)** · WARM grade
🖼️ STILL A: @egygk @argout @ball Goalkeeper palming a header over the bar. Warm grade. Dark negative space to the left. Cinematic film still, 35mm, shallow depth of field, slight film grain, warm amber grade, anonymous figures, 16:9.
🖼️ STILL B: @egygk @argout @ball Same goalkeeper diving low, deflecting a close-range effort around the post. Dark negative space to the right. Cinematic film still, 35mm, shallow depth of field, slight film grain, warm amber grade, anonymous figures, 16:9.
🖼️ STILL C: @egygk @egyout @stadium Half-time: keeper standing upright, red-jersey players calm around him. Dark negative space to the left. Cinematic film still, 35mm, slight film grain, warm amber grade, anonymous figures, 16:9.
🎞️ Hard cut A → B → C on the VO rhythm.
🎙️ "But Shobeir was not done. Mac Allister — headed away. Alvarez, point-blank — pushed around the post. Egypt went into half-time winning."
📝 TIER 1 at 5:21: **HALF-TIME — EGYPT 1 — ARGENTINA 0** — left, above the standing keeper. 3s.

**SCENE 24 — 5:25–5:38 (13s)** · COLD grade building
🖼️ STILL A: @egyout @argout @ball Swift counter-attack, red-jersey sprinting behind the defence. Cold grade beginning to creep in. Dark negative space to the right. Cinematic film still, 35mm, shallow depth of field, slight film grain, cold steel-blue grade, anonymous figures, 16:9.
🖼️ STILL B: @egyout @argout @arggk @ball Six-yard box finish, forest-green keeper beaten. Cold grade. Dark negative space to the left. Cinematic film still, 35mm, shallow depth of field, slight film grain, cold steel-blue desaturated grade, anonymous figures, 16:9.
🎞️ A: PUSH (5:25–5:31). SMASH cut to B on the hit (5:31–5:38).
🎙️ "The sixty-seventh minute. Haissem Hassan drives at the Argentina defence. He finds Mostafa Zico. And Zico makes it two."
📝 TIER 1 at 5:31: **EGYPT 2 — ARGENTINA 0** — amber "2", left, clear of the six-yard box. 4s.
🔊 Musical hit. Then ominous low drone.

**SCENE 25 — 5:38–5:50 (12s)** · COLD grade dominant
🖼️ STILL A: @argout @stadium Wide aerial shot: Argentina isolated in the centre circle, Egypt celebrating on the far side. Cold grade throughout. Dark negative space to the left. Cinematic film still, 35mm, slight film grain, cold steel-blue desaturated grade, anonymous figures, 16:9.
🎞️ PULL 1.10 → 1.00 revealing the scale of the pitch.
🎙️ "Argentina had never — in their entire World Cup history — come back from two goals down. Not once. In thirteen attempts. Never."
📝 TIER 1 at 5:44: **0 FROM 13: ARGENTINA NEVER CAME BACK FROM 2** — amber "NEVER", left, over the isolated Argentina huddle. 4s.

---

## ACT 4 — THE COLLAPSE (5:50–7:00)

**SCENE 26 — 5:50–6:00 (10s)** · MONOCHROME grade
🖼️ STILL A: @egygk @stadium Goalkeeper standing upright, still, alone in his goalmouth. Vast empty stadium behind. Warm grade draining. Cinematic film still, 35mm, shallow depth of field, slight film grain, desaturated moody grade transitioning cooler, anonymous figure, 16:9.
🖼️ STILL B: @egygk Extreme close-up: the same gloves from Scene 1, now hanging at his sides — closing the visual loop. Monochrome grade. Cinematic film still, 35mm macro, very shallow depth of field, slight film grain, near-monochrome grade, 16:9.
🎞️ A: PUSH (5:50–5:56). Cut to B (5:56–6:00). Audio strips to heartbeat on cut.
🎙️ "Eleven minutes left. Two goals ahead. Egypt had never been closer."
🔊 Strip the music. Heartbeat only.

**SCENE 27 — 6:00–6:10 (10s)** · COLD grade returns
🖼️ STILL A: @argout @egygk @ball Header from a corner, keeper diving a fraction late. Net beginning to ripple. Cold grade fully returns. Dark negative space to the left. Cinematic film still, 35mm, shallow depth of field, slight film grain, cold steel-blue desaturated grade, anonymous figures, 16:9.
🎞️ SMASH 1.00 → 1.30 on the hit. Then hold.
🎙️ "Seventy-ninth minute. Cristian Romero heads in from Messi's cross. Two–one."
🔊 A hard musical hit. Then immediate silence.
🔤 TIER 2 at 6:09: **2–1** — small, upper-right above the net. holds ~0.8s.

**SCENE 28 — 6:10–6:20 (10s)** · MONOCHROME grade — cruelest moment
🖼️ STILL A: @egygk @argout @ball First-time volley striking the underside of the crossbar directly above the keeper, whose own gloves are deflecting it downward. Monochrome grade. Dark negative space lower-left. Cinematic film still, 35mm, shallow depth of field, slight film grain, near-monochrome cold grade, anonymous figures, 16:9.
🎞️ PUSH 1.00 → 1.12 very slowly.
🎙️ "Eighty-third minute. Messi. Off the crossbar — and in off the goalkeeper's hands. Two–two."
🔊 A single low boom. Then two full seconds of silence — hold them, textless.
🔤 TIER 2 at 6:18: **2–2** — small, lower-left dark grass void, fading before the silence lands. holds ~0.8s.

**SCENE 29 — 6:20–6:30 (10s)** · MONOCHROME grade — deliberately silent, no text of either tier
🖼️ STILL A: @egygk @egyout Goalkeeper grounded, both gloves flat on the turf, head bowed. A red-jersey teammate's hand on his shoulder. No other figures. Monochrome grade. Cinematic film still, 35mm, shallow depth of field, slight film grain, near-monochrome cold grade, anonymous figures, 16:9.
🎞️ Micro-PUSH 1.00 → 1.05. Let the silence hold.
🎙️ "The hands that had saved Messi. Had just given him back his goal."
🔊 Silence. Let it sit.

**SCENE 30 — 6:30–6:43 (13s)** · COLD → MONOCHROME grade
🖼️ STILL A: @argout @ball Cross from the right wing, header at the far post. Cold grade, brutal. Dark negative space to the left. Cinematic film still, 35mm, shallow depth of field, slight film grain, cold steel-blue grade, anonymous figures, 16:9.
🖼️ STILL B: @egygk @ball Goalkeeper diving but beaten, ball in the net. Monochrome grade. Dark negative space to the right. Cinematic film still, 35mm, shallow depth of field, slight film grain, cold near-monochrome grade, anonymous figure, 16:9.
🎞️ A: PUSH (6:30–6:36). SMASH cut to B (6:36–6:43).
🎙️ "Ninety-two minutes. Enzo Fernandez. A header into the far corner. Three–two. Argentina."
📝 TIER 1 at 6:36: **ARGENTINA 3 — EGYPT 2** — right, above the net. 5s.
🔊 Release everything — full crowd explosion — then pull back to a low mournful drone.

**SCENE 31 — 6:43–6:55 (12s)** · MOURNFUL WARM grade begins
🖼️ STILL A: @egygk @egyout Final whistle: goalkeeper standing alone, both gloved hands on the back of his head, chin lifted. Red-jersey teammates blur past behind him. Mournful warm grade. Dark negative space to the right. Cinematic film still, 35mm, shallow depth of field, slight film grain, desaturated mournful amber grade, anonymous figures, 16:9.
🎞️ Slow PULL 1.10 → 1.00. Let him be alone.
🎙️ "Egypt's greatest comeback was three goals in fourteen minutes by the team they were beating. The team that — by every historical measure — was not supposed to be able to do this."
📝 TIER 1 at 6:47: **3 GOALS IN 14 MINUTES** — right, beside the standing goalkeeper. 3s.

---

## ACT 5 — WHAT IT MEANS (6:55–8:45)

**SCENE 32 — 6:55–7:15 (20s)** · MOURNFUL WARM grade
🖼️ STILL A: @stadium High aerial shot: the stadium bowl glowing warm amber, surrounded by dark featureless landscape. Mournful, not celebratory. Dark negative space to the left. Cinematic film still, 35mm, slight film grain, desaturated moody grade with warm amber glow, 16:9.
🖼️ STILL B: Stylized map of Egypt on dark slate, same design language as Scene 6, with four faint route-lines radiating out toward the four opponent nations (Belgium, New Zealand/Iran group, Australia, Argentina) converging back to Egypt. Dark negative space across most of the frame. Cinematic film still, 35mm, slight film grain, desaturated moody grade with warm amber highlight on Egypt, 16:9.
🎞️ A: PULL 1.15 → 1.00 (6:55–7:03). Cut to B, slow PUSH across the map, following each route-line as it's named (7:03–7:15).
🎙️ "Egypt made it further than they had ever gone. They beat Belgium. They drew with New Zealand and Iran. They won on penalties against Australia. They held Argentina two–nil with eleven minutes left."
📝 TIER 1 at 6:55: **EGYPT'S 2026 RUN** — left, over the dark landscape. 3s.
🔤 TIER 2 at 6:59: **BELGIUM** — small, right of the chapter card. holds ~0.7s.
🔤 TIER 2 at 7:03: **NEW ZEALAND · IRAN** — small, left, over the map. holds ~0.9s.
🔤 TIER 2 at 7:07: **AUSTRALIA** — small, right, over the map. holds ~0.7s.
🔤 TIER 2 at 7:11: **EGYPT 2–0, 79TH MINUTE** — center-low, over the map, the heaviest beat since it's the pivot point of the story. holds ~1.2s.

**SCENE 33 — 7:15–7:27 (12s)** · MOURNFUL WARM grade
🖼️ STILL A: Stylized Egypt map on dark slate, same design language as Scene 6. Country glows softly amber. Nile a thin rust line. Surrounding continent dark. Dark negative space to the right. Cinematic film still, 35mm, slight film grain, desaturated moody grade with warm amber highlight on Egypt, 16:9.
🎞️ Slow PUSH toward Egypt's border.
🎙️ "A country of one hundred and twenty million people had spent decades watching Africa's biggest clubs, Africa's biggest names, try and fail to reach a World Cup quarterfinal. Egypt was not supposed to be the one. But they were the one."
🔤 TIER 2 at 7:25: **THE ONE** — right, over Egypt's glow, contrastive emphasis closing the sentence. holds ~1s.

**SCENE 34 — 7:27–7:40 (13s)** · ASSET REUSE — SCENE 11 STILLS, MODIFIED · MOURNFUL WARM grade
🖼️ STILL A: @gk90s @egygk The two goalkeeper figures from Scene 11 — same generation, same composition — but the right figure (son, amber-gold) is now one small step forward of the left figure (father, 1990s kit). Wide open sky above and between them, as established in Scene 11. Cinematic film still, 35mm, slight film grain, desaturated moody grade with two vertical warm light shafts, anonymous figures, 16:9.
🎞️ Slow lateral pan left → right, landing on the amber son figure.
🎙️ "For thirty-six years, Ahmed Shobeir was the only Egyptian goalkeeper the world had ever noticed. His son stepped onto the same stage — and in four matches, made himself impossible to ignore."
📝 TIER 1 at 7:32: **1990: AHMED SHOBEIR — 2026: MOSTAFA SHOBEIR** — upper sky gap between the two figures, same negative-space zone used in Scene 11. 4s.

**SCENE 35 — 7:40–7:53 (13s)** · MOURNFUL WARM grade
🖼️ STILL A: @egygk Close portrait: goalkeeper, gloves off, chin lifted, looking up toward the lights. Warm rim light on jaw. Dark negative space to the left. Cinematic film still, 35mm, shallow depth of field, slight film grain, desaturated moody grade with warm amber rim-lighting, anonymous figure, 16:9.
🖼️ STILL B: @stadium His point of view — looking straight up at the floodlight banks, soft warm haze. Dark negative space to the right. Cinematic film still, 35mm, slight film grain, warm amber and soft white grade, slight lens flare, 16:9.
🎞️ A: PUSH (7:40–7:47). Cut to B, micro-PULL (7:47–7:53).
🎙️ "Before the tournament, Ahmed had one message for his son. Just one word. Enjoy. And somewhere in that word — in the gap between what his father achieved and what Mostafa was attempting — was an entire generation of Egyptian football."
🔤 TIER 2 at 7:45: **ENJOY** — echoes the Scene 12 moment, styled slightly more transparent as a callback, upper-right. holds ~1s.

**SCENE 36 — 7:53–8:07 (14s)** · MOURNFUL WARM grade
🖼️ STILL A: @egygk Goalkeeper walking slowly away from camera down a dark stadium tunnel toward a bright white opening of light. Kit bag over one shoulder. Wide dark negative space along the upper-left of the tunnel walls. Cinematic film still, 35mm, shallow depth of field, slight film grain, desaturated moody grade with deep navy-teal tunnel walls and warm white light ahead, anonymous figure, 16:9.
🎞️ 2.5D PARALLAX: keeper on alpha, tunnel walls pan 30% slower. PUSH 1.00 → 1.12 toward the light.
🎙️ "He saved two penalties. He kept out Messi. He kept out Mac Allister. He kept out Alvarez. He held the reigning world champions to nil for eighty-three minutes. And it still was not enough."
🔤 TIER 2 at 7:56: **MESSI · MAC ALLISTER · ALVAREZ** — small, upper-left of the tunnel, each name appearing in quick sequence. holds ~0.5s.
📝 TIER 1 at 8:02: **2 PENALTY SAVES — 1 TOURNAMENT** — amber "2", right, beside the walking figure. 4s.

**SCENE 37 — 8:07–8:22 (15s)** · MOURNFUL WARM grade
🖼️ STILL A: @egygk @stadium Wide pull-back from the tunnel: goalkeeper silhouette shrinking as the frame expands to reveal the entire empty stadium. Vast empty seats, dark sky. He is the smallest figure in the biggest space. Dark negative space to the left. Cinematic film still, 35mm, slight film grain, desaturated moody grade with barely-there warm amber on the tiny figure, anonymous figure, 16:9.
🎞️ PULL 1.15 → 1.00 over 15s, slowly revealing the vast empty space.
🎙️ "That is the cruelest thing about this story. Not that Egypt lost. But that they were good enough to deserve to win — and the history books will only record the score."
📝 TIER 1 at 8:11: **EGYPT 2026: THE HISTORY BOOKS ONLY RECORD THE SCORE** — left, over the empty seats. 5s.

**SCENE 38 — 8:22–8:35 (13s)** · MOURNFUL WARM grade
🖼️ STILL A: Stylized map of Africa on dark slate. Egypt glowing amber at the north. Below it, four other country shapes faintly lit in muted rust — Cameroon, Senegal, Ghana, Morocco. All else unlit. Dark negative space to the right. Cinematic film still, 35mm, slight film grain, desaturated moody grade with warm amber/rust highlights on the five lit countries, 16:9.
🎞️ PUSH 1.00 → 1.10 toward Egypt.
🎙️ "Africa has produced four nations that reached a World Cup quarterfinal in history. Cameroon, Senegal, Ghana, Morocco. Egypt was eleven minutes from joining them."
🔤 TIER 2 at 8:24: **CAMEROON · SENEGAL · GHANA · MOROCCO** — traces across the four lit shapes in quick sequence. holds ~0.4s.
📝 TIER 1 at 8:29: **11 MINUTES FROM HISTORY** — amber "11", right, above Egypt on the map. 4s.

**SCENE 39 — 8:35–8:42 (7s)** · EDITOR BUILD — NO GENERATION
📝 TIER 1 at 8:35: **THE SON ALSO SAVES** — full screen title card, mirror of Scene 5, letter-track fade, hold, fade to black. 4s.

---

## OUTRO / CTA — (8:42–8:57)

**SCENE 40 — 8:42–8:57 (15s)** · EDITOR BUILD — NO GENERATION
🎞️ End-screen plate: channel branding on navy with faint pitch-line texture. Subscribe prompt. Next-video thumbnail slot.
🎙️ "If you want the stories the highlight reels never tell — the underdogs, the lineages, the nights that deserved a different ending — this is the channel. The next one is already coming."
📝 TIER 1 at 8:42: **SUBSCRIBE FOR MORE** — subscribe prompt + next video suggestion. 5s.

---

## PRODUCTION NOTES

**Text overlay rendering:** all `📝` (Tier 1) and `🔤` (Tier 2) lines are rendered by FFmpeg `drawtext` via `apps/video/src/longform/motion.js`, never generated inside the still images themselves. Placement descriptions in each line are resolved to an on-screen anchor automatically (`apps/video/src/longform/placement.js`) and must be visually reviewed against the actual rendered stills before final render — the automatic mapping is keyword-based, not a vision check of the real image.

**Tier 2 timing dependency:** every Tier 2 `at H:MM` value in this document is a script-time estimate. Once VO is synthesized (Kokoro TTS, see `generate-tts-local.mjs`), real per-word timestamps are extracted via Whisper (`generateWordTimestamps` in `packages/media/subtitles.js`) and `resync-tier2.mjs` rewrites each Tier 2 cue's actual `at_sec`/duration to match — do not treat the script timecodes as final.

**Silent scenes (deliberate, do not add text):** Scene 26, Scene 29, and the 2-second silence window inside Scene 28 carry no text of either tier by design — silence is doing narrative work there.

**Asset reuse:** Scene 34 regenerates with the son one step forward of the father (composition genuinely changes from Scene 11, not a straight regrade). Scene 39 reuses the Scene 5 title-card design.

**No shirt numbers on generated figures. No real likenesses. No broadcast audio.**

**TTS normalization:** all numerals are written out in VO text; on-screen text keeps numerals.

**Superseded assets:** the earlier Grok-video-clip test cut (`temp/son-also-saves-testcut-vo3.mp4` and prior revisions) and its manifest (`content/longform/son-also-saves/edl.json`) are left in place but unused going forward — this shotlist and the stills-only pipeline are the source of truth.
