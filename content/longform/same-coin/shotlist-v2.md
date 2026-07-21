# SHOT LIST v2 (IMAGE-FIRST) — "The Same Coin | Paraguay's Run Ends Against France"
### The Underdog Archive — Video #4 candidate · Stills + Ken Burns pipeline

**TITLE:** The Same Coin | Paraguay's Run Ends Against France
**TARGET_DURATION_SEC:** 272
**PIPELINE:** Every scene is built from 1 generated STILL IMAGE animated in the editor (Ken Burns push/pull/smash, static holds). Ported from `temp/new/Paraguay's World Cup Exit vs. France/SHOT_LIST_The_Same_Coin_UPDATED.md` into this codebase's parser syntax — same porting approach as silenced-goalkeeper/one-match-short/son-also-saves.
**ASSET COUNT:** 23 generated stills across 25 scenes (Scenes 3 and 24 are title cards with NO pre-baked background image in the source assets — rendered as plain black-background text cards via `buildTextCard`'s no-image fallback, unlike the other Underdog Archive projects which had baked title art).
**SCOPE NOTE:** The source shot list's own production notes flag this as a first draft, short of the 8–9 min target (~4:32 as scripted) and recommend expansion before generation. Per explicit user instruction, built as-is at the scripted length — expansion (new scenes + new image generation) is a separate future step, not done here.
**IMAGE VARIANT NOTE:** Most stills had two generated variants in the source folder (a base version and a "_2" version). Per user instruction, the "_2" (updated) variant was used everywhere one existed; 5 scenes (S5, S7, S13, S14, S15) only had a base version.
**GRADE NOTE:** The source doc introduces a new HEAT grade (bleached daylight/heat-shimmer, for the Philadelphia heatwave match scenes) that this codebase's `motion.js` has no preset for — mapped to WARM here (closest available amber-leaning preset) since adding a true third regrade preset was out of scope for this build. Flagged, not silently dropped.
**VERIFIED FACTS SOURCE:** VO ported verbatim from the source shot list (FIFA match centre, ESPN, Sky Sports, France24, Al Jazeera — cross-checked per the source doc).
**Voice:** Kokoro `am_adam`, matching the established Underdog Archive default (Orlando Gill is the same recurring goalkeeper from Video #1/silenced-goalkeeper).

---

## SECTION A — MASTER CONSISTENCY BIBLE

**@paraout** — Paraguay outfield: red/white striped shirt, blue shorts, anonymous, back/three-quarter turned.
**@paragk** — Orlando Gill, recurring from Video #1: distinct keeper kit, gloves visible, face in shadow.
**@fraout** — France outfield: blue shirt, white/red trim, anonymous.
**@mbappe-symbolic** — a single recurring anonymous figure standing in for the penalty-taker, consistent silhouette/kit only, never a likeness.

**[STYLE]** — Cinematic, dramatic, low-key lighting. Desaturated palette, cool teal shadows, warm amber/copper mid-tones and highlights. Slight film grain. Shallow depth of field. Anonymous/stylized figures — faces always in deep shadow or turned away, no recognizable real player faces. Stadium moody. 16:9.

---

## SECTION B — MOTION LANGUAGE (editor-side)

- **PUSH:** 1.00→1.08–1.15, default move. **PULL:** 1.15→1.00, contextual reveals. **SMASH:** 1.00→1.30 in ~1.5s, goals/saves only. **HOLD:** static, deliberate stillness.

## SECTION C — COLOUR GRADE SYSTEM

**WARM** (incl. HEAT per note above): amber/heat push — defiance, saves, pride, the heatwave match scenes. **COLD:** teal shadows — tension, the penalty moment. **MOURNFUL:** desaturated grey — final whistle, elimination. **MONOCHROME:** flashback to Video #1 (Germany match).

`motion.js` regrade presets: WARM/MOURNFUL → `warm_amber`, COLD/MONOCHROME → `cold_blue`.

---

## Per-scene format:
🖼️ STILL(s) — image prompt(s) for still generation
🎞️ MOTION — editor-side Ken Burns instruction
🎙️ VO — continuous narration
🔊 AUDIO — sound design cue
📝 TIER 1 — hero card (parsed, not currently rendered — matches established convention)

---

## COLD OPEN

**SCENE 1 — 0:00–0:12 (12s)** · WARM grade
🖼️ STILL A: @paragk Extreme low-angle three-quarter rear view of Orlando Gill, body fully extended mid-air in a desperate full-stretch dive to his right, gloved hands reaching toward a blurred white ball. Soft-focus Philadelphia Stadium stands under moody lights. [STYLE]
🎞️ PUSH 1.00 → 1.08 over 12s.
🎙️ "Eleven days earlier, this goalkeeper had done the impossible — beaten the four-time champions on penalties."

**SCENE 2 — 0:12–0:26 (14s)** · WARM grade
🖼️ STILL A: Wide establishing shot of the empty pitch and lower stands of Philadelphia Stadium under brutal July sun, heat haze visibly warping the far goal and advertising boards, harsh bleaching midday light, hard short shadows. No figures. [STYLE]
🎞️ PUSH 1.00 → 1.06 over 14s.
🎙️ "Today, in thirty-nine-degree heat, he'd face someone even more dangerous — and this time, there'd be no shootout to save him."

**SCENE 3 — 0:26–0:30 (4s)** · WARM grade
📝 TIER 1 at 0:26: **THE SAME COIN.** — centered. 4s.

---

## ACT 1 — THE LINEAGE

**SCENE 4 — 0:30–0:40 (10s)** · MONOCHROME grade
🖼️ STILL A: Pure monochrome, high-contrast black-and-white. Single dark goalkeeper silhouette in mid-dive pose, completely silhouetted against a bright, overexposed stadium floodlight, face and identifying features lost in pure black shadow. Faded, memory-like quality. [STYLE]
🎞️ PUSH 1.00 → 1.08 over 10s.
🎙️ "You know the story already. Paraguay, penalties, and a goalkeeper the world had just discovered."

**SCENE 5 — 0:40–0:52 (12s)** · COLD grade
🖼️ STILL A: Graphic map/bracket motif: a stylized, glowing tournament bracket diagram floating over a dark teal-toned abstract stadium floor, Paraguay's path highlighted in thin warm amber lines narrowing toward a much larger, looming dark-blue France shape. [STYLE]
🎞️ PUSH 1.00 → 1.08 over 12s.
🎙️ "What that win actually bought them was this: a date with France, the tournament's most dangerous team, and its most dangerous man."

---

## ACT 2 — THE SETUP

**SCENE 6 — 0:52–1:04 (12s)** · WARM grade
🖼️ STILL A: Wide exterior establishing shot of Philadelphia Stadium (Lincoln Financial Field) under brutal July 4 sun, heat haze rising from the parking lots and plaza, hard short shadows, American flags barely moving. Modern concrete architecture glowing white-hot. [STYLE]
🎞️ PUSH 1.00 → 1.06 over 12s.
🎙️ "July 4th. Philadelphia. Sixty-eight thousand fans, and a heat warning across the entire region."
📝 TIER 1 at 0:52: **FRANCE 0–0 PARAGUAY** — centered. 3s.

**SCENE 7 — 1:04–1:16 (12s)** · COLD grade
🖼️ STILL A: @paraout High-angle tactical view of a compressed low defensive block: five Paraguay figures tightly packed near their own goal line, bodies low and angled, backs mostly to camera or faces in shadow. Cool teal shadows dominate. [STYLE]
🎞️ PUSH 1.00 → 1.08 over 12s.
🎙️ "Paraguay had one plan, the same one that beat Germany: sit deep, absorb everything, make the game ugly."

**SCENE 8 — 1:16–1:26 (10s)** · WARM grade
🖼️ STILL A: @fraout Mid-shot of three France figures circulating the ball patiently in a triangle just outside the compressed Paraguay block, bodies turned three-quarter away or faces in shadow, calm possession. Warm amber highlights on ball and kit. [STYLE]
🎞️ PUSH 1.00 → 1.08 over 10s.
🎙️ "France had almost all of the ball. Seventy-six percent of it. And nowhere to put it."

---

## ACT 3 — THE MATCH

**SCENE 9 — 1:26–1:38 (12s)** · WARM grade
🖼️ STILL A: @fraout @paraout Medium shot of a brief physical confrontation: one France figure and one Paraguay figure chest-to-chest shoving, two others stepping in to separate them, all faces in deep shadow or turned away. Heat haze visible in background. [STYLE]
🎞️ PUSH 1.00 → 1.08 over 12s.
🎙️ "The frustration showed early. Shoves. Words. A league of players used to scoring, unable to break through."

**SCENE 10 — 1:38–1:48 (10s)** · WARM grade
🖼️ STILL A: @paragk Dynamic low-angle of Orlando Gill diving horizontally to his left, both gloved hands pushing a long-range white ball away from goal, body fully extended. Warm amber highlights on gloves and ball. [STYLE]
🎞️ SMASH 1.00 → 1.25 over 1.5s.
🎙️ "Every time France found a shot, Gill was already there."
📝 TIER 1 at 1:38: **FRANCE 0–0 PARAGUAY** — centered. 3s.

**SCENE 11 — 1:48–2:00 (12s)** · WARM grade
🖼️ STILL A: Wide shot across the Philadelphia Stadium pitch looking toward the far goal, heat waves visibly distorting the advertising boards, goalposts and a few tiny anonymous player figures in the distance, oppressive white-hot atmosphere. [STYLE]
🎞️ PUSH 1.00 → 1.06 over 12s.
🎙️ "This wasn't the France that had scored freely all tournament. This was a team boiling in its own frustration."

**SCENE 12 — 2:00–2:10 (10s)** · WARM grade
🖼️ STILL A: @paraout @mbappe-symbolic Tight three-quarter rear view of a Paraguay figure making subtle off-the-ball contact with the arm/shoulder of the France penalty-taker figure, both bodies slightly off-balance, a blurred official in the background not reacting. [STYLE]
🎞️ PUSH 1.00 → 1.06 over 10s.
🎙️ "Paraguay's edges got sharper. Off-the-ball strikes. Niggling fouls. Not one yellow card shown all match."

**SCENE 13 — 2:10–2:22 (12s)** · COLD grade
🖼️ STILL A: @mbappe-symbolic Medium shot inside the penalty box: the France penalty-taker figure falling backward after contact from a Paraguay defender, body twisted, one arm outstretched, face in deep shadow. Cool teal shadows on grass and kit. [STYLE]
🎞️ PUSH 1.00 → 1.08 over 12s.
🎙️ "Then, the seventieth minute. Diego Gómez brings down Desiré Doué inside the box. The referee waves it away."

**SCENE 14 — 2:22–2:34 (12s)** · COLD grade
🖼️ STILL A: Close three-quarter view of a referee figure standing beside a pitchside VAR review monitor, body leaning in, one hand raised slightly. Soft blue glow from the screen. Cool teal overall grade. [STYLE]
🎞️ PUSH 1.00 → 1.06 over 12s.
🎙️ "VAR calls him back. He reviews it himself. And reverses the decision. Penalty."
📝 TIER 1 at 2:22: **PENALTY — 70'** — centered. 3s.

---

## ACT 4 — THE PENALTY

**SCENE 15 — 2:34–2:46 (12s)** · COLD grade
🖼️ STILL A: @mbappe-symbolic @paragk Medium wide shot of the penalty spot: France's taker figure carefully placing the ball on the white spot with both hands, body slightly bent. In the background, Gill crouched low on the goal line, gloves ready. Cool teal tension. [STYLE]
🎞️ PUSH 1.00 → 1.06 over 12s.
🎙️ "Paraguay try everything they can to put him off. Scuff the spot. Slow the clock. He's faced worse."

**SCENE 16 — 2:46–2:56 (10s)** · WARM grade
🖼️ STILL A: @paragk Dynamic action: the exact moment of impact — white ball just entering the bottom corner of the net, netting rippling violently, Gill fully extended in a dive the wrong way, body horizontal. Warm amber highlights catch the net and ball. [STYLE]
🎞️ SMASH 1.00 → 1.30 over 1.5s.
🎙️ "He sends Gill the wrong way. Bottom corner. One–nil."
🔊 A single sharp hit, then let it ring.
📝 TIER 1 at 2:46: **FRANCE 1–0 PARAGUAY** — centered. 4s.

**SCENE 17 — 2:56–3:08 (12s)** · MOURNFUL grade
🖼️ STILL A: @paraout Group of four Paraguay figures slowly walking back toward the center circle after the goal, shoulders slightly dropped, heads not fully down but no urgency in posture, faces turned away or in shadow. [STYLE]
🎞️ PULL 1.10 → 1.00 over 12s.
🎙️ "For a team built entirely around not conceding, there is no coming back from that."

**SCENE 18 — 3:08–3:22 (14s)** · WARM grade
🖼️ STILL A: @paragk Composite double-save moment: Gill in the middle of a sharp second reaction save, body twisted low, one glove punching a ball away while the first parried ball is still visible as a soft blur near the post. Warm amber energy. [STYLE]
🎞️ SMASH 1.00 → 1.30 over 1.5s.
🎙️ "Deep into stoppage time, Mbappé gets one more chance. Gill saves it. The ball falls straight back to him. Gill saves it again."

**SCENE 19 — 3:22–3:32 (10s)** · MOURNFUL grade
🖼️ STILL A: @mbappe-symbolic @paragk Two figures near the center circle at the final whistle: the France taker already turning and walking away without extending a hand, Gill standing still, body facing him but head slightly turned. Distance between them. [STYLE]
🎞️ HOLD.
🎙️ "At the final whistle, Mbappé doesn't shake his hand. Some losses still come with respect owed. This one, apparently, didn't."

---

## ACT 5 — WHAT IT MEANS

**SCENE 20 — 3:32–3:44 (12s)** · MONOCHROME grade
🖼️ STILL A: Pure monochrome. Sequential visual: goalkeeper-silhouette motif from Video #1 (dark dive against bright floodlight) dissolving into the same silhouette shape but in today's warmer dive pose, both faces lost in pure black. Soft dissolve edge, memory-like quality. [STYLE]
🎞️ PUSH 1.00 → 1.06 over 12s.
🎙️ "Eleven days ago, a penalty made this goalkeeper a national symbol. Today, a different kind of penalty ended his tournament."

**SCENE 21 — 3:44–3:54 (10s)** · MOURNFUL grade
🖼️ STILL A: Wide empty shot of Philadelphia Stadium after the final whistle: vast green pitch, thinning crowd as dark silhouettes, soft residual heat distortion still visible in the air, goalposts empty. Quiet, desolate atmosphere. [STYLE]
🎞️ HOLD.
🎙️ "Not a shootout this time. Just one kick, from one of the best to ever take one."

**SCENE 22 — 3:54–4:06 (12s)** · WARM grade
🖼️ STILL A: Symbolic lineage motif: three sequential anonymous goalkeeper silhouettes fading into one another (Chilavert-era pose, Villar-era pose, then modern Gill dive), arranged left to right against a soft amber-lit stadium wall, closing the visual loop. [STYLE]
🎞️ PUSH 1.00 → 1.08 over 12s.
🎙️ "It doesn't erase what he did against Germany. If anything, it confirms it — the only team that beat this wall all tournament was one of the two best in the world."
📝 TIER 1 at 3:54: **FRANCE 1–0 PARAGUAY · Round of 16** — centered. 4s.

**SCENE 23 — 4:06–4:16 (10s)** · MOURNFUL grade
🖼️ STILL A: @paraout Group of Paraguay figures walking unhurriedly off the pitch toward the tunnel, heads up rather than down, faces turned away or in soft shadow, posture upright. Soft stadium lights, empty pitch behind them. [STYLE]
🎞️ HOLD.
🎙️ "Paraguay go home in the round of sixteen — one round further than their best World Cup in sixteen years."

**SCENE 24 — 4:16–4:20 (4s)** · MOURNFUL grade
📝 TIER 1 at 4:16: **THE SAME COIN** — centered. 4s.

---

## OUTRO / CTA

**SCENE 25 — 4:20–4:32 (12s)** · WARM grade
🖼️ STILL A: Clean end-screen plate design: dark teal background with subtle film grain and soft amber accent light from lower left. Channel branding, space reserved for next-video thumbnail, subscribe prompt text in cream. [STYLE]
🎞️ HOLD.
🎙️ "If you want the stories the highlight reels skip — the walls that hold, and the ones that finally don't — this is the channel. The next one's already coming."
📝 TIER 1 at 4:20: **SUBSCRIBE FOR MORE** — centered. 4s.

---

## PRODUCTION NOTES

- **Runtime as scripted:** ~4:32 (272s) — matches the source doc's timecodes exactly. Source doc explicitly flags this as short of the 8–9 min target; built as-is per user instruction, expansion is a separate future step.
- **VO ported verbatim** from the source shot list.
- **Scenes 3 and 24** are text-only title cards — no pre-baked background image existed in the source assets for this project (unlike silenced-goalkeeper/one-match-short), so these render via `buildTextCard`'s black-background fallback rather than an image-backed card.
- **HEAT grade** mapped to WARM (see header note) — no new regrade preset was added.
- **Image variant:** "_2" (updated) variant used for every scene that had one; base-only for S5, S7, S13, S14, S15.
- **Captions, not Tier 1/Tier 2:** matches established Underdog Archive design — full-sentence running captions from real VO via Whisper. The 📝 lines above are parsed but inert unless `mergeCaptions()` is changed to re-include them.
- **Voice:** Kokoro `am_adam`.
