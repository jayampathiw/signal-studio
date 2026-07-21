# SHOT LIST v2 (IMAGE-FIRST) — "One Match Short | Colombia's World Cup Heartbreak"
### The Underdog Archive — Video #3 candidate · Stills + Ken Burns pipeline

**TITLE:** One Match Short | Colombia's World Cup Heartbreak
**TARGET_DURATION_SEC:** 376
**PIPELINE:** Every scene is built from 1 generated STILL IMAGE animated in the editor (Ken Burns push/pull/smash, static holds). Video generation is used for ZERO scenes. Ported from the user's original shot list, `Colombia_Exit_ShotList_v1.md` (source of truth for VO, facts, and grade), into this codebase's parser syntax — same porting approach used for project 30 (`son-also-saves`).
**ASSET COUNT:** 35 generated stills across 35 scenes (Scenes 3 and 34 are pre-baked title-card graphics with no drawtext duplicate, matching the son-also-saves S5/S39/S40 pattern). 5 kit-reference sheets + 2 venue-master references generated separately. 2 thumbnail variants.
**TEXT OVERLAY ENGINE:** Running Whisper-timed captions (karaoke-style, word-by-word amber highlight) via `apps/video/src/longform/captions.js` + `generate-captions.mjs`, same design as son-also-saves §12.1 — NOT the Tier 1/Tier 2 hero-card system. The 📝 TIER 1 lines below are kept parsed (for text-card fallback text + possible future re-enable) but are not rendered by `assemble-local.mjs`'s current `mergeCaptions()`.
**VERIFIED FACTS SOURCE:** `temp/One Match Short/Colombia_Exit_ShotList_v1.md` (FIFA match centre, ESPN, France24, Fox Sports, Yahoo Sports — cross-checked July 2026 reporting). One flagged/unconfirmed detail (a referee claim) was deliberately excluded from this script per the source document's own instruction.

---

## SECTION A — MASTER CONSISTENCY BIBLE

**Layer 1 — Reference Elements** (already generated, saved to `content/longform/one-match-short/stills/refs/`):

**@colout** — Colombia outfield: yellow shirt, navy shorts, red trim, anonymous/faceless, back or three-quarter turned.
**@colgk** — Colombia goalkeeper (Camilo Vargas figure): contrasting keeper kit, dark colourway, gloves visible, face in shadow.
**@swiout** — Switzerland outfield: red shirt with white cross motif, white shorts, anonymous/faceless.
**@swigk** — Switzerland goalkeeper (Gregor Kobel figure): green/contrast keeper kit, gloves visible, face in shadow.
**@james2014** — flashback figure: Colombia kit, 2014-era styling cue (subtle vintage desaturation only, no likeness), captain's armband visible, symbolic not literal.
**@bcplace** — BC Place, Vancouver: modern stadium, roof structure, night atmosphere.
**@kansascity** — Kansas City Stadium: modern stadium exterior/interior reference.

**[STYLE]** — Cinematic, dramatic, low-key lighting. Desaturated palette, cool teal shadows, warm amber/copper mid-tones and highlights. Slight film grain. Shallow depth of field. Anonymous/stylized figures — faces always in deep shadow or turned away, no recognizable real player faces. Stadium at dusk/night, moody. 16:9. Consistent across all scenes.

**Kit decision rationale:** not the literal match kits — Colombia in yellow/navy/red trim for legibility and warmth, Switzerland in red/white-cross for cool antagonist energy. Kit color is the only team identifier, never varies.

---

## SECTION B — MOTION LANGUAGE (editor-side)

- **PUSH:** 1.00→1.08–1.15, Bézier ease. Default move.
- **PULL:** 1.15→1.00. Contextual reveals.
- **SMASH:** 1.00→1.30 in ~1.5s on a low-freq hit. Goals/saves/crossbar shocks only.
- **HOLD:** static frame, no zoom — used deliberately for aftermath/stillness beats where motion would undercut the emotion.
- **PATTERN INTERRUPT RULE:** every scene ≥10s carries either an SFX hit or is a deliberate single-beat emotional hold (Act 4's shootout beats lean on silence as the interrupt, per the source doc's explicit instruction not to over-decorate the shootout).
- **Audio:** -14 LUFS master; VO -12 to -15 dB; music -22 to -25 dB (not yet mixed — see production notes).

