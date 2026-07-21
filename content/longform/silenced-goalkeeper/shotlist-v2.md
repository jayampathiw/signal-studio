# SHOT LIST v2 (IMAGE-FIRST) — "Silenced: The Night a Goalkeeper Sent Germany Home"
### The Underdog Archive — Video #1 · Stills + Ken Burns pipeline (retro-conversion)

**TITLE:** Silenced: The Night a Goalkeeper Sent Germany Home
**TARGET_DURATION_SEC:** 543
**PIPELINE:** Every scene is built from 1 generated STILL IMAGE animated in the editor (Ken Burns push/pull/smash, static holds). Video generation is used for ZERO scenes. Ported from `temp/Silenced The Night a Goalkeeper Sent Germany Home/SHOT_LIST_v2_..._Updated.md` (source of truth for VO, facts, and grade — VO carried over unchanged from the original published Video #1) into this codebase's parser syntax — same porting approach used for `one-match-short` (project 3) and `son-also-saves` (project 30). Note: the source doc's own header flags this as a reference/retro-documentation exercise for an already-published video, not a re-production order — proceeding here per explicit user instruction to build it as a new stills-pipeline production.
**ASSET COUNT:** 51 generated stills across 51 scenes (Scenes 3 and 50 are pre-baked title-card graphics with "SILENCED" already baked into the image, no drawtext duplicate — same pattern as one-match-short S3/S34).
**TEXT OVERLAY ENGINE:** Running Whisper-timed captions (karaoke-style, word-by-word amber highlight) via `apps/video/src/longform/captions.js` + `generate-captions.mjs`, same design as son-also-saves §12.1 / one-match-short — NOT the Tier 1/Tier 2 hero-card system. The 📝 TIER 1 lines below are kept parsed (for text-card fallback text + possible future re-enable) but are not rendered by `assemble-local.mjs`'s current `mergeCaptions()`.
**VERIFIED FACTS SOURCE:** VO ported verbatim from the source shot list, which itself carries over the original published video's fact-checked narration. One known gap, called out on purpose by the source doc: the shootout's exact kick order (beyond the stated running totals) is not independently re-verified against a primary source in this pass.
**Voice:** Kokoro `am_adam` (the son-also-saves / one-match-short final pick), unless told otherwise.

---

## SECTION A — MASTER CONSISTENCY BIBLE

**Layer 1 — Reference Elements** (kit tags from the source doc):

**@paraout** — Paraguay outfield: red/white striped shirt, blue shorts, anonymous, back/three-quarter turned.
**@paragk** — Orlando Gill: distinct keeper kit, gloves visible, face in shadow.
**@gerout** — Germany outfield: white shirt, black shorts, anonymous.
**@gergk** — Manuel Neuer: distinct keeper kit, face in shadow.
**@chilavert-symbolic** — vintage-styled 1990s goalkeeper figure (José Luis Chilavert lineage beat), era-cued via kit styling only, no likeness.
**@villar-symbolic** — vintage-styled early-2010s goalkeeper figure (Justo Villar lineage beat), captain's armband, era-cued via kit styling only, no likeness.

**[STYLE]** — Cinematic, dramatic, low-key lighting. Desaturated palette with warm amber accents and navy/rust brand tones. Slight film grain. Shallow depth of field. Anonymous/stylized figures — faces always in deep shadow or turned away, no recognizable real player faces. Stadium at dusk/night (Gillette Stadium, Foxborough), moody. 16:9.

---

## SECTION B — MOTION LANGUAGE (editor-side)

- **PUSH:** 1.00→1.08–1.15, Bézier ease. Default move.
- **PULL:** 1.15→1.00. Contextual reveals.
- **SMASH:** 1.00→1.30 in ~1.5s on a low-freq hit. Goals/saves/crossbar shocks only.
- **HOLD:** static frame, no zoom — deliberate stillness beats (isolation, aftermath).
- **Audio:** -14 LUFS master; VO -12 to -15 dB; music -22 to -25 dB (not yet mixed — see production notes).

---

## SECTION C — COLOUR GRADE SYSTEM

**WARM:** amber push — hope, near-misses, the lineage montage's warmer beats, saves, celebrations.
**COLD:** teal shadows — Germany's dominance, tension, the siege.
**MOURNFUL:** desaturated grey — the disallowed goal, shootout low points, aftermath.
**MONOCHROME:** black-and-white/sepia — Act 1 historical flashback (Chilavert, Villar) and the closing lineage callback.

`motion.js` only supports two regrade presets (`warm_amber`/`cold_blue`); WARM/MOURNFUL map to `warm_amber`, COLD/MONOCHROME map to `cold_blue` (same mapping used for one-match-short / son-also-saves).

---

## Per-scene format:
🖼️ STILL(s) — image prompt(s) for still generation
🎞️ MOTION — editor-side Ken Burns instruction
🎙️ VO — continuous narration
🔊 AUDIO — sound design cue
📝 TIER 1 — hero card (parsed, not currently rendered — see header note)

---

## COLD OPEN

**SCENE 1 — 0:00–0:12 (12s)** · COLD grade
🖼️ STILL A: Vast empty football stadium at night (Gillette Stadium, Foxborough), completely vacant stands fading into darkness, a single powerful floodlight glowing brightly in the upper frame casting long dramatic beams through misty air, no people visible, moody and foreboding atmosphere. [STYLE]
🎞️ PUSH 1.00 → 1.08 over 12s toward the glowing floodlight.
🎙️ "Germany had not lost a penalty shootout at a World Cup in fifty years."

**SCENE 2 — 0:12–0:27 (15s)** · COLD grade
🖼️ STILL A: @paragk Vast half-empty modern football stadium at dusk turning to night (Gillette Stadium), empty stands in shadow, single Orlando Gill standing as a small, solitary silhouette at the exact center of the pitch, back to camera, face in deep shadow, dwarfed by the enormous empty space and floodlight towers. [STYLE]
🎞️ HOLD — static, let the isolation sit.
🎙️ "Tonight, in a half-empty stadium outside Boston — a country with no coastline, no superstar, and a goalkeeper most of the world had never heard of… ended that streak."

**SCENE 3 — 0:27–0:31 (4s)** · COLD grade
📝 TIER 1 at 0:27: **SILENCED.** — centered. 4s.

---

## ACT 1 — THE LINEAGE

**SCENE 4 — 0:31–0:43 (12s)** · WARM grade
🖼️ STILL A: Stylized yet geographically accurate political map of South America centered on the continent, Brazil and Argentina glowing softly in gold light, Paraguay's distinct landlocked shape clearly emphasized and highlighted with subtle border definition, surrounding countries in muted tones, faint atmospheric haze. No figures. [STYLE]
🎞️ PUSH 1.00 → 1.08 over 12s toward Paraguay.
🎙️ "To understand what happened tonight, you have to understand something about this country first."

**SCENE 5 — 0:43–0:55 (12s)** · WARM grade
🖼️ STILL A: The same stylized South America map as Scene 4 but with faint, ghosted, anonymous silhouettes of legendary South American football players (backs or side profiles only, faces in shadow, no likenesses) subtly overlaid at the edges of the frame, barely visible. Paraguay's shape remains the clear focal point glowing softly. [STYLE]
🎞️ PUSH 1.00 → 1.06 over 12s.
🎙️ "Paraguay has never been a nation of artists. It didn't give the world a Pelé, or a Maradona, or a Messi."

**SCENE 6 — 0:55–1:06 (11s)** · MONOCHROME grade
🖼️ STILL A: Two-panel diptych composition split vertically down the center. Left panel: vibrant, warm-toned flair-football action (generic South American players in colorful kits, dynamic movement). Right panel: cold, textured grey industrial or fortress-like surface with stark contrast. Anonymous figures only, faces shadowed or turned. [STYLE]
🎞️ PUSH 1.00 → 1.08 over 11s.
🎙️ "While Brazil was painting and Argentina was dreaming, Paraguay was doing something far less glamorous — and far more stubborn."

**SCENE 7 — 1:06–1:13 (7s)** · MONOCHROME grade
🖼️ STILL A: Stone wall/fortress motif filling the frame — rough, ancient-looking stone blocks suggesting a defensive barrier, with the implied braced stance of a goalkeeper subtly echoed in the architectural lines and shadows. Moody, heavy atmosphere. [STYLE]
🎞️ PUSH 1.00 → 1.10 over 7s.
🎙️ "It was building walls."
🔊 A low, heavy drum hit.

**SCENE 8 — 1:13–1:25 (12s)** · MONOCHROME grade
🖼️ STILL A: @chilavert-symbolic A vintage 1990s Paraguayan goalkeeper figure in era-appropriate kit styling, gloves clenched tightly at his sides, standing resolute, back/three-quarter view, face completely in deep shadow. Stadium or training ground setting from that era implied through texture and lighting only. [STYLE]
🎞️ PUSH 1.00 → 1.08 over 12s.
🎙️ "For thirty years, the most famous man in Paraguayan football wasn't a striker. He was a goalkeeper — José Luis Chilavert."

**SCENE 9 — 1:25–1:38 (13s)** · MONOCHROME grade
🖼️ STILL A: @chilavert-symbolic mid-strike on a free kick — vintage 1990s Paraguayan goalkeeper kit, body fully extended in powerful kicking motion, ball frozen mid-arc toward goal in foreground, three-quarter or side view, face in deep shadow. Dramatic angle emphasizing power and defiance. [STYLE]
🎞️ PUSH 1.00 → 1.10 over 13s.
🎙️ "A keeper so fearless he scored free-kicks and penalties himself — who played like he was insulted by the idea that Paraguay should lose."

**SCENE 10 — 1:38–1:50 (12s)** · MONOCHROME grade
🖼️ STILL A: @villar-symbolic Paraguayan goalkeeper figure in early 2010s kit styling with captain's armband visible on sleeve, standing with quiet authority, back or three-quarter turned to camera, face in deep shadow. Faded "2010" numerals subtly visible in the blurred background texture. [STYLE]
🎞️ PUSH 1.00 → 1.08 over 12s.
🎙️ "After him came Justo Villar — who carried Paraguay to a World Cup quarterfinal in 2010, the best run in the nation's history."

**SCENE 11 — 1:50–2:01 (11s)** · MOURNFUL grade
🖼️ STILL A: @villar-symbolic A football frozen in mid-air just crossing a goal line into the net, Villar's shoulders dropped in dejection in the mid-ground (back view, face shadowed), empty goalmouth, stadium stands in soft focus. [STYLE]
🎞️ PULL 1.10 → 1.00 over 11s.
🎙️ "They lost that day. One goal. To Spain — the team that went on to win the whole tournament."

**SCENE 12 — 2:01–2:13 (12s)** · COLD grade
🖼️ STILL A: Abstract calendar/clock motif — years (2010 through 2026) frozen mid-flicker or layered in a dissolving time-lapse style, numbers sharp in foreground against a dark moody background suggesting the long wait. No figures. [STYLE]
🎞️ PUSH 1.00 → 1.08 over 12s.
🎙️ "That was sixteen years ago. Sixteen years of being the small country the giants walk past on their way to the final."

---

## ACT 2 — THE SETUP

**SCENE 13 — 2:13–2:24 (11s)** · WARM grade
🖼️ STILL A: @paragk Orlando Gill stepping out of deep shadow into a single dramatic shaft of warm light cutting through darkness, three-quarter back view, face in shadow, emerging into focus as a new chapter. Moody stadium or tunnel-like setting. [STYLE]
🎞️ PUSH 1.00 → 1.10 over 11s.
🎙️ "And then came tonight. And a new name in that long line of walls: Orlando Gill."

**SCENE 14 — 2:24–2:33 (9s)** · COLD grade
🖼️ STILL A: Clean motion-graphic-style composition with the flags of Paraguay and Germany placed side-by-side in the mid-ground, ranking numbers integrated subtly below or beside them. Dark navy/rust brand tones in background. [STYLE]
🎞️ PUSH 1.00 → 1.06 over 9s.
🎙️ "Let's be honest about the gap. Germany are four-time world champions."
📝 TIER 1 at 2:24: **12th in the world vs. 34th.** — centered. 3s.

**SCENE 15 — 2:33–2:45 (12s)** · COLD grade
🖼️ STILL A: An underdog figure (@paragk silhouette) dwarfed by a towering, ominous shadow of a much larger German player or abstract giant figure looming over him, subtle betting-slip or odds motif implied in the dark negative space. [STYLE]
🎞️ PUSH 1.00 → 1.08 over 12s.
🎙️ "The bookmakers made Paraguay the longest shot of the entire round — the team least likely, on paper, to win its game."

**SCENE 16 — 2:45–2:55 (10s)** · WARM grade
🖼️ STILL A: Exterior of a modern football stadium at dusk (Gillette Stadium), crowds of generic fans arriving through gates and walkways, warm lights beginning to glow, no visible logos or branding, atmospheric sky with soft clouds. [STYLE]
🎞️ PUSH 1.00 → 1.06 over 10s.
🎙️ "June 29th. The first half plays out exactly the way everyone expected."

---

## ACT 3 — THE MATCH

**SCENE 17 — 2:55–3:09 (14s)** · COLD grade
🖼️ STILL A: @gerout figures circulating in tight possession in the middle of the pitch, compressed frame with multiple players suggesting control and numerical superiority, dark ominous lighting closing in from edges, shallow focus on the ball at their feet. [STYLE]
🎞️ PUSH 1.00 → 1.08 over 14s.
🎙️ "Germany take the ball and keep it — seventy-eight percent of it. They press, they probe, they wait for the goal that's supposed to be a formality."

**SCENE 18 — 3:09–3:17 (8s)** · COLD grade
🖼️ STILL A: A single football sitting perfectly still at the edge of the penalty box on the grass, tense held frame, faint shadows of players in soft focus in the background, moody stadium night lighting. [STYLE]
🎞️ HOLD.
🎙️ "And then, minutes before half-time, the game forgets its script."

**SCENE 19 — 3:17–3:30 (13s)** · WARM grade
🖼️ STILL A: @paraout @gerout A corner kick frozen mid-flight — ball arcing through the air into a crowded penalty area. A Paraguayan midfielder in the act of delivering the corner from the edge of frame, bodies rising in the box, anonymous, faces in shadow or turned away. [STYLE]
🎞️ PUSH 1.00 → 1.10 over 13s.
🎙️ "A corner — whipped in by Matías Galarza, a man who plays his club football right here in the United States, for Atlanta."

**SCENE 20 — 3:30–3:40 (10s)** · WARM grade
🖼️ STILL A: @paraout @gergk A header frozen at the exact point of contact — Paraguayan forward rising highest in the crowded box, forehead meeting the ball which is just past a diving German keeper, fully extended but late, ball heading toward the goal line. Bodies colliding around, stadium floodlights. [STYLE]
🎞️ SMASH 1.00 → 1.30 over 1.5s.
🎙️ "And Julio Enciso climbs above everyone and heads it down. One–nil."
🔊 Sharp musical hit.

**SCENE 21 — 3:40–3:46 (6s)** · WARM grade
🖼️ STILL A: @paraout Silhouetted or back-view anonymous Paraguayan players celebrating wildly near the corner flag or goal, arms raised, one central figure with back to camera, stadium stands soft in background. [STYLE]
🎞️ HOLD.
📝 TIER 1 at 3:40: **Paraguay's FIRST EVER World Cup knockout goal.** — centered. 6s.

**SCENE 22 — 3:46–3:59 (13s)** · COLD grade
🖼️ STILL A: @gerout @gergk A cross frozen mid-air arcing toward goal, a German striker rising to meet it with a header, cool blue tone dominating, keeper and defenders in soft focus. Night match, floodlights. [STYLE]
🎞️ SMASH 1.00 → 1.25 over 1.5s.
🎙️ "Now Germany do what champions do. Just after the break, Florian Wirtz floats in a cross, and Kai Havertz meets it. One–one."

**SCENE 23 — 3:59–4:10 (11s)** · COLD grade
🖼️ STILL A: @gerout figures surging forward in attack, multiple white-shirted anonymous figures pressing toward goal, dark moody atmosphere suggesting inevitability, shallow focus on the leading player. [STYLE]
🎞️ PUSH 1.00 → 1.10 over 11s.
🎙️ "And here's where the story is supposed to end. Germany level. Germany dominant. Germany, inevitably, finishing the job."

---

## ACT 4 — THE SIEGE AND THE SHOOTOUT

**SCENE 24 — 4:10–4:16 (6s)** · MOURNFUL grade
🖼️ STILL A: Fortress motif — dark stone or defensive wall texture on one side of frame with encroaching heavy shadow from the opposite side, suggesting a siege closing in, subtle goalmouth reference in the architecture of light and shadow. [STYLE]
🎞️ PUSH 1.00 → 1.08 over 6s.
🎙️ "What follows instead is a siege."

**SCENE 25 — 4:16–4:28 (12s)** · COLD grade
🖼️ STILL A: @gerout @paragk Single composed frame implying repeated waves of attack: multiple German attacker silhouettes converging toward one goalmouth from different angles, Gill visible small in goal, dark ominous lighting. [STYLE]
🎞️ PUSH 1.00 → 1.10 over 12s.
🎙️ "Twenty-one shots. Sixteen corners. For the rest of the match, Germany throw everything at one man."
📝 TIER 1 at 4:16: **21 shots · 16 corners** — centered. 4s.

**SCENE 26 — 4:28–4:38 (10s)** · WARM grade
🖼️ STILL A: @paragk Orlando Gill at full stretch, body horizontal in mid-air, one glove palming a football away from goal in a desperate but successful save, frozen at peak extension, stadium floodlights. Anonymous, face in shadow, powerful and defiant pose. [STYLE]
🎞️ SMASH 1.00 → 1.25 over 1.5s.
🎙️ "And Orlando Gill says no. And no. And no again."

**SCENE 27 — 4:38–4:51 (13s)** · COLD grade
🖼️ STILL A: @gerout A header frozen thumping into the net — tall German defender rising at a corner, ball in the back of the net, substitutes' bench in background leaping in celebration (anonymous figures), dark lighting. [STYLE]
🎞️ SMASH 1.00 → 1.30 over 1.5s.
🎙️ "The 102nd minute. Jonathan Tah rises at a corner and heads it in. The bench erupts. Two–one. It's over."

**SCENE 28 — 4:51–4:58 (7s)** · MOURNFUL grade
🖼️ STILL A: A linesman's raised flag in sharp focus in foreground, referee in mid-ground with hand to his earpiece receiving VAR communication, frozen moment of review, stadium in soft focus behind, somber mood. [STYLE]
🎞️ HOLD.
🎙️ "And then — the flags. A review."
🔊 Celebration sound cuts abruptly to a low hum.

**SCENE 29 — 4:58–5:10 (12s)** · MOURNFUL grade
🖼️ STILL A: @gerout @paragk Frozen replay-style composition showing the key incident: a German defender with arm/shoulder making contact with Gill (on ground or falling), preventing him from challenging a header, VAR-monitor aesthetic implied through composition, desaturated and somber. [STYLE]
🎞️ PUSH 1.00 → 1.06 over 12s.
🎙️ "Before Tah's header, a German defender had shoved Gill to the ground — stopping him from even trying to save it."

**SCENE 30 — 5:10–5:18 (8s)** · MOURNFUL grade
🖼️ STILL A: "GOAL DISALLOWED" stamp or graphic treatment overlaid on a frozen, silent wide shot of the stadium with players standing still, referee signaling, heavy desaturated grey atmosphere, sense of sudden quiet after chaos. [STYLE]
🎞️ HOLD.
🎙️ "Goal disallowed. One push. One whistle."
🔊 A single sharp whistle, then silence.
📝 TIER 1 at 5:10: **GOAL DISALLOWED** — centered. 4s.

**SCENE 31 — 5:18–5:32 (14s)** · MOURNFUL grade
🖼️ STILL A: Extreme close-up on the white penalty spot mark on the grass, blades of grass in sharp detail, faint scuff marks, moody low-key lighting casting long shadows, empty stadium atmosphere in soft focus behind. [STYLE]
🎞️ PUSH 1.00 → 1.10 over 14s (slow zoom).
🎙️ "A hundred and twenty minutes weren't enough. It comes down to the cruelest invention in the sport — a shootout."

**SCENE 32 — 5:32–5:45 (13s)** · MOURNFUL grade
🖼️ STILL A: @paragk Orlando Gill mid-stride, unhurried, walking his own goal line alone, back or side profile, face in deep shadow, penalty spot visible nearby, vast empty stadium behind him at night, tense and deliberate pace. [STYLE]
🎞️ PUSH 1.00 → 1.06 over 13s.
🎙️ "And before the first kick, Orlando Gill takes a slow walk. He makes Kai Havertz stand there, and wait, and think."

**SCENE 33 — 5:45–5:53 (8s)** · WARM grade
🖼️ STILL A: @paragk @gerout A penalty kick frozen mid-strike or just saved — Gill's glove clearly on or deflecting the ball away from goal, Kai Havertz mid follow-through in background (anonymous, back/side turned), ball direction showing save. [STYLE]
🎞️ SMASH 1.00 → 1.30 over 1.5s.
🎙️ "Havertz steps up. And Gill guesses right. Saved."
🔊 Hard hit, then crowd surge.
📝 TIER 1 at 5:45: **0–0 · Havertz saved** — centered. 3s.

**SCENE 34 — 5:53–6:05 (12s)** · COLD grade
🖼️ STILL A: @paragk @gerout A tense moment of a German penalty kick being struck and the keeper reacting mid-dive, anonymous figures, conveying back-and-forth drama. [STYLE]
🎞️ SMASH 1.00 → 1.25 over 1.5s.
🎙️ "Back and forth. Germany score. Paraguay score. Gill dives again — and stops Woltemade. Paraguay are on the brink…"
📝 TIER 1 at 5:53: **1–1 · Woltemade saved** — centered. 3s.

**SCENE 35 — 6:05–6:14 (9s)** · MOURNFUL grade
🖼️ STILL A: @paraout A penalty kick frozen wide of the post — ball sailing harmlessly past the goal frame into the advertising boards or stands, Paraguayan taker in mid-kick follow-through (shoulders showing disappointment, face shadowed), empty goal visible. [STYLE]
🎞️ PUSH 1.00 → 1.06 over 9s.
🎙️ "…and then their own man, Sanabria, drags his kick wide. The door swings back open."
📝 TIER 1 at 6:05: **1–1 · Sanabria wide** — centered. 3s.

**SCENE 36 — 6:14–6:26 (12s)** · COLD grade
🖼️ STILL A: @gergk Manuel Neuer frozen springing powerfully to his left or right, glove pushing or catching a Paraguayan penalty attempt, ball visible near his hand or diverted, dramatic athletic pose, penalty spot area. [STYLE]
🎞️ SMASH 1.00 → 1.25 over 1.5s.
🎙️ "And Neuer — Germany's own great keeper — answers, saving Paraguay's next. Sudden death. One miss ends it now."
📝 TIER 1 at 6:14: **1–1 · Neuer saves · SUDDEN DEATH** — centered. 4s.

**SCENE 37 — 6:26–6:38 (12s)** · MOURNFUL grade
🖼️ STILL A: @gerout A heavy-shouldered German defender figure (suggesting Jonathan Tah) walking slowly and deliberately toward the penalty spot, back to camera, head slightly bowed, lonely figure against the vast dark pitch and empty stands. [STYLE]
🎞️ PUSH 1.00 → 1.06 over 12s.
🎙️ "Jonathan Tah — the same man whose goal was ruled out an hour earlier — steps up to carry Germany's hopes."
🔊 Strip to a heartbeat.

**SCENE 38 — 6:38–6:45 (7s)** · MOURNFUL grade
🖼️ STILL A: A football frozen high above the crossbar against the black night sky, just missing the goal, penalty spot and distant anonymous figures (one with head in hands) visible below, dramatic upward angle, stadium floodlights in periphery. [STYLE]
🎞️ HOLD.
🎙️ "And he sends it over the bar."
🔊 Silence — hold a full 2 seconds.
📝 TIER 1 at 6:38: **1–1 · Tah over the bar** — centered. 3s.

**SCENE 39 — 6:45–6:54 (9s)** · WARM grade
🖼️ STILL A: @paraout A calm Paraguayan penalty taker frozen in follow-through after scoring, net rippling visibly behind him from the ball hitting it, penalty spot area, sense of quiet confidence and release. [STYLE]
🎞️ SMASH 1.00 → 1.30 over 1.5s.
🎙️ "José Canale doesn't flinch. He scores. And it's done."
🔊 Release everything — full crowd eruption.
📝 TIER 1 at 6:45: **PARAGUAY 4–3 GERMANY · FINAL** — centered. 4s.

---

## ACT 5 — WHAT IT MEANS

**SCENE 40 — 6:54–7:06 (12s)** · WARM grade
🖼️ STILL A: @paraout @paragk A frozen moment of Paraguayan players piling onto their goalkeeper in a massive celebratory huddle on the pitch, bodies intertwined in joy, arms raised, stadium lights and faint crowd in background. [STYLE]
🎞️ PUSH 1.00 → 1.08 over 12s.
🎙️ "Four–three. The longest shot in the round has knocked out the four-time world champion."
📝 TIER 1 at 6:54: **PARAGUAY 4–3 GERMANY** — centered. 4s.

**SCENE 41 — 7:06–7:15 (9s)** · MOURNFUL grade
🖼️ STILL A: @gerout Figures with heads down, shoulders slumped, walking slowly off the pitch toward the tunnel, dejected body language, one or two figures prominent, empty stands behind, somber exit. [STYLE]
🎞️ PULL 1.10 → 1.00 over 9s.
🎙️ "And for the first time in fifty years, Germany have lost a World Cup shootout."

**SCENE 42 — 7:15–7:28 (13s)** · WARM grade
🖼️ STILL A: Wide shot of the celebrating stadium at night — generic fans in stands standing and cheering, pitch in foreground with distant celebrating Paraguayan players small in frame, warm lights and hopeful atmosphere. [STYLE]
🎞️ PULL 1.15 → 1.00 over 13s (slow pull-back).
🎙️ "This is the part of South American football that never makes the highlight reel. It isn't the flair. It isn't the genius."

**SCENE 43 — 7:28–7:39 (11s)** · WARM grade
🖼️ STILL A: The same stylized map of South America from Scenes 4/5, now with Paraguay's shape glowing quietly and warmly in the center, other countries subdued, sense of quiet pride and resilience. [STYLE]
🎞️ PUSH 1.00 → 1.06 over 11s.
🎙️ "It's quieter, and harder. A small, landlocked country that has spent its whole footballing life being overlooked."

**SCENE 44 — 7:39–7:50 (11s)** · MONOCHROME grade
🖼️ STILL A: The wall/goalkeeper fortress motif from Scene 7 returning as a closing visual loop — stone wall texture merging with the braced stance silhouette of a goalkeeper, strong graphic composition that bookends Act 1. [STYLE]
🎞️ PULL 1.10 → 1.00 over 11s.
🎙️ "And that answers, over and over, in the same stubborn way: by producing a wall, and refusing to break."

**SCENE 45 — 7:50–8:03 (13s)** · MONOCHROME grade
🖼️ STILL A: @chilavert-symbolic @villar-symbolic @paragk Three goalkeeper silhouettes standing in a row facing away or in profile — left: vintage 1990s kit, middle: 2010-era with armband, right: modern kit, gloves visible — all anonymous, faces shadowed, vintage-to-modern progression cued by kit styling only. [STYLE]
🎞️ PUSH 1.00 → 1.08 over 13s.
🎙️ "Chilavert did it with a snarl. Villar did it in 2010. And tonight, Orlando Gill did it against the best team he may ever face."

**SCENE 46 — 8:03–8:12 (9s)** · WARM grade
🖼️ STILL A: @paragk @gerout Gill standing firm and resolute in goal, body positioned heroically, multiple German attacker silhouettes converging from the sides and foreground toward him in a frozen moment of siege, dramatic low angle, warm amber accents on the keeper. [STYLE]
🎞️ PUSH 1.00 → 1.10 over 9s.
🎙️ "Twenty-one shots. And he would not let them have the one that mattered."

**SCENE 47 — 8:12–8:25 (13s)** · WARM grade
🖼️ STILL A: @paragk Orlando Gill standing alone on the pitch looking up toward the floodlights, quiet and reflective post-match moment, back or three-quarter view, face in soft shadow, stadium lights creating a god-ray or halo effect. [STYLE]
🎞️ PULL 1.10 → 1.00 over 13s.
🎙️ "Afterward, Gill said it simply: that this was for the people of Paraguay. After a night like this, no one's going to argue."

**SCENE 48 — 8:25–8:35 (10s)** · WARM grade
🖼️ STILL A: Hopeful dawn breaking over a football stadium, soft warm morning light on the horizon, empty or quiet stands, pitch in foreground, sense of new beginning and next chapter. [STYLE]
🎞️ PUSH 1.00 → 1.06 over 10s.
🎙️ "On July 4th, in Philadelphia, Paraguay play again — for a place in the quarterfinals."
📝 TIER 1 at 8:25: **Round of 16 — first time since 2010** — centered. 4s.

---

## OUTRO

**SCENE 49 — 8:35–8:47 (12s)** · WARM grade
🖼️ STILL A: @paragk Gill's silhouette, resolute and upright, walking toward a bright light source (floodlight or dawn), back to camera, strong purposeful stride, stadium or tunnel setting, hopeful yet grounded mood. [STYLE]
🎞️ PUSH 1.00 → 1.08 over 12s.
🎙️ "But that's tomorrow's story. Tonight belongs to a goalkeeper, a small country, and the oldest tradition Paraguayan football has."

**SCENE 50 — 8:47–8:51 (4s)** · MOURNFUL grade
📝 TIER 1 at 8:47: **SILENCED** — centered. 4s.

**SCENE 51 — 8:51–9:03 (12s)** · WARM grade
🖼️ STILL A: Clean end-screen composition featuring subtle channel branding elements (Underdog Archive), space reserved at bottom or side for "Subscribe" prompt and suggested next video thumbnail placeholder, faint background texture of a stadium or map. [STYLE]
🎞️ STATIC — full frame, no zoom/crop (end-screen already has its own baked-in layout).
🎙️ "If you want the stories the highlight reels skip — the underdogs, the rivalries, the history behind South America's football — this is the channel. The next one's already coming."
📝 TIER 1 at 8:51: **SUBSCRIBE FOR MORE** — centered. 4s.

---

## PRODUCTION NOTES

- **Runtime as scripted:** ~9:03 (543s) — matches the source doc's timecodes exactly, ported verbatim.
- **VO ported verbatim** from the source shot list, which itself preserves the original published Video #1's fact-checked narration unchanged.
- **Known gap, carried over on purpose:** the shootout's exact kick order isn't independently re-verified against a primary source (unlike Colombia's, which came from an ESPN kick log) — flagged by the source doc itself.
- **Scenes 3 and 50** are pre-baked title-card graphics (`S03-A.jpg` / `S50-A.jpg`, real files with "SILENCED" baked into the image) — zero `🖼️` lines by design so `assemble-local.mjs` treats them as `buildTextCard` calls with a background image and no duplicate drawtext, same as one-match-short's S3/S34 fix. Two distinct title-card images were available (wide-stadium version for the intro, closer/intimate version for the outro fade) — used accordingly.
- **Scene 51** has a real generated end-screen plate (not a blank text card) plus real VO — rendered as a normal still scene with `HOLD` motion.
- **Captions, not Tier 1/Tier 2:** matches son-also-saves' / one-match-short's final design — full-sentence running captions generated from real VO via Whisper, not isolated hero cards. The 📝 lines above are parsed but inert unless `mergeCaptions()` in `assemble-local.mjs` is changed to re-include them.
- **Voice:** Kokoro `am_adam`, matching the established Underdog Archive default.
