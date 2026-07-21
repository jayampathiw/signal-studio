# SHOT LIST v2 (IMAGE-FIRST) — "The Fifth Match | Mexico's Fortress Falls"
### The Underdog Archive — Video #5 candidate · Stills + Ken Burns pipeline

**TITLE:** The Fifth Match | Mexico's Fortress Falls
**TARGET_DURATION_SEC:** 306
**PIPELINE:** Every scene is built from 1 generated STILL IMAGE animated in the editor (Ken Burns push/pull/smash, static holds). Ported from `temp/new/Mexico's World Cup Exit at the Azteca/SHOT_LIST_The_Fifth_Match_UPDATED.md` into this codebase's parser syntax — same porting approach as same-coin/silenced-goalkeeper/one-match-short/son-also-saves.
**ASSET COUNT:** 28 generated stills across 28 scenes, clean 1:1 mapping (no duplicate variants in this source folder, unlike same-coin). Scenes 3 and 27 are pre-baked title-card graphics with real background art.
**SCOPE NOTE:** The source shot list's own production notes flag this as the third script in a row landing short of the 8–9 min target (~5:06 as scripted) and recommend budgeting 45–50 scenes going forward. Per explicit user instruction, built as-is at the scripted length.
**GRADE NOTE:** The source doc introduces a new STORM grade (dark storm clouds, rain-streaked light, pre-match thunderstorm) that this codebase's `motion.js` has no preset for — mapped to COLD here (closest available cool/teal-leaning preset). Flagged, not silently dropped.
**VERIFIED FACTS SOURCE:** VO ported verbatim from the source shot list (FIFA match centre, ESPN, Al Jazeera, Sky Sports, NBC Sports, NPR — cross-checked, minute markers per FIFA's official match report per the source doc).
**Voice:** Kokoro `am_adam`, matching the established Underdog Archive default.

---

## SECTION A — MASTER CONSISTENCY BIBLE

**@mexout** — Mexico outfield: green shirt, white shorts, anonymous, back/three-quarter turned.
**@mexgk** — Mexico goalkeeper (Raúl Rangel): contrasting keeper kit, face in shadow.
**@engout** — England outfield: white shirt, navy shorts, anonymous.
**@enggk** — England goalkeeper (Jordan Pickford): contrasting keeper kit, face in shadow.

**[STYLE]** — Cinematic, dramatic, low-key lighting. Desaturated palette, cool teal shadows, warm amber/copper mid-tones and highlights. Slight film grain. Shallow depth of field. Anonymous/stylized figures — faces always in deep shadow or turned away, no recognizable real player faces. Stadium at dusk/night, moody. 16:9.

---

## SECTION B — MOTION LANGUAGE (editor-side)

- **PUSH:** 1.00→1.08–1.15, default move. **PULL:** 1.15→1.00, contextual reveals. **SMASH:** 1.00→1.30 in ~1.5s, goals/saves/red card only. **HOLD:** static, deliberate stillness.

## SECTION C — COLOUR GRADE SYSTEM

**STORM** (mapped to COLD, see note above): dark clouds, rain, pre-match delay. **WARM:** amber push — Mexico's dominance, crowd energy, fightback goals. **COLD:** teal shadows — England's goals, the red card, the tightening vice. **MOURNFUL:** desaturated grey — full time, elimination. **MONOCHROME:** the 1986 historical aside (used sparingly, 2 scenes only).

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

**SCENE 1 — 0:00–0:12 (12s)** · MOURNFUL grade
🖼️ STILL A: @mexout A single anonymous Mexico figure (green shirt, white shorts) sits alone on the rain-damp pitch near the centre circle, head buried in both hands, body slumped forward in exhaustion and defeat. Face completely hidden in shadow. Estadio Azteca stands blur into soft bokeh under floodlights. [STYLE]
🎞️ HOLD.
🎙️ "This stadium had not lost a World Cup match in its own country. Not once. Not ever."

**SCENE 2 — 0:12–0:26 (14s)** · COLD grade
🖼️ STILL A: Moody exterior establishing shot of Estadio Azteca under a violent pre-match thunderstorm. Massive dark storm clouds churn above the distinctive stadium silhouette, heavy rain streaking diagonally across the frame, distant lightning illuminating the sky in brief cold-white flashes. Deep charcoal and indigo tones. [STYLE]
🎞️ PUSH 1.00 → 1.06 over 14s.
🎙️ "Tonight it did — and it started with a storm that delayed kickoff by an hour, as if the sky itself knew what was coming."

**SCENE 3 — 0:26–0:30 (4s)** · MOURNFUL grade
📝 TIER 1 at 0:26: **THE FIFTH MATCH** — centered. 4s.

---

## ACT 1 — THE LINEAGE

**SCENE 4 — 0:30–0:42 (12s)** · MONOCHROME grade
🖼️ STILL A: Vintage-toned exterior of Estadio Azteca as it appeared in the mid-1980s, black-and-white archival aesthetic with heavy film grain and slight vignette. The stadium stands under a pale overcast sky. [STYLE]
🎞️ PUSH 1.00 → 1.08 over 12s.
🎙️ "The last time Mexico hosted this tournament, in 1986, they reached the quarterfinal here. It remains the only time they've gone that far."

**SCENE 5 — 0:42–0:53 (11s)** · MONOCHROME grade
🖼️ STILL A: Abstract calendar/clock motif in pure monochrome: a large circular clock face or flipping calendar pages accelerate from "1986" toward "2026", numbers and years blurring past. Heavy film grain, high-contrast black-and-white. [STYLE]
🎞️ PUSH 1.00 → 1.08 over 11s.
🎙️ "Forty years. Eight more attempts. Eight more exits at exactly this round — the round of sixteen."
📝 TIER 1 at 0:42: **8 Round-of-16 exits since 1986.** — centered. 4s.

**SCENE 6 — 0:53–1:04 (11s)** · WARM grade
🖼️ STILL A: High-angle wide shot of a packed Estadio Azteca on match night, sea of green-shirted supporters filling every tier, flags and scarves waving under warm amber floodlights. Distinctive bowl architecture clearly readable. [STYLE]
🎞️ PULL 1.10 → 1.00 over 11s.
🎙️ "This time, hosting again, with eighty thousand people behind them — this felt like the year the wait might finally end."

---

## ACT 2 — THE SETUP

**SCENE 7 — 1:04–1:16 (12s)** · WARM grade
🖼️ STILL A: Clean graphic motif over soft out-of-focus turf and stadium lights: a minimalist statistical plate, subtle animated lines or a faint shield icon, warm amber grade. [STYLE]
🎞️ PUSH 1.00 → 1.06 over 12s.
🎙️ "Mexico arrived unbeaten, having not conceded a single goal across four matches."
📝 TIER 1 at 1:04: **4 MATCHES · 0 GOALS CONCEDED** — centered. 4s.

**SCENE 8 — 1:16–1:26 (10s)** · COLD grade
🖼️ STILL A: Split-composition still: left, a block of deep navy and white (England colours) against soft out-of-focus green field; right, a block of Mexico green. The two colour fields face each other like opposing walls. [STYLE]
🎞️ HOLD.
🎙️ "Waiting for them: England, still chasing a first major title in sixty years."
📝 TIER 1 at 1:16: **MEXICO 0–0 ENGLAND** — centered. 3s.

---

## ACT 3 — THE MATCH

**SCENE 9 — 1:26–1:38 (12s)** · WARM grade
🖼️ STILL A: @mexout Dynamic mid-shot: three anonymous Mexico figures in flowing attacking possession, bodies leaning forward, faces turned away or in deep shadow. One player drives with the ball while teammates surge into space. Warm amber floodlights. [STYLE]
🎞️ PUSH 1.00 → 1.08 over 12s.
🎙️ "For thirty-five minutes, Mexico did what they'd done all tournament — controlled the game."

**SCENE 10 — 1:38–1:48 (10s)** · COLD grade
🖼️ STILL A: @engout Dramatic low-angle still: an anonymous England figure rises for a powerful header, body arched, face completely in shadow. A whipped cross hangs in the air; the ball is just about to enter the net. Green wall of the Azteca stands behind. [STYLE]
🎞️ SMASH 1.00 → 1.25 over 1.5s.
🎙️ "Then, the thirty-sixth minute. A cross. A header. England lead."
📝 TIER 1 at 1:38: **ENGLAND 1–0 · 36'** — centered. 3s.

**SCENE 11 — 1:48–1:58 (10s)** · COLD grade
🖼️ STILL A: @engout Near-identical framing to Scene 10 for deliberate rhythmic repetition: another anonymous England figure finishes a swift second strike into the net, body leaning into the shot, face turned away into shadow. Same low angle, same Azteca-stands background. [STYLE]
🎞️ SMASH 1.00 → 1.25 over 1.5s.
🎙️ "Two minutes later, it happens again. Two–nil. The stadium goes silent in under a hundred seconds."
📝 TIER 1 at 1:48: **ENGLAND 2–0 · 38'** — centered. 3s.

**SCENE 12 — 1:58–2:10 (12s)** · WARM grade
🖼️ STILL A: @mexout Explosive close-range strike: an anonymous Mexico figure powers a low drive into the bottom corner, body fully extended, face hidden in shadow. Teammates begin to erupt in the mid-ground. Warm amber light flares off the net. [STYLE]
🎞️ SMASH 1.00 → 1.30 over 1.5s.
🎙️ "But Mexico don't fold. Four minutes later, Julián Quiñones crashes one home. Two–one at the break."
📝 TIER 1 at 1:58: **ENGLAND 2–1 · 42'** — centered. 3s.

**SCENE 13 — 2:10–2:22 (12s)** · COLD grade
🖼️ STILL A: @engout @mexout Tense mid-shot of the red-card incident: an anonymous England defender lunges into a studs-up challenge on a Mexico player, both faces completely in shadow. A referee figure reaches toward his pocket while a faint VAR review graphic glows. [STYLE]
🎞️ PUSH 1.00 → 1.08 over 12s.
🎙️ "Early in the second half, an England defender goes studs-up into an ankle. VAR sends the referee to the screen."

**SCENE 14 — 2:22–2:32 (10s)** · COLD grade
🖼️ STILL A: @engout Stark still of the red-card moment: a referee's arm raised high, holding a bright red card aloft against the dark Azteca night. An anonymous England figure walks slowly away toward the tunnel, head bowed, face in deep shadow, alone. [STYLE]
🎞️ HOLD.
🎙️ "Straight red. Fifty-fourth minute. England, down to ten men, for the next thirty-six minutes and more."
📝 TIER 1 at 2:22: **ENGLAND — RED CARD, 54'** — centered, red accent. 4s.

**SCENE 15 — 2:32–2:44 (12s)** · WARM grade
🖼️ STILL A: High-energy crowd reaction shot: a wall of green-shirted supporters rising as one, arms raised, mouths open in a collective roar under warm amber lights. Flags and scarves blur with motion. [STYLE]
🎞️ PUSH 1.00 → 1.08 over 12s.
🎙️ "Eighty thousand people felt the momentum turn. This was the moment. This was supposed to be Mexico's game now."

**SCENE 16 — 2:44–2:56 (12s)** · COLD grade
🖼️ STILL A: @mexgk @engout Penalty-box foul motif: an anonymous Mexico goalkeeper makes contact with an onrushing England attacker inside the area; both faces in deep shadow. A clear penalty-spot indication on the grass. Vast Azteca stands loom behind. [STYLE]
🎞️ PUSH 1.00 → 1.06 over 12s.
🎙️ "Instead, six minutes later, Mexico's own goalkeeper fouls Anthony Gordon in the box. Penalty, to England. Down a man."

**SCENE 17 — 2:56–3:06 (10s)** · COLD grade
🖼️ STILL A: @engout Clinical penalty still: an anonymous England figure strikes the ball cleanly from the spot into the net, body calm and balanced, face turned away into shadow. The net bulges. [STYLE]
🎞️ SMASH 1.00 → 1.25 over 1.5s.
🎙️ "Kane doesn't blink. Three–one. With ten men."
📝 TIER 1 at 2:56: **ENGLAND 3–1 · 60'** — centered. 3s.

**SCENE 18 — 3:06–3:18 (12s)** · WARM grade
🖼️ STILL A: @mexout Mexico's answering penalty: an anonymous Mexico figure steps up and drives the ball low into the corner, body leaning into the strike, face completely in shadow. Teammates begin to celebrate behind him. [STYLE]
🎞️ SMASH 1.00 → 1.30 over 1.5s.
🎙️ "Nine minutes later, Mexico win their own penalty. Raúl Jiménez, ice cold, makes it three–two."
📝 TIER 1 at 3:06: **ENGLAND 3–2 · 69'** — centered. 3s.

**SCENE 19 — 3:18–3:30 (12s)** · COLD grade
🖼️ STILL A: @engout Desperate defensive siege: ten anonymous England figures compressed into a tight wall near their own goal line, bodies low, faces in shadow, while high crosses rain in from the Mexican attack. Claustrophobic frame. [STYLE]
🎞️ PUSH 1.00 → 1.08 over 12s.
🎙️ "Thirty minutes left. Ten men. One goal in it. England spend the rest of the match simply surviving."

---

## ACT 4 — THE HOLD

**SCENE 20 — 3:30–3:42 (12s)** · WARM grade
🖼️ STILL A: @mexout Near-miss still: an anonymous Mexico attacker rises for a powerful header inside the England box; the ball drifts agonisingly just over the crossbar. Collective disbelief in surrounding players' body language. [STYLE]
🎞️ PUSH 1.00 → 1.08 over 12s.
🎙️ "Mexico throw everything forward. A header, agonizingly wide. A shot that grazes the post."

**SCENE 21 — 3:42–3:52 (10s)** · COLD grade
🖼️ STILL A: @enggk Heroic save: anonymous England keeper dives full-stretch to his right, gloved hands pushing the ball away from goal at the last instant. Face completely in shadow. [STYLE]
🎞️ SMASH 1.00 → 1.25 over 1.5s.
🎙️ "Pickford, criticized all tournament, produces the game of his life when it matters most."

**SCENE 22 — 3:52–4:04 (12s)** · MOURNFUL grade
🖼️ STILL A: Full-time whistle still: the referee's arm raised to his lips, whistle at mouth, against the blurred backdrop of Estadio Azteca. Several anonymous players collapse to the turf or stand frozen in the foreground. [STYLE]
🎞️ HOLD.
🎙️ "The whistle finally comes. Ten men. Thirty-six minutes and more. England survive."
🔇 No caption on this beat — let the final whistle land silently, per the source doc's own instruction.

---

## ACT 5 — WHAT IT MEANS

**SCENE 23 — 4:04–4:16 (12s)** · MOURNFUL grade
🖼️ STILL A: Wide, melancholic shot of Estadio Azteca emptying after the final whistle. Floodlights still on but the stands steadily draining; small groups of green-shirted supporters file out in silence. An anonymous figure walks slowly toward the tunnel. [STYLE]
🎞️ HOLD.
🎙️ "First-ever home defeat at a World Cup, in this stadium's entire history. Of all the nights for it to happen."
📝 TIER 1 at 4:04: **ENGLAND 3–2 MEXICO · MEXICO ELIMINATED** — centered. 4s.

**SCENE 24 — 4:16–4:28 (12s)** · MONOCHROME grade
🖼️ STILL A: Faded monochrome return to the 1986 motif: a soft, ghostly image of Estadio Azteca under 1980s lighting, slightly overexposed and grainy, as if a memory. Pure black-and-white with heavy film grain. [STYLE]
🎞️ PULL 1.10 → 1.00 over 12s.
🎙️ "Forty years since Mexico last reached a fifth match. This tournament, hosting again, with everything in their favor — still didn't move the number."

**SCENE 25 — 4:28–4:40 (12s)** · WARM grade
🖼️ STILL A: Symbolic passing-the-torch still: an older anonymous figure in a dark tracksuit hands a simple object (a training bib or folded green shirt) to a younger anonymous figure also in training gear. Both faces turned away or in soft shadow. Soft warm side-lighting, intimate and quiet. [STYLE]
🎞️ HOLD.
🎙️ "The manager stepped down after the final whistle. His replacement: a former captain of this same team, taking over for what comes next."

**SCENE 26 — 4:40–4:50 (10s)** · WARM grade
🖼️ STILL A: Returning crowd motif, warmer and more defiant than the earlier grief: a sea of green inside Estadio Azteca, supporters still standing, some with arms around each other, faces turned upward in quiet pride rather than pure despair. [STYLE]
🎞️ PUSH 1.00 → 1.06 over 10s.
🎙️ "Eighty thousand people didn't get the ending they came for. They still didn't leave believing it was over."

**SCENE 27 — 4:50–4:54 (4s)** · MOURNFUL grade
📝 TIER 1 at 4:50: **THE FIFTH MATCH** — centered. 4s.

---

## OUTRO / CTA

**SCENE 28 — 4:54–5:06 (12s)** · WARM grade
🖼️ STILL A: Clean end-screen plate: dark background with subtle film grain, channel watermark, a clear subscribe prompt, and an empty rectangular space for the next-video thumbnail. Warm amber accent lighting. [STYLE]
🎞️ HOLD.
🎙️ "If you want the stories the highlight reels skip — the fortresses that finally fall, and the ones still waiting for their moment — this is the channel. The next one's already coming."
📝 TIER 1 at 4:54: **SUBSCRIBE FOR MORE** — centered. 4s.

---

## PRODUCTION NOTES

- **Runtime as scripted:** ~5:06 (306s) — matches the source doc's timecodes exactly. Source doc explicitly flags this as the third short-runtime script in a row; built as-is per user instruction.
- **VO ported verbatim** from the source shot list.
- **Scenes 3 and 27** are pre-baked title-card graphics (`S03-A.jpg` / `S27-A.jpg`, real background art) — zero drawtext duplicate, same convention as silenced-goalkeeper's S3/S50.
- **STORM grade** mapped to COLD (see header note) — no new regrade preset was added.
- **S22 has no caption** per the source doc's own explicit instruction ("let the final whistle land silently") — mirrors silenced-goalkeeper's S38 silent-beat pattern.
- **S10/S11 deliberate visual repetition** (near-identical framing) sells the "98 seconds apart" detail — this is intentional rhythm per the source doc, not a duplicated-asset mistake.
- **Captions, not Tier 1/Tier 2:** matches established Underdog Archive design — full-sentence running captions from real VO via Whisper. The 📝 lines above are parsed but inert unless `mergeCaptions()` is changed to re-include them.
- **Voice:** Kokoro `am_adam`.