---

## SECTION C — COLOUR GRADE SYSTEM

**WARM:** near-misses, Colombia scoring, crowd pride. **COLD:** the stalemate, Switzerland scoring, tension. **MOURNFUL:** aftermath, defeat, the walk off. **MONOCHROME:** historical flashback (2014, 2018) and maximum tension.

`motion.js` only supports two regrade presets (`warm_amber`/`cold_blue`); WARM/MOURNFUL map to `warm_amber`, COLD/MONOCHROME map to `cold_blue` (same mapping `assemble-local.mjs` used for son-also-saves).

---

## Per-scene format:
🖼️ STILL(s) — image prompt(s) for still generation
🎞️ MOTION — editor-side Ken Burns instruction
🎙️ VO — continuous narration
🔊 AUDIO — sound design cue
📝 TIER 1 — hero card (parsed, not currently rendered — see header note)

---

## COLD OPEN

**SCENE 1 — 0:00–0:12 (12s)** · MOURNFUL grade
🖼️ STILL A: @colout A single Colombia player, anonymous, sitting on the pitch, head down, stadium blurred behind. [STYLE]
🎞️ PUSH 1.00 → 1.08 over 12s.
🎙️ "Colombia had the better chances. The better shots. The better numbers."
🔊 Total silence, no crowd noise.

**SCENE 2 — 0:12–0:26 (14s)** · MOURNFUL grade
🖼️ STILL A: @swigk Wide, negative-space-heavy shot: an empty penalty spot, rain-slicked, floodlight glow. Faint distant silhouette in goal. [STYLE]
🎞️ PUSH 1.00 → 1.06 over 14s.
🎙️ "None of it mattered. Because in this country's history, this is the moment that keeps repeating — the shootout, the long walk, the one kick that decides everything."
🔊 Low ambient hum, single bass note.
📝 TIER 1 at 0:12: **THE MOMENT THAT KEEPS REPEATING** — amber "REPEATING", centered. 4s.

**SCENE 3 — 0:26–0:30 (4s)** · MOURNFUL grade
📝 TIER 1 at 0:26: **ONE MATCH SHORT** — amber "SHORT", centered. 4s.

---

## ACT 1 — THE LINEAGE

**SCENE 4 — 0:30–0:42 (12s)** · MONOCHROME grade
🖼️ STILL A: Stylized 1990s-era football motif — vintage ball, grainy texture, a golden generation implied through symbolic imagery (ball, boots, faded photograph texture), no real likenesses. [STYLE]
🎞️ PUSH 1.00 → 1.08 over 12s.
🎙️ "For thirty years, Colombian football has produced some of the most beautiful players the world has seen. And for thirty years, the World Cup has given almost none of it back."

**SCENE 5 — 0:42–0:53 (11s)** · MONOCHROME grade
🖼️ STILL A: @james2014 A single figure in vintage Colombia kit, symbolic not literal, captain's armband, 2014-era cue. [STYLE]
🎞️ PUSH 1.00 → 1.08 over 11s.
🎙️ "In 2014, a twenty-three-year-old named James Rodríguez carried this country further than it had ever been. A quarterfinal. The tournament's best goalscorer."

**SCENE 6 — 0:53–1:04 (11s)** · MONOCHROME grade
🖼️ STILL A: @james2014 The same figure, shot from behind, walking away from a stadium tunnel — symbolic passage of time. [STYLE]
🎞️ PULL 1.10 → 1.00 over 11s.
🎙️ "Twelve years passed. And that ceiling — the quarterfinal Colombia touched exactly once — never moved again."

**SCENE 7 — 1:04–1:15 (11s)** · MOURNFUL grade
🖼️ STILL A: A locked-goal / penalty-spot motif, dissolving into a "2018" numeral graphic. [STYLE]
🎞️ PUSH 1.00 → 1.10 over 11s.
🎙️ "In 2018, Colombia met England in the round of sixteen. It went to penalties. Colombia lost."
📝 TIER 1 at 1:04: **2018: COLOMBIA ELIMINATED ON PENALTIES** — amber "PENALTIES", lower third. 4s.

