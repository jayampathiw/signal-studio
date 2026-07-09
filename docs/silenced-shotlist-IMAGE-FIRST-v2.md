# SHOT LIST v2 (IMAGE-FIRST) — "Silenced: The Night a Goalkeeper Sent Germany Home"
### South American Football & Diaspora Stories — Video #1 · Stills + Ken Burns pipeline
### TEMPLATE VERSION: This file is now the master spec for ALL Underdog Archive videos.
### New additions vs original v2 (from Video #2 Egypt production learnings) marked ★

---

**TITLE:** Silenced | The Night a Goalkeeper Sent Germany Home
**TARGET_DURATION_SEC:** 543
**PIPELINE:** Every scene is built from 1–3 generated STILL IMAGES animated in the editor (Ken Burns push/pull, 2.5D parallax, smash cuts). Video generation is used for ZERO scenes by default. Scenes with existing approved clips are marked **KEEP-VIDEO (optional)** — reuse if they pass the kit check; do not regenerate them.
**ASSET COUNT:** ~62 generated stills across 44 generated scenes. Scenes 3, 14, 21-card, 30-stamp, 50, 51 are editor builds (no generation). Scenes 43 and 44 are asset reuses. 5 kit-reference sheets generated separately before the batch.
**BATCH INPUT:** The TurboFlow `.txt` import file (`turboflow_prompts.txt`) is the machine-submission document. This shot list is the human reference document. Both must stay in sync.

---

## SECTION A — MASTER CONSISTENCY BIBLE

**The #1 defect in v1 output was kit drift: colors and styles changed between generations because the prompts never specified them.** Fix it in two layers:

**Layer 1 — Reference Elements (do this FIRST, before any bulk generation):**
1. Generate ONE "kit reference sheet" image per token below (single anonymous figure, front view, neutral pose, full kit visible, plain dark background).
2. Approve it manually against the spec.
3. Save each approved image to TurboFlow Image Library with the exact @tag shown.
4. Embed the matching @tag(s) in every scene prompt. Prompt text alone will NOT hold consistency across 60+ images.

**Layer 2 — Verbatim spec blocks (the [TOKEN] definitions below):**
These are pasted verbatim into every prompt in the TurboFlow .txt file wherever a character appears. The shot list uses shorthand [TOKENS] for readability. The batch file uses full text.

**[PY-KIT] / @pyout** — Paraguay outfield: short-sleeved football shirt with bold red and white vertical stripes (five red stripes on a white base), plain royal-blue shorts, royal-blue socks with one white band at the top. No badges, no crests, no sponsor logos, no numbers.

**[DE-KIT] / @deout** — Germany outfield: matte charcoal-black football shirt with thin white trim on the collar and sleeve cuffs, plain black shorts, black socks. No badges, no crests, no logos, no numbers.

**[GK-GILL] / @gkgill** — Paraguay goalkeeper (Gill figure): deep amber-gold long-sleeved goalkeeper jersey (solid amber-gold, no patterns, no logos), plain black goalkeeper shorts, black socks, pale grey goalkeeper gloves. Face ALWAYS in shadow, silhouette, or turned away. No badges, no logos.

**[DE-GK] / @degk** — Germany goalkeeper: dark forest-green long-sleeved goalkeeper jersey, plain black shorts, plain black gloves. Face in shadow or turned away. No badges, no logos.

**[PY-GK-90s] / @gk90s** — 1990s Paraguay keeper (Chilavert-era figure, anonymous): boxy oversized 1990s-cut long-sleeved goalkeeper jersey with a bold abstract geometric print in navy blue and rust-orange, plain black shorts, chunky cream-white 1990s goalkeeper gloves. Face in shadow. No badges, no logos.

**[BALL] / @ball** — a classic white match football with dark navy pentagonal panels and a thin amber ring detail. The SAME ball in every image.

**[STADIUM] / @stadium** — a vast modern two-tier stadium at night, roughly half-empty stands, deep navy-blue shadows, banks of white floodlights with visible atmospheric haze, no signage, no logos, no branded flags.

**[STYLE]** — append to EVERY prompt: Cinematic film still, 35mm, shallow depth of field, slight film grain, desaturated moody grade with deep navy-teal shadows and warm amber highlights, low-key dramatic lighting, anonymous stylized figures with no recognizable faces, 16:9.

★ **Kit decision rationale (decided once, before generating, never revisited mid-production):**
These are NOT the literal match kits. Germany is in charcoal-black (not their real white) for silhouette legibility against Paraguay's white-based stripes, and it makes the "dark kit" defeat imagery literal. Paraguay is in warm red/white (not their actual navy) to map to the channel's amber protagonist palette. Kit color is the ONLY team identifier in anonymous silhouette footage — it must never vary between images.

---

## SECTION B — MOTION LANGUAGE (editor-side, applies to all stills)

- **PUSH:** scale 1.00 → 1.08–1.15 over the scene duration, Bézier ease in/out. Default move for most scenes.
- **PULL:** scale 1.15 → 1.00. Reserved for contextual reveals — isolation, aftermath, scale reveals.
- **SMASH:** scale 1.00 → 1.30 in ~1.5s, synced to a low-frequency audio hit. Goals and shock moments only.
- **PARALLAX:** cut the subject onto an alpha layer; pan the background 30% slower than the foreground. Reserve for hero shots (marked in scene entries).
- **PATTERN INTERRUPT RULE:** attention degrades every 5–8s. Any scene ≥10s gets a second still (A/B cut), a text-overlay drop, or a hard SFX hit mid-scene. Never one static still + one slow zoom for 12+ seconds — that is the static-slideshow look the monetization policy flags.
- **Atmosphere (editor):** layer one continuous particle/grain pass (dust motes, haze, film grain) over ALL scenes to unify disparate generations.
- **Audio (editor):** master to -14 LUFS integrated; VO at -12 to -15 dB; music bed carved to -22 to -25 dB.
- **Transformation defense:** stills alone are not enough for monetization. The human editorial layer — Ken Burns curves, A/B cut rhythm, parallax plates, unified grain/particle pass, -14 LUFS audio engineering — is what separates this from an "inauthentic slideshow" demonetization flag. Never skip the editorial layer.

