---
name: longform-doc-playbook
description: Production playbook for long-form football documentaries (football/documentary/EN). MUST be applied whenever writing or reviewing a long-form script, shotlist, prompt sheet, TTS narration, or assembly config. Encodes scripting (ABT, cold open, WPM budget, TTS normalization), visual (Ken Burns values, pattern interrupts, kit bible), and audio (-14 LUFS) rules derived from genre research.
---

# Long-Form Documentary Production Playbook

Applies to every `football/documentary/EN` (and future long-form) project. Derived from genre
research (Tifo, HITC Sevens, Football Iconic, AI Football Narrative) — full reports in
`temp/research results/`. Companion plan: `docs/longform-v2-image-first-plan.md`.

## 1. Script rules (write / review any VO against these)

- **Cold open, stakes-first**: open in media res at peak tension/paradox. 0:00–0:15 paradox →
  0:15–0:30 value promise → 0:30–1:00 antagonist + title stinger. No intros, no throat-clearing.
- **ABT engine**: connect every beat with "But"/"Therefore", never "And then". Chronology is not story.
- **Known-result pivot**: acknowledge the known outcome early, promise the untold *how/why/cost*.
- **Word budget**: 140–150 WPM → 1,100–1,400 words for a 9-minute video, leaving ~1 min of
  scripted silence/music. Climax lands at the 70–80% mark.
- **Tense protocol**: past tense for history/biography; present tense strictly for on-pitch action.
- **Line-level**: alternate long sentences (20–25 words) with short landing fragments (3–6 words);
  use tricolons for peaks ("He waited. Germany waited. The world waited."). Name rotation:
  full name + role → surname → role/pronoun; never two conflicting pronouns in one sentence.
- **Don't describe the image** — narrate the second layer (irony, cost, inner conflict).
  Kinetic/spatial verbs supply the motion the stills lack.
- **Banned clichés**: "against all odds", "a fairytale ending", "the rest is history",
  "written in the stars", "sent shockwaves". Replace with concrete parameters/costs/aftermath.

## 2. TTS normalization (pre-generation audit, every VO line)

- Spell out scores ("two goals to one"), minutes ("the ninety-third minute"), dates
  ("June twenty-ninth", "twenty ten"), abbreviations ("versus", "the goalkeeper").
  On-screen TEXT keeps numerals — visual, not spoken.
- Punctuation is the pacing control: `.` breath reset · `,` short pause · `…` suspense ·
  `—` sharp gear-shift. Scripted silences are explicit (e.g. "hold 2 seconds — do not fill it").
- Chunked per-scene VO: avoid identical fresh noun-verb openers per scene — use sentence spillover
  across scene boundaries or connective openers ("But," "Ninety seconds later").
- Test foreign surnames; feed phonetic spellings to the TTS engine if flattened (keep correct
  spelling in subtitles).

## 3. Visual / shotlist rules

- **Image-first**: scenes are 1–3 stills + editor motion; video generation only as a surgical
  exception for 2–3 emotional-peak scenes if the assembled cut feels dead.
- **Motion values** (assembly enforces): PUSH 1.00→1.08–1.15 over 8–14s, Bézier-eased;
  PULL 1.15→1.00 for contextual reveals only; SMASH 1.00→1.30 in ~1.5s synced to an audio hit;
  micro-PUSH →1.06; 2.5D parallax reserved for hero shots. Never exceed 1.15 on a standard push.
- **Pattern interrupt every 5–8s**: any scene ≥10s needs an A/B cut, a timed text overlay, or a
  hard SFX hit. One still + one slow 12s zoom = the slideshow look monetization policy punishes.
- **Kit/consistency bible**: generate + approve kit reference sheets *before* bulk generation;
  every prompt is self-contained (verbatim kit blocks, no shared prefix); generate act-by-act,
  reviewing each act for drift before the next. Never batch-generate everything then review.
- **Anonymity**: silhouetted/shadowed/rearview figures only — no recognizable faces (bypasses AI
  identity disclosure and likeness risk). Never generate text inside images — overlays are editor-side.
- **Grade**: moody prestige — deep navy-teal shadows, warm amber highlights; use warm↔cold grade
  shifts as narrative punctuation (cold for setbacks, amber return at the emotional release).
- Composition: subjects on rule-of-thirds intersections with negative space reserved for overlays.

## 4. Audio rules

- Master to **−14 LUFS integrated** (YouTube target). VO −12 to −15 dB; music bed −22 to −25 dB.
- Script sound design explicitly (hits, hum-cuts, heartbeats, silences) — never improvised at edit.

## 5. Monetization / transformation defense

- The human editorial layer (eased motion curves, A/B rhythm, parallax, unified grain pass,
  audio engineering, original research) is what separates output from "inauthentic/repetitive
  content". Never ship a flat still-slideshow.
- Harvest 3–4 high-emotion Shorts per long-form video as the discovery funnel.
- Fact-check every name, minute, and number against a live source before publish.