**SCENE 8 — 1:15–1:24 (9s)** · COLD grade
🖼️ STILL A: A calendar/clock motif ticking forward from 2018 to 2026. [STYLE]
🎞️ PUSH 1.00 → 1.06 over 9s.
🎙️ "Eight years later, older, and captained again by the same man who once carried them further than anyone — Colombia arrived in Vancouver."

---

## ACT 2 — THE SETUP

**SCENE 9 — 1:24–1:36 (12s)** · WARM grade
🖼️ STILL A: @colout @kansascity A crowded, celebratory motif — jerseys in a sea of yellow, symbolic crowd texture, no real faces. [STYLE]
🎞️ PUSH 1.00 → 1.10 over 12s.
🎙️ "Group winners. A dominant win over Ghana to reach the round of sixteen — Jhon Arias finishing a chance created in the fourteenth minute."
📝 TIER 1 at 1:24: **COLOMBIA 1–0 GHANA** — amber "1–0", lower third. 3s.

**SCENE 10 — 1:36–1:47 (11s)** · WARM grade
🖼️ STILL A: @bcplace A packed stadium exterior at dusk, sea-of-yellow color implication, no logos. [STYLE]
🎞️ PULL 1.08 → 1.00 over 11s.
🎙️ "Every match had felt like a home game. Colombian fans outnumbered every opponent's support, in every city."

**SCENE 11 — 1:47–1:58 (11s)** · COLD grade
🖼️ STILL A: Two national color-blocks facing off, abstractly — Switzerland's red cross-motif vs Colombia's yellow. [STYLE]
🎞️ PUSH 1.00 → 1.08 over 11s.
🎙️ "Next: Switzerland. A team quietly building one of the best defensive tournaments nobody was talking about."

---

## ACT 3 — THE MATCH

**SCENE 12 — 1:58–2:10 (12s)** · COLD grade
🖼️ STILL A: @colout @swiout A vast, tense stadium interior, figures locked in a defensive standoff, tight framing. [STYLE]
🎞️ PUSH 1.00 → 1.06 over 12s.
🎙️ "Ninety minutes. Then thirty more. Neither team broke."

**SCENE 13 — 2:10–2:22 (12s)** · WARM grade
🖼️ STILL A: @colout A header rising toward goal, crashing off a crossbar — ball deflecting up and away. [STYLE]
🎞️ SMASH 1.00 → 1.30 over 1.5s.
🎙️ "Jhon Lucumí rose for a header that beat everyone — and came back off the crossbar."
🔊 A sharp, hollow clang.

**SCENE 14 — 2:22–2:34 (12s)** · WARM grade
🖼️ STILL A: @colout A lone attacker bearing down on an open goal, one-on-one, ball rising over the frame. [STYLE]
🎞️ PUSH 1.00 → 1.12 over 12s.
🎙️ "Then, in extra time, a defensive mistake gifted Jáminton Campaz a clear run at goal. Open goal. He put it over the bar."
📝 TIER 1 at 2:22: **COLOMBIA: 1.03 XG. SWITZERLAND: 0.35.** — amber "1.03", right third. 4s.

**SCENE 15 — 2:34–2:43 (9s)** · MOURNFUL grade
🖼️ STILL A: A held, static frame — the ball resting at the penalty spot, stadium lights blurring behind. [STYLE]
🎞️ HOLD.
🎙️ "One hundred and twenty minutes of the better team. Zero goals to show for it."

---

## ACT 4 — THE SHOOTOUT

**SCENE 16 — 2:43–2:56 (13s)** · MOURNFUL grade
🖼️ STILL A: Slow zoom on the penalty spot, desaturated almost fully. [STYLE]
🎞️ PUSH 1.00 → 1.12 over 13s.
🎙️ "So it comes to this again. The walk. The whistle. The one kick that erases everything before it."

**SCENE 17 — 2:56–3:05 (9s)** · COLD grade
🖼️ STILL A: @swiout A Swiss penalty taker striking calmly, ball into the net. [STYLE]
🎞️ SMASH 1.00 → 1.30 over 1.5s.
🎙️ "Xhaka scores. Amdouni scores. Switzerland lead."