---

★ ## SECTION C — COLOUR GRADE SYSTEM

Named grades used across this video. Apply consistently in the editor.

**WARM (default):** deep navy-teal shadows + warm amber highlights. Paraguay protagonist scenes, victories, celebration. The channel's default emotional register.

**COLD:** steel-blue desaturated. Germany dominates, scores, comeback mounting. The antagonist register.

**MONOCHROME:** near-monochrome, barely-there warmth. Maximum tension — the penalty spot, the VAR moment, sudden death. Strip color to isolate the emotional weight.

**MOURNFUL:** warm amber pulled back, heavy, flat. Aftermath, reflection, defeat processed. Warm but drained.

★ **Grade transition map for this video:**
- WARM: 0:00–3:29 (Paraguay's lineage and the goal)
- COLD begins: 3:30–3:45 (Germany equalise)
- COLD dominant: 3:46–5:09 (siege, VAR, disallowed goal)
- MONOCHROME: 5:10–5:17 (goal disallowed, silence)
- WARM returns: 5:18–7:05 (shootout — Paraguay's moment)
- COLD interrupts: specific Germany score moments within shootout
- MOURNFUL WARM: 7:06–9:03 (defeat of Germany, reflection, what it means)

---

★ ## SECTION D — TEXT OVERLAY SYSTEM (Remotion implementation)

**ALL text overlays are built in Remotion — NEVER generated inside images.**
Reasons: generated text is unreliable (misspellings, wrong font, inconsistent weight); baked-in text cannot be edited without regenerating the image; Remotion does this natively and precisely.

Every image prompt for a scene with a text overlay must specify which third of the frame to leave as negative space (left third / right third / bottom third) so the card does not fight the composition.

**Typeface:** Bebas Neue (primary — import via Google Fonts in Remotion). Montserrat Bold as fallback. All caps. Wide tracking 0.08–0.12em.

**Colors:**
- Body text: `#f2ece1` (cream-white)
- ONE emphasis word per card only: `#e8a559` (amber) — never the whole card
- Background layer (where legibility requires it): semi-transparent navy `#16243a` at 60% opacity

**Size:** minimum 80px. Fill at least 20% of frame width. NEVER small, NEVER dull. This was the core failure in Video #1 — cards were too small and too low-contrast to read.

**Animation:** opacity 0→1 over 0.4s with letter-spacing expand from 0.04→0.12em simultaneously. No slides. No wipes. Letters track open as they appear.

**Duration:**
- Dramatic reveal cards: 4–5 seconds
- Chapter label cards: 2–3 seconds
- Title cards (full screen): 4 seconds

**Placement:** bottom third or left/right third, matched to the image's negative space zone. Never centered over the main subject.

**The cardinal rule:** the VO line BEFORE a card sets it up and never reads the card text aloud. The VO line AFTER never repeats what the card said. Never narrate AND card the same stat simultaneously — pick one.

★ **Text overlay schedule — complete reference for editor assembly:**

| Scene | Timecode | Card Text | Amber word | Duration | Negative space zone |
|-------|----------|-----------|------------|----------|---------------------|
| S12 | 2:07 | 16 YEARS | 16 | 3s | right third |
| S14 | 2:24 | 12TH IN THE WORLD vs 34TH | — | 3s | editor graphic |
| S21 | 3:40 | PARAGUAY'S FIRST EVER WORLD CUP KNOCKOUT GOAL | FIRST EVER | 5s | over celebration still |
| S25 | 4:22 | 21 SHOTS · 16 CORNERS | 21 | 3s | drops with A/B cut |
| S30 | 5:13 | GOAL DISALLOWED | — | 4s | editor stamp |
| S40 | 7:00 | PARAGUAY 4–3 GERMANY | 4–3 | 4s | right third |
| S48 | 8:30 | ROUND OF 16 — FIRST TIME SINCE 2010 | 2010 | 3s | bottom third |

---

## Per-scene format:
🖼️ STILL(s) — image prompt(s) for generation
🎞️ MOTION — editor-side Ken Burns / parallax instruction
🎙️ VO — continuous narration (TTS-normalized, numerals written out)
🔊 AUDIO — sound design cue
📝 TEXT — Remotion text overlay (Bebas Neue, white, large — see Section D)

---

## COLD OPEN

**SCENE 1 — 0:00–0:12 (12s)** · **KEEP-VIDEO (optional)**
🖼️ STILL A: Extreme wide shot inside [STADIUM]; the frame is almost entirely black. One floodlight mast glows at the upper-right third with a thin volumetric beam and haze; a faint outline of empty seat banks below it. The left two-thirds of the frame is pure darkness — negative space for grade and hum. [STYLE]
🎞️ PUSH 1.00 → 1.10 over 12s toward the floodlight.
🎙️ "Germany had not lost a penalty shootout at a World Cup in fifty years."
🔊 Low rising stadium hum — the swell is the pattern interrupt.

**SCENE 2 — 0:12–0:27 (15s)** · **KEEP-VIDEO (optional)**
🖼️ STILL A: Wide shot from behind the goal net: a lone goalkeeper in [GK-GILL] standing in the center of the goalmouth, tiny against the vast half-empty stands of [STADIUM] at dusk. Keeper on the lower-left third intersection; empty stands fill the upper frame. Right third negative space. [STYLE]
🖼️ STILL B: Closer 85mm shot of the SAME goalkeeper in [GK-GILL] from behind, waist-up, gloves hanging at his sides, out-of-focus floodlights beyond. Left third negative space. [STYLE]
🎞️ A: PUSH 1.00 → 1.08 (0:12–0:20). Hard cut to B on "…never heard of" (0:20–0:27), micro-PUSH.
🎙️ "Tonight, in a half-empty stadium outside Boston — a country with no coastline, no superstar, and a goalkeeper most of the world had never heard of… ended that streak."
🔊 Hum cuts to dead silence on the final word — the cut + silence = pattern interrupt.

**SCENE 3 — 0:27–0:31 (4s)** · **EDITOR BUILD — no generation**
📝 TITLE CARD: **SILENCED** — white on black, Bebas Neue, full screen, slow letter-track fade-in. Hold 4 seconds. Cut to black.

---

## ACT 1 — THE LINEAGE

**SCENE 4 — 0:31–0:43 (12s)** · **KEEP-VIDEO (optional)**
🖼️ STILL A: Top-down stylized map of South America rendered like aged slate in deep navy, country borders as thin amber lines. Brazil and Argentina softly glow warm gold; Paraguay is small, landlocked, and unlit at the center. No text labels. [STYLE]
🖼️ STILL B: Identical map, but Paraguay now edge-lit with a faint rust-orange glow; Brazil and Argentina dimmed. [STYLE]
🎞️ A: PUSH 1.00 → 1.15 aimed at Paraguay (0:31–0:39). Cut to B on "this country first" (0:39–0:43).
🎙️ "To understand what happened tonight, you have to understand something about this country first."

**SCENE 5 — 0:43–0:55 (12s)**
🖼️ STILL A: The same navy map held on Paraguay; around the map edges, faint translucent cream silhouettes of footballers — one frozen mid-bicycle-kick, one mid-dribble — fading like ghosts. Silhouettes only, no faces, no identifiable kits. Right third negative space. [STYLE]
🎞️ PULL 1.10 → 1.00 over 12s; add a slow opacity fade on the ghost layer as the pattern interrupt (editor).
🎙️ "Paraguay has never been a nation of artists. It didn't give the world a Pelé, or a Maradona, or a Messi."

**SCENE 6 — 0:55–1:06 (11s)** · *(v1 video NSFW false-flagged — concrete split-frame composition avoids that)*
🖼️ STILL A: A single frame split diagonally from upper-left to lower-right by a hard clean seam. Upper-left half: a footballer silhouette frozen in a flowing dribble, surrounded by warm golden bokeh and drifting confetti light. Lower-right half: a bare grey concrete wall texture in cold flat blue light. Hard clean diagonal seam, no blending. [STYLE]
🎞️ Slow lateral pan upper-left → lower-right across the seam over 11s; grade cools as the pan crosses it (editor).
🎙️ "While Brazil was painting and Argentina was dreaming, Paraguay was doing something far less glamorous — and far more stubborn."

**SCENE 7 — 1:06–1:13 (7s)**
🖼️ STILL A: Macro close-up of a weathered grey stone wall filling the entire frame, raking side-light picking out every crack. [STYLE]
🖼️ STILL B: A goalkeeper in [GK-GILL] in a braced ready stance — knees bent, arms wide, gloves open — front-on, face in full shadow, the stone wall out-of-focus behind him. Right third negative space. [STYLE]
🎞️ A holds 3s; SMASH cut to B on the drum hit (1.00 → 1.30 in 1.5s); micro-PUSH on B.
🎙️ "It was building walls."
🔊 A low, heavy drum hit on the cut.

**SCENE 8 — 1:13–1:25 (12s)**
🖼️ STILL A: Low-angle chest-up portrait of a goalkeeper figure in [PY-GK-90s], gloves clenched together in front of his chest, face completely in shadow under harsh floodlight backlight, breath visible as vapor, night-stadium bokeh behind. Left third negative space. [STYLE]
🎞️ PUSH 1.00 → 1.12 over 12s; single deep bass pulse at the name (interrupt).
🎙️ "For thirty years, the most famous man in Paraguayan football wasn't a striker. He was a goalkeeper — José Luis Chilavert."

**SCENE 9 — 1:25–1:38 (13s)**
🖼️ STILL A: Wide night shot: the goalkeeper in [PY-GK-90s] standing over [BALL] placed on the turf thirty meters from the distant goal, a defensive wall of five anonymous outfield silhouettes in plain dark kits between him and the goal. Shot from behind and left of the keeper. Right third negative space. [STYLE]
🖼️ STILL B: [BALL] frozen mid-flight, arcing toward the top corner of the goal, slight motion blur on the ball, the opposing keeper silhouette diving late, shot from behind the defensive wall. [STYLE]
🎞️ A: PUSH (1:25–1:32). Cut to B on "scored free-kicks" (1:32–1:38), micro-PUSH.
🎙️ "A keeper so fearless he scored free-kicks and penalties himself — who played like he was insulted by the idea that Paraguay should lose."

**SCENE 10 — 1:38–1:50 (12s)**
🖼️ STILL A: Waist-up shot of an anonymous player in [PY-KIT] wearing a rust-orange captain's armband, lifting his gaze upward toward the floodlights, face in shadow. Behind him, huge faded numerals "2010" projected in cream light onto dark stadium concrete. Left third negative space. [STYLE]
🎞️ PUSH 1.00 → 1.10; the projected numerals flicker once mid-scene (editor, interrupt).
🎙️ "After him came Justo Villar — who carried Paraguay to a World Cup quarter-final in twenty ten, the best run in the nation's history."

**SCENE 11 — 1:50–2:01 (11s)**
🖼️ STILL A: Extreme close-up: [BALL] frozen a hand's width past a white goal line on floodlit grass, shallow focus, COLD grade. [STYLE]
🖼️ STILL B: A goalkeeper in a plain navy long-sleeved kit (one-off 2010 keeper — navy jersey, navy shorts, no logos), shoulders dropped, head bowed, standing alone in his goalmouth, seen from behind. Somber. COLD grade. Right third negative space. [STYLE]
🎞️ A holds with micro-PUSH (1:50–1:56); cut to B on "They lost that day" (1:56–2:01).
🎙️ "They lost that day. One goal. To Spain — the team that went on to win the whole tournament."

**SCENE 12 — 2:01–2:13 (12s)** · *(v1 calendar/clock motif NSFW-flagged — replaced with concrete locker room)*
🖼️ STILL A: A dark locker room: a dark-green chalkboard carrying sixteen white hand-drawn tally marks in four groups; a single worn goalkeeper glove hangs on a hook beside the board; one bare bulb overhead. No readable text anywhere. Right third negative space. [STYLE]
🎞️ PUSH 1.00 → 1.12 toward the tally marks over 12s.
🎙️ "That was sixteen years ago. Sixteen years of being the small country the giants walk past on their way to the final."
📝 16 YEARS — Bebas Neue, amber "16", white rest, large, right third. 3s. Drops at 2:07 — pattern interrupt.

**SCENE 13 — 2:13–2:24 (11s)** · **PARALLAX hero shot**
🖼️ STILL A: A goalkeeper in [GK-GILL] stepping forward out of deep shadow into a single vertical shaft of white floodlight in a stadium tunnel, mid-stride, front-on, face in darkness, tunnel walls converging either side. Left third negative space. [STYLE]
🎞️ 2.5D PARALLAX: keeper on alpha layer, tunnel background pans 30% slower; PUSH 1.00 → 1.12.
🎙️ "And then came tonight. And a new name in that long line of walls: Orlando Gill."

---

## ACT 2 — THE SETUP

**SCENE 14 — 2:24–2:33 (9s)** · **EDITOR GRAPHIC — no generation**
🎞️ Clean motion graphic built in the editor: two plain flag silhouettes (Paraguay, Germany — flat vector, no crests) and ranking numbers facing off on a navy field.
🎙️ "Let's be honest about the gap. Germany are four-time world champions."
📝 12TH IN THE WORLD vs 34TH — Bebas Neue, white, large, centered. 3s.

**SCENE 15 — 2:33–2:45 (12s)**
🖼️ STILL A: Low-angle night shot: a small anonymous player in [PY-KIT] standing on the pitch at the lower-left third, dwarfed by an enormous looming shadow of a giant figure cast across the grass and up the stand wall to the right. Single floodlight source behind the shadow. Left third negative space. [STYLE]
🎞️ PUSH 1.00 → 1.12 toward the small figure; shadow layer darkens 10% mid-scene (editor, interrupt).
🎙️ "The bookmakers made Paraguay the longest shot of the entire round — the team least likely, on paper, to win its game."

**SCENE 16 — 2:45–2:55 (10s)**
🖼️ STILL A: Exterior wide of [STADIUM] at dusk from across an open plaza; long thin streams of tiny anonymous crowd figures filing toward the gates; warm entrance lights against a deep navy dusk sky. No signage, no logos. [STYLE]
🎞️ Slow lateral pan left → right over 10s.
🎙️ "June twenty-ninth. The first half plays out exactly the way everyone expected."

**SCENE 17 — 2:55–3:09 (14s)** · *(v1 video NSFW false-flagged on "pressing in waves" — concrete literal compositions avoid that)*
🖼️ STILL A: Elevated tactical camera above the halfway line: seven anonymous players in [DE-KIT] arranged in a wide passing shape across midfield, [BALL] at the feet of the central player; two players in [PY-KIT] positioned deep near the penalty area. Night, floodlit. Right third negative space. [STYLE]
🖼️ STILL B: Pitch-level 85mm: one midfielder in [DE-KIT] frozen at the moment of striking a pass with his instep, [BALL] just leaving his boot, two Paraguay defenders in [PY-KIT] blurred in the background. Left third negative space. [STYLE]
🎞️ A: PUSH (2:55–3:02). Cut to B on "They press" (3:02–3:09), micro-PUSH.
🎙️ "Germany take the ball and keep it — seventy-eight percent of it. They press, they probe, they wait for the goal that's supposed to be a formality."

**SCENE 18 — 3:09–3:17 (8s)**
🖼️ STILL A: [BALL] sitting alone inside the corner-arc quadrant of the pitch, extreme close-up at grass level, low angle, floodlit blade-of-grass texture in the foreground, empty dark space beyond. Held, tense stillness. [STYLE]
🎞️ Micro-PUSH 1.00 → 1.06 over 8s. Let it sit.
🎙️ "And then, minutes before half-time, the game forgets its script."

---

## ACT 3 — THE MATCH

**SCENE 19 — 3:17–3:30 (13s)** · *(v1 video kit-inconsistent — regenerate as stills)*
🖼️ STILL A: Corner-flag view: an anonymous player in [PY-KIT] planted beside the corner flag at the end of his run-up, body coiled to strike [BALL], night, stands blurred behind. Right third negative space. [STYLE]
🖼️ STILL B: The crowded penalty box frozen the instant the cross arrives: four players in [PY-KIT] and five in [DE-KIT] rising together, [BALL] hanging in the air above them, slight motion blur at the frame edges, the goalkeeper in [DE-GK] rooted on his line. Left third negative space. [STYLE]
🎞️ A: PUSH (3:17–3:23). Cut to B on "whipped in" (3:23–3:30), micro-PUSH into the crowd.
🎙️ "A corner — whipped in by Matías Galarza, a man who plays his club football right here in the United States, for Atlanta."

**SCENE 20 — 3:30–3:40 (10s)** · *(v1 video kit-inconsistent — regenerate)* · WARM→COLD grade shift
🖼️ STILL A: A leaping header frozen at the exact moment of impact: an anonymous player in [PY-KIT] rising highest above two defenders in [DE-KIT], forehead meeting [BALL], the goal frame behind them, the keeper in [DE-GK] diving low to his right. Slow-shutter energy, motion blur on limbs only. WARM grade. [STYLE]
🖼️ STILL B: Behind-goal shot through the net: [BALL] buried in the rippling side netting, the keeper in [DE-GK] grounded and beaten. WARM grade returning. [STYLE]
🎞️ A: SMASH 1.00 → 1.30 in 1.5s on the musical hit, then hold; cut to B at 3:36.
🎙️ "And Julio Enciso climbs above everyone and heads it down. One–nil."
🔊 Sharp musical hit on the goal.

**SCENE 21 — 3:40–3:46 (6s)**
🖼️ STILL A: Back-lit celebration silhouette: five players in [PY-KIT] arms raised, seen from behind, against a wall of floodlight flare. Red and white stripes rim-lit. Bottom third negative space for text. WARM grade. [STYLE]
📝 PARAGUAY'S FIRST EVER WORLD CUP KNOCKOUT GOAL — Bebas Neue, white, amber on "FIRST EVER", large, bottom third. 5s.

**SCENE 22 — 3:46–3:59 (13s)** · *(v1 video kit-inconsistent — regenerate)* · COLD grade begins
🖼️ STILL A: A cross frozen mid-flight from the right wing: [BALL] hanging above the penalty area, three players in [DE-KIT] attacking the far post. COLD grade — warm amber drains from the frame. [STYLE]
🖼️ STILL B: A striker in [DE-KIT] meeting [BALL] with his head at the near post, the goalkeeper in [GK-GILL] at full stretch and beaten. COLD grade. Left third negative space. [STYLE]
🎞️ A: PUSH (3:46–3:53). Cut to B (3:53–3:59). The WARM→COLD grade shift is itself the pattern interrupt.
🎙️ "Now Germany do what champions do. Just after the break, Florian Wirtz floats in a cross, and Kai Havertz meets it. One–one."

**SCENE 23 — 3:59–4:10 (11s)** · COLD grade dominant
🖼️ STILL A: Front-on low wide shot: a line of five anonymous figures in [DE-KIT] advancing abreast toward the camera out of deep shadow, white floodlight rim-lights their shoulders from behind, faces fully in darkness. Ominous, suffocating. COLD grade. [STYLE]
🎞️ PUSH 1.00 → 1.12 straight into the line over 11s; low drone swells mid-scene (interrupt).
🎙️ "And here's where the story is supposed to end. Germany level. Germany dominant. Germany, inevitably, finishing the job."

**SCENE 24 — 4:10–4:16 (6s)**
🖼️ STILL A: A weathered stone fortress wall at night, a rolling bank of dark storm fog pressing in from the right edge of frame, one small warm lantern glow at the base of the wall on the left. [STYLE]
🎞️ PUSH 1.00 → 1.10 over 6s.
🎙️ "What follows instead is a siege."

**SCENE 25 — 4:16–4:28 (12s)** · **KEEP-VIDEO (optional)**
🖼️ STILL A: Elevated behind-goal view: eight players in [DE-KIT] flooding into the penalty area toward the goalmouth, defended by the goalkeeper in [GK-GILL] and four defenders in [PY-KIT]; night, relentless density, haze. Right third negative space. [STYLE]
🖼️ STILL B: Same scene 20 meters closer and lower: the [GK-GILL] keeper's back in the foreground, the wall of [DE-KIT] attackers bearing down beyond him. Left third negative space. [STYLE]
🎞️ A: PUSH (4:16–4:22). Cut to B (4:22–4:28).
🎙️ "Twenty-one shots. Sixteen corners. For the rest of the match, Germany throw everything at one man."
📝 21 SHOTS · 16 CORNERS — Bebas Neue, amber "21", white rest, large, left third. 3s. Drops with the A/B cut at 4:22 — double interrupt.

**SCENE 26 — 4:28–4:38 (10s)** · **KEEP-VIDEO (optional — approved hero clip exists)** · **PARALLAX if still**
🖼️ STILL A: A goalkeeper in [GK-GILL] frozen fully horizontal in a full-stretch dive, left glove palming [BALL] wide of the post, turf spray beneath him, shot from a low behind-goal camera through the net texture. Slow-motion energy. Right third negative space. [STYLE]
🎞️ 2.5D PARALLAX: keeper+ball on alpha, net foreground and crowd background at offset speeds; PUSH 1.00 → 1.10.
🎙️ "And Orlando Gill says no. And no. And no again."

**SCENE 27 — 4:38–4:51 (13s)** · COLD grade
🖼️ STILL A: A header thumping into the net: a player in [DE-KIT] rising at the near post, [BALL] past the goalkeeper in [GK-GILL] who is falling backward, net beginning to ripple. COLD grade. Left third negative space. [STYLE]
🖼️ STILL B: A substitutes' bench of figures in [DE-KIT] with plain white training bibs leaping up as one, arms raised, backlit by floodlights, faces dark. [STYLE]
🎞️ A: SMASH on the goal (4:38–4:45). Cut to B (4:45–4:51).
🎙️ "The one-hundred-and-second minute. Jonathan Tah rises at a corner and heads it in. The bench erupts. Two–one. It's over."

**SCENE 28 — 4:51–4:58 (7s)**
🖼️ STILL A: A linesman's raised flag in tight close-up against blurred floodlights, high contrast, everything else black. [STYLE]
🖼️ STILL B: An anonymous referee in plain black kit, one finger pressed to his earpiece, face shadowed under his brow, the cold glow of an off-frame pitchside screen lighting one side of his face. [STYLE]
🎞️ A holds 3s; hard cut to B as the celebration audio collapses.
🎙️ "And then — the flags. A review."
🔊 Celebration sound cuts abruptly to a low hum on the cut.

**SCENE 29 — 4:58–5:10 (12s)** · *(two-body contact — concrete/literal wording; if model flags it, fall back to an editor composite of two separate stills)*
🖼️ STILL A: A frozen replay-style frame with subtle scanline texture: inside a crowded six-yard box, a defender in [DE-KIT] with both hands planted flat on the back of the goalkeeper in [GK-GILL], who is falling forward off-balance; [BALL] and leaping heads motion-blurred in the background. Right third negative space. [STYLE]
🎞️ Very slow PUSH 1.00 → 1.08 over 12s; a white "replay" corner bracket overlay blinks once mid-scene (editor, interrupt).
🎙️ "Before Tah's header, a German defender had shoved Gill to the ground — stopping him from even trying to save it."

**SCENE 30 — 5:10–5:18 (8s)** · MONOCHROME grade
🖼️ STILL A: Wide behind-goal shot of the stadium frozen: every figure motionless, near-monochrome desaturation, the goalkeeper in [GK-GILL] pushing himself up off the turf on one glove. Head down. Left third negative space. [STYLE]
🎞️ Hold with micro-PUSH; editor stamps GOAL DISALLOWED overlay at 5:13 (build in editor — never generate text).
🎙️ "Goal disallowed. One push. One whistle."
📝 GOAL DISALLOWED — Bebas Neue, white, large, left third. 4s. Stamp-style build in editor.
🔊 A single sharp whistle, then silence.

---

## ACT 4 — THE WALL (the shootout — emotional peak, do not rush)

**SCENE 31 — 5:18–5:32 (14s)** · MONOCHROME grade
🖼️ STILL A: Extreme close-up of the penalty spot: a worn white chalk disc on scarred, floodlit grass, [BALL] resting exactly on it, low angle with the empty goal frame and [STADIUM] bokeh far beyond. Drained, heavily desaturated. Bottom third negative space. [STYLE]
🎞️ Slow PUSH 1.00 → 1.15 over 14s; at 5:25 the grade darkens one stop and the drone thins (interrupt).
🎙️ "A hundred and twenty minutes weren't enough. It comes down to the cruelest invention in the sport — a shootout."

**SCENE 32 — 5:32–5:45 (13s)** · **PARALLAX hero shot** · MONOCHROME grade
🖼️ STILL A: Side-on shot from ~20 meters: a goalkeeper in [GK-GILL] walking slowly along his own goal line, hands loose at his sides, unhurried posture; in the background left, a penalty taker in [DE-KIT] waiting at the spot, small and out of focus. Right third negative space. [STYLE]
🎞️ 2.5D PARALLAX: keeper on alpha layer tracking right, background pans 30% slower; total move over 13s.
🎙️ "And before the first kick, Orlando Gill takes a slow walk. He makes Kai Havertz stand there, and wait, and think."

**SCENE 33 — 5:45–5:53 (8s)** · *(if you keep ANY motion clip in the video, this is the scene that earns it)* · MONOCHROME grade
🖼️ STILL A: A penalty taker in [DE-KIT] frozen mid run-up, low front angle from beside the goal post, floodlight flare behind him. Left third negative space. [STYLE]
🖼️ STILL B: The goalkeeper in [GK-GILL] fully extended low to his right, both gloves behind [BALL], frozen at the instant of contact, net texture in the near foreground. Right third negative space. [STYLE]
🎞️ A holds 4s; SMASH cut to B on the hit (1.00 → 1.30 in 1.5s), hold.
🎙️ "Havertz steps up. And Gill guesses right. Saved."
🔊 Hard hit, then crowd surge.

**SCENE 34 — 5:53–6:05 (12s)** — three stills, 4s each · WARM returning in flashes
🖼️ STILL A: A taker in [DE-KIT] wheeling away, [BALL] in the Paraguay net behind him, the [GK-GILL] keeper grounded the wrong way. COLD grade. [STYLE]
🖼️ STILL B: A taker in [PY-KIT] mid-strike, clean contact, [BALL] flying toward the top corner past the keeper in [DE-GK]. WARM grade returning. [STYLE]
🖼️ STILL C: The goalkeeper in [GK-GILL] diving to his left, one glove turning [BALL] around the post, turf spray. WARM grade. Right third negative space. [STYLE]
🎞️ Hard cuts A→B→C on the VO rhythm ("Germany score." / "Paraguay score." / "Gill dives again").
🎙️ "Back and forth. Germany score. Paraguay score. Gill dives again — and stops Woltemade. Paraguay are on the brink…"

**SCENE 35 — 6:05–6:14 (9s)** · COLD grade
🖼️ STILL A: Behind-goal shot: [BALL] flying wide past the left post into the dark, the goalkeeper in [DE-GK] standing unmoving; in the far background at the spot, the taker in [PY-KIT] with his head beginning to drop. A held breath. Left third negative space. [STYLE]
🎞️ Micro-PUSH; let it sit.
🎙️ "…and then their own man, Sanabria, drags his kick wide. The door swings back open."

**SCENE 36 — 6:14–6:26 (12s)**
🖼️ STILL A: A veteran goalkeeper in [DE-GK] springing to his left, one glove pushing [BALL] around the post, frozen at full extension. COLD grade. Left third negative space. [STYLE]
🖼️ STILL B: The halfway line: the goalkeeper in [GK-GILL] standing among teammates in [PY-KIT], arms linked in a row, all faces in shadow, watching. Tense stillness. WARM grade. Right third negative space. [STYLE]
🎞️ A: SMASH on the save (6:14–6:20). Cut to B (6:20–6:26), micro-PUSH.
🎙️ "And Neuer — Germany's own great keeper — answers, saving Paraguay's next. Sudden death. One miss ends it now."

**SCENE 37 — 6:26–6:38 (12s)** · MONOCHROME grade
🖼️ STILL A: A heavy-shouldered player in [DE-KIT] walking alone from the center circle toward the penalty area, seen from directly behind, his long shadow stretching ahead of him on the floodlit grass, the goal and the tiny [GK-GILL] keeper in the far distance. Right third negative space. [STYLE]
🎞️ Slow PUSH 1.00 → 1.12 following the walk; audio strips to a bare heartbeat at 6:32 (interrupt).
🎙️ "Jonathan Tah — the same man whose goal was ruled out an hour earlier — steps up to carry Germany's hopes."
🔊 Strip to a heartbeat.

**SCENE 38 — 6:38–6:45 (7s)** · MONOCHROME grade
🖼️ STILL A: Low behind-goal shot: [BALL] high above the crossbar against the black night sky, caught in a floodlight flare, the goal frame and the motionless keeper in [GK-GILL] below it. Left third negative space. [STYLE]
🖼️ STILL B: The taker in [DE-KIT] frozen at the spot, both hands rising to his head in despair, seen from the side, alone. COLD grade. Right third negative space. [STYLE]
🎞️ A holds 4s with micro-PUSH; cut to B (6:42–6:45).
🎙️ "And he sends it over the bar."
🔊 Silence — hold a full 2 seconds. Do not fill it.

**SCENE 39 — 6:45–6:54 (9s)** · WARM grade returning — emotional release
🖼️ STILL A: A calm taker in [PY-KIT] frozen mid-strike, planted foot beside [BALL], composed body shape. WARM grade beginning. Left third negative space. [STYLE]
🖼️ STILL B: The net rippling, [BALL] nestled in the side netting, the keeper in [DE-GK] beaten on the ground. Full WARM grade — first fully warm frame since Scene 20. Right third negative space. [STYLE]
🎞️ A 4s; SMASH cut to B on the strike; the amber grade return IS the emotional release.
🎙️ "José Canale doesn't flinch. He scores. And it's done."
🔊 Release everything — full crowd eruption.

**SCENE 40 — 6:54–7:06 (12s)** · **KEEP-VIDEO (optional — approved hero clip exists)** · WARM grade full
🖼️ STILL A: An explosion of celebration: seven players in [PY-KIT] sprinting toward and piling onto the goalkeeper in [GK-GILL], arms flung wide, backlit by floodlights, warm amber grade, motion blur at the frame edges. Left third negative space. [STYLE]
🎞️ SMASH in, then PULL 1.15 → 1.05 to breathe.
🎙️ "Four–three. The longest shot in the round has knocked out the four-time world champion."
📝 PARAGUAY 4–3 GERMANY — Bebas Neue, white, amber "4–3", large, right third. 4s. Drops at 7:00 — interrupt.

**SCENE 41 — 7:06–7:15 (9s)** · MOURNFUL WARM grade begins
🖼️ STILL A: Three players in [DE-KIT] walking off the pitch with heads bowed, seen from behind, COLD grade on the figures, warm out-of-focus celebration light far behind them. Left third negative space. [STYLE]
🎞️ Slow PULL 1.10 → 1.00.
🎙️ "And for the first time in fifty years, Germany have lost a World Cup shootout."

---

## ACT 5 — WHAT IT MEANS

**SCENE 42 — 7:15–7:28 (13s)** · MOURNFUL WARM grade
🖼️ STILL A: High aerial shot: the [STADIUM] bowl glowing warm amber from within, set in a dark, featureless night landscape, thin light haze rising from it. Right third negative space. [STYLE]
🎞️ PULL 1.15 → 1.00 over 13s (contextual-reveal pull); music softens mid-scene (interrupt).
🎙️ "This is the part of South American football that never makes the highlight reel. It isn't the flair. It isn't the genius."

**SCENE 43 — 7:28–7:39 (11s)** · **ASSET REUSE — regrade Scene 4/B map in editor, do not regenerate**
🖼️ STILL: The Act 1 South America map — now Paraguay alone glows quiet warm amber; Brazil and Argentina unlit; deep navy field. Editor regrade of Scene 4B still.
🎞️ Slow PUSH 1.00 → 1.10 into Paraguay.
🎙️ "It's quieter, and harder. A small, landlocked country that has spent its whole footballing life being overlooked."

**SCENE 44 — 7:39–7:50 (11s)** · **ASSET REUSE — Scene 7 stills, reversed motion**
🖼️ STILLS: Reuse Scene 7A (stone wall) and 7B (braced keeper) unchanged — closing the visual loop is the point.
🎞️ This time B → A: keeper first, dissolve to the stone wall; PULL instead of PUSH.
🎙️ "And that answers, over and over, in the same stubborn way: by producing a wall, and refusing to break."

**SCENE 45 — 7:50–8:03 (13s)** · *(v1 video generated but unreviewed — check kit drift before using)*
🖼️ STILL A: Three goalkeeper figures standing in a row on a dark pitch, evenly spaced, front-on, faces in shadow, each lit by his own vertical shaft of white light. Left: [PY-GK-90s]. Center: the plain navy long-sleeved 2010 kit from Scene 11B. Right: [GK-GILL]. Night, haze. Left third negative space. [STYLE]
🎞️ Slow lateral pan left → right across the three figures over 13s, landing on the amber jersey.
🎙️ "Chilavert did it with a snarl. Villar did it in twenty ten. And tonight, Orlando Gill did it against the best team he may ever face."

**SCENE 46 — 8:03–8:12 (9s)** · *(v1 video generated but unreviewed — same rule)*
🖼️ STILL A: The goalkeeper in [GK-GILL] standing upright and perfectly still in his goalmouth while blurred dark shapes of attackers in [DE-KIT] stream past him on both sides as long-exposure motion trails; the keeper is the only tack-sharp element in the frame. Right third negative space. [STYLE]
🎞️ Micro-PUSH 1.00 → 1.08; hold the stillness.
🎙️ "Twenty-one shots. And he would not let them have the one that mattered."

**SCENE 47 — 8:12–8:25 (13s)** · MOURNFUL WARM grade
🖼️ STILL A: A quiet close shot: the goalkeeper in [GK-GILL], gloves pulled off and held in one hand, chin lifted, looking up toward the floodlights, warm rim light tracing his jawline, face still mostly in shadow. Left third negative space. [STYLE]
🖼️ STILL B: His point of view: the floodlights and the half-empty stand above, soft, hazy, warm. Right third negative space. [STYLE]
🎞️ A: slow PUSH (8:12–8:19). Cut to B (8:19–8:25), micro-PULL.
🎙️ "Afterward, Gill said it simply: that this was for the people of Paraguay. After a night like this, no one's going to argue."

**SCENE 48 — 8:25–8:35 (10s)** · MOURNFUL WARM grade
🖼️ STILL A: Dawn breaking over the [STADIUM] exterior: a pale gold sunrise behind the dark bowl, empty plaza in the foreground, long soft shadows. Hopeful, forward-looking. Right third negative space. [STYLE]
🎞️ Slow lateral pan; light warms mid-scene (editor, interrupt).
🎙️ "On July fourth, in Philadelphia, Paraguay play again — for a place in the quarter-finals."
📝 ROUND OF 16 — FIRST TIME SINCE 2010 — Bebas Neue, white, amber "2010", large, bottom third. 3s.

**SCENE 49 — 8:35–8:47 (12s)** · **PARALLAX hero shot** · *(mirror composition of Scene 13 — bookends the video)*
🖼️ STILL A: The goalkeeper in [GK-GILL], seen from directly behind, walking down the stadium tunnel toward a bright white opening of light, resolute stride, kit bag over one shoulder. Right third negative space. [STYLE]
🎞️ 2.5D PARALLAX: keeper on alpha, tunnel walls pan slower; slow PUSH 1.00 → 1.12 toward the light.
🎙️ "But that's tomorrow's story. Tonight belongs to a goalkeeper, a small country, and the oldest tradition Paraguayan football has."

**SCENE 50 — 8:47–8:51 (4s)** · **EDITOR BUILD — no generation**
📝 TITLE CARD: **SILENCED** — white on black, Bebas Neue, full screen, slow letter-track fade. Hold 4 seconds. Fade to black. Mirror of Scene 3.

---

## OUTRO / CTA

**SCENE 51 — 8:51–9:03 (12s)** · **EDITOR BUILD — no generation**
🎞️ End-screen plate: channel branding on navy with faint pitch-line texture, space for subscribe + next-video thumbnail.
🎙️ "If you want the stories the highlight reels skip — the underdogs, the rivalries, the history behind South America's football — this is the channel. The next one's already coming."
📝 Subscribe prompt + suggested next video.

---

## PRODUCTION NOTES

**Asset count:** ~62 generated stills across 44 generated scenes. Scenes 3, 14, 21, 30, 50, 51 are editor builds (no generation). Scenes 43 and 44 are asset reuses. 5 kit-reference sheets generated separately before the batch.

**TurboFlow batch file:** `turboflow_prompts.txt` is the machine-submission document. This shot list is the human reference. Both must stay in sync. Import the .txt into TurboFlow — do not type prompts manually.

**Order of operations:**
1. Generate + approve all 5 kit reference sheets (@gkgill @pyout @deout @degk @gk90s + @ball @stadium)
2. Save as TurboFlow Image Library entries with exact @tags
3. Generate Act by Act — review every Act for kit drift BEFORE starting the next
4. Do NOT queue all 62 and review at the end — that is how v1 inconsistency compounded

**High-drift-risk scenes:** Scenes with 4+ @tags simultaneously are highest kit drift risk. These are the crowded-box and multi-team scenes. Generate these last within each Act. If drift occurs, drop @stadium from the prompt first (least character-critical) and regenerate.

**Existing video clips:** Scenes 1, 2, 4, 25, 26, 40 have approved v1 video. Check each against the kit bible: keeper-only shots (1, 2, 26, 40) likely pass; anything showing outfield kits from old prompts likely fails. Keep what passes — it's free.

**Transformation defense (monetization):** stills alone are not enough. The human editorial layer — Ken Burns Bézier curves, A/B cut rhythm, parallax plates, unified grain/particle pass, -14 LUFS audio engineering — is what separates this from an "inauthentic slideshow" demonetization flag. Never skip the editorial layer.

**NSFW false-flag recovery:** if a prompt is rejected, rewrite using concrete literal language (describe exactly what is physically in the frame, not abstract metaphors or motion language). Never retry the same phrasing. If three concrete rewrites fail, assign the scene to a manual editor graphic — do not waste generation budget on a persistent flag.

**VO normalization:** numerals written out in VO ("twenty ten", "June twenty-ninth", "the one-hundred-and-second minute"). On-screen TEXT cards keep numerals — they are visual, not spoken.

**Peaks (Scenes 33, 38, 39):** these lose the most as stills. If the assembled cut feels dead at the Havertz save or the Tah miss, generate motion for those 2–3 scenes only as a surgical exception — not a pipeline reversal.

**Fact-check before publish:** re-confirm every name, minute, and number against a live source. Unchanged rule, unchanged reason.