**SCENE 18 — 3:05–3:13 (8s)** · WARM grade
🖼️ STILL A: @colout A Colombia penalty taker striking, ball into the net. [STYLE]
🎞️ SMASH 1.00 → 1.30 over 1.5s.
🎙️ "Quintero answers. Colombia holds."

**SCENE 19 — 3:13–3:24 (11s)** · WARM grade
🖼️ STILL A: @swiout A Swiss penalty flying over the crossbar into the stands. [STYLE]
🎞️ PUSH 1.00 → 1.10 over 11s.
🎙️ "Then Akanji drags his effort over the bar. The door opens."
🔊 A hopeful swell in the score, cut short.

**SCENE 20 — 3:24–3:36 (12s)** · MOURNFUL grade
🖼️ STILL A: @colout A Colombia penalty striking the crossbar, ball deflecting away untouched. [STYLE]
🎞️ SMASH 1.00 → 1.30 over 1.5s.
🎙️ "And Davinson Sánchez — the door was right there — hits the crossbar."
🔊 The same hollow clang from Scene 13 — deliberate echo.

**SCENE 21 — 3:36–3:45 (9s)** · COLD grade
🖼️ STILL A: @swiout A Swiss penalty striking cleanly into the net. [STYLE]
🎞️ SMASH 1.00 → 1.30 over 1.5s.
🎙️ "Itten scores. Switzerland lead again."

**SCENE 22 — 3:45–3:54 (9s)** · WARM grade
🖼️ STILL A: @colout A Colombia penalty striking cleanly into the net. [STYLE]
🎞️ SMASH 1.00 → 1.30 over 1.5s.
🎙️ "Campaz levels it. Colombia refuse to fold."

**SCENE 23 — 3:54–4:08 (14s)** · MOURNFUL grade
🖼️ STILL A: @swigk A goalkeeper diving to his right, parrying a shot away — the taker's shoulders dropping. [STYLE]
🎞️ SMASH 1.00 → 1.25 over 1.5s.
🎙️ "Cucho Hernández steps up. Needs to score to keep it alive. Kobel guesses right. Saved."
🔇 No hero-card decoration on this beat — deliberate silent-visual moment per source doc.

**SCENE 24 — 4:08–4:18 (10s)** · WARM grade
🖼️ STILL A: @colout A Colombia penalty striking low into the corner, net rippling. [STYLE]
🎞️ SMASH 1.00 → 1.30 over 1.5s.
🎙️ "Luis Díaz doesn't blink. Scores. Three–three."

**SCENE 25 — 4:18–4:30 (12s)** · MOURNFUL grade
🖼️ STILL A: @swiout A lone Swiss penalty taker walking to the spot, calm, focused, slow motion. [STYLE]
🎞️ PULL 1.10 → 1.00 over 12s.
🎙️ "One kick left in Switzerland's favor. Rubén Vargas — who almost didn't play — steps up."

**SCENE 26 — 4:30–4:38 (8s)** · MOURNFUL grade
🖼️ STILL A: The ball into the bottom corner, net rippling; the frame holds on the empty spot after, not the celebration. [STYLE]
🎞️ SMASH 1.00 → 1.25 over 1.5s.
🎙️ "He scores. Switzerland win. Four–three."
🔇 No hero-card decoration — hold the silence per source doc.

**SCENE 27 — 4:38–4:50 (12s)** · MOURNFUL grade
🖼️ STILL A: @colout Figures, anonymous, standing motionless at the center circle. No celebration in frame — only stillness. [STYLE]
🎞️ HOLD.
🎙️ "Better chances. Better shots. Better numbers. None of it is what the scoreboard remembers."

---

## ACT 5 — WHAT IT MEANS

**SCENE 28 — 4:50–5:02 (12s)** · MONOCHROME grade
🖼️ STILL A: Pull back from the stadium to the symbolic 2014 flashback motif — the quarterfinal ceiling image returning. [STYLE]
🎞️ PULL 1.15 → 1.00 over 12s.
🎙️ "Twelve years ago, a twenty-three-year-old carried this country to a quarterfinal nobody expected. It remains the best this nation has ever done."

**SCENE 29 — 5:02–5:13 (11s)** · MONOCHROME grade
🖼️ STILL A: @james2014 The same captain-armband figure, aged, walking off a pitch, substituted, alone. [STYLE]
🎞️ PUSH 1.00 → 1.08 over 11s.
🎙️ "That same man captained this team in 2026 — substituted before halftime, match after match, a fading light instead of a rising one."

**SCENE 30 — 5:13–5:25 (12s)** · COLD grade
🖼️ STILL A: Two shootout-heartbreak motifs side by side — 2018 and 2026 — mirrored penalty spots. [STYLE]
🎞️ PUSH 1.00 → 1.08 over 12s.
🎙️ "This is now the second time in three tournaments that a penalty shootout has ended Colombia's World Cup in the round of sixteen."
📝 TIER 1 at 5:13: **2018 VS ENGLAND. 2026 VS SWITZERLAND. SAME ROUND.** — amber "SAME ROUND", centered. 4s.

**SCENE 31 — 5:25–5:37 (12s)** · WARM grade
🖼️ STILL A: @colout The sea-of-yellow crowd motif returning, warmer this time — not mournful, but proud. [STYLE]
🎞️ PUSH 1.00 → 1.10 over 12s.
🎙️ "None of it erases what this team actually did — the best defense of the tournament, a nation that traveled and filled every stadium."

**SCENE 32 — 5:37–5:48 (11s)** · MOURNFUL grade
🖼️ STILL A: @colout A single Colombia figure, back to camera, walking toward a tunnel, stadium lights fading behind. [STYLE]
🎞️ PULL 1.10 → 1.00 over 11s.
🎙️ "But a country this good at producing brilliance keeps finding new ways to fall one match short of proving it."

**SCENE 33 — 5:48–6:00 (12s)** · MOURNFUL grade
🖼️ STILL A: Final wide shot — the empty penalty spot from Scene 2, now abandoned, floodlights dimming. [STYLE]
🎞️ HOLD.
🎙️ "Twelve years since the ceiling was set. Colombia are still standing beneath it, looking up."

**SCENE 34 — 6:00–6:04 (4s)** · MOURNFUL grade
📝 TIER 1 at 6:00: **ONE MATCH SHORT** — amber "SHORT", centered. 4s.

---

## OUTRO

**SCENE 35 — 6:04–6:16 (12s)** · WARM grade
🖼️ STILL A: End-screen plate: channel branding, standalone icon watermark already applied per default, space for subscribe + next-video thumbnail. [STYLE]
🎞️ HOLD.
🎙️ "If you want the stories the highlight reels skip — the heartbreaks, the near-misses, the history behind South America's football — this is the channel. The next one's already coming."
📝 TIER 1 at 6:04: **SUBSCRIBE FOR MORE** — amber "SUBSCRIBE", lower third. 4s.

---

## PRODUCTION NOTES

- **Runtime as scripted:** ~6:16 (376s) core — shorter than the source doc's 8–9 min aspirational target. Per explicit user instruction, proceeding as-is without stretching VO or padding scenes to hit a runtime number.
- **VO ported verbatim** from `temp/One Match Short/Colombia_Exit_ShotList_v1.md` — no rewriting.
- **Flagged referee detail excluded** — the source doc's own unconfirmed claim about match officials is not included anywhere in this script, per its own instruction not to use it until verified.
- **Scenes 3 and 34** are pre-baked title-card graphics (`S03-A.jpg` / `S34-A.jpg`, real files with "ONE MATCH SHORT" baked into the image) — zero `🖼️` lines by design so `assemble-local.mjs` treats them as `buildTextCard` calls with a background image and no duplicate drawtext, same as son-also-saves' S5/S39/S40 fix.
- **Scene 35** has a real generated end-screen plate (not a blank text card) plus real VO — rendered as a normal still scene with `HOLD` motion, not a text card.
- **Captions, not Tier 1/Tier 2:** matches son-also-saves' final design (§12.1) — full-sentence running captions generated from real VO via Whisper, not isolated hero cards or word-punches. The 📝 lines above are parsed but inert unless `mergeCaptions()` in `assemble-local.mjs` is changed to re-include them.
- **Voice:** use Kokoro `am_adam` by default (the son-also-saves final pick) unless the user asks for a different voice for this channel/video.
