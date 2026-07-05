# Ultra Deep Research Prompt — Script Writing for Football / Sports Documentary Videos

> Copy everything below the line into your research tool (Claude, ChatGPT Deep Research, Perplexity, Gemini Deep Research).
> Context: We produce long-form (8–12 min) football documentaries built from AI-generated still images
> (Ken Burns zooms), a few AI motion clips, text cards, and **AI text-to-speech narration** — assembled with FFmpeg
> and published on YouTube. Our pilot: "Silenced | The Night a Goalkeeper Sent Germany Home."
> This prompt is focused **exclusively on the script** — the words the narrator speaks and the story architecture behind them.

---

## RESEARCH PROMPT (copy from here)

I write narration scripts for **long-form football/sports documentary videos (8–12 minutes, ~1,100–1,600 words)** delivered by an **AI text-to-speech voice** over AI-generated visuals. The script is the single biggest quality lever I control, because I cannot rely on real match footage, player interviews, or archival audio — the words must carry everything.

I need an exhaustive, evidence-based research report on **the craft of sports-documentary scriptwriting**. For every area, cite real scripts, transcribed videos, named channels, books, or screenwriting sources. Where possible, quote actual narration lines from high-performing videos and analyze *why* they work.

---

### 1. The masters — deconstructing world-class sports narration

1. Transcribe and analyze the narration of **3–5 top football storytelling videos** (e.g., Tifo Football, HITC Sevens, John Bois/Secret Base "Pretty Good"/"Beef History", COPA90, F1's "Drive to Survive" openings, ESPN 30 for 30 openings). What do their scripts share at the **sentence level**: sentence length distribution, verb choice, tense usage, information density per sentence?
2. **Jon Bois** is widely considered the best sports storyteller on the internet. Break down his scripting techniques specifically: deadpan setup, statistical framing as drama, delayed reveals, tonal contrast. Which of his techniques transfer to a serious/dramatic style vs which are his voice only?
3. What can we steal from **broadcast sports documentary writing** (30 for 30, All or Nothing, Sunderland 'Til I Die, The Last Dance): how do their voice-over scripts differ from YouTube scripts? Where does TV pacing hurt YouTube retention?
4. Identify **the best sports writing in print** whose techniques translate to narration (e.g., David Goldblatt, Wright Thompson, Brian Phillips, Jonathan Wilson). What prose techniques survive being read aloud, and which die?

### 2. Story architecture for a 9-minute sports doc

5. Compare narrative frameworks applied to a single-match story: **3-act structure, Dan Harmon's story circle, kishōtenketsu, mystery-box, in-media-res cold open, "nested loops," documentary "thesis-question" structure**. For a known-outcome sports event (viewer may already know the score), which structures preserve tension — and how?
6. **The known-result problem**: the score of Paraguay–Germany is public. How do great docs create suspense about events the audience already knows the outcome of? (Techniques: shift the question from *what* to *how/why*, micro-unknowns, character stakes, "you know what happened — you don't know what it cost.") Give real examples.
7. **Beat sheet**: propose a minute-by-minute beat template for a 9-minute underdog match documentary — cold open, context, rising action, low point, climax, aftermath, reflection — with the *word count and function* of each beat, grounded in retention research.
8. **Where should the climax sit?** Is there evidence about placing the emotional peak at 60–70% vs 85–90% of runtime for YouTube retention vs satisfaction?
9. **Open loops and re-hooks**: how do the best scripts plant questions early and pay them off (Chekhov details, "remember this name" devices, callbacks)? How many open loops can a 9-minute script sustain?
10. **B-story/character thread**: single-match docs risk being play-by-play. How do top scripts weave a human throughline (one player's backstory, a nation's history, a coach's redemption) through match events without derailing pace? What's the ideal ratio of match-action narration to human-context narration?

### 3. The cold open — first 60 seconds, word by word

11. Collect **10 transcribed cold opens** from high-performing sports storytelling videos. Categorize their hook formulas (stakes-first, paradox, question, prophecy/flash-forward, "this shouldn't have happened", in-scene sensory drop). Which formula correlates with the strongest retention claims?
12. What is the ideal **first sentence**? Analyze real first lines: length, whether they name the subject, use of second person, present tense. Should the title's promise be restated or complicated in line one?
13. **The promise/payoff contract**: how explicit should the cold open's promise be ("by the end of this video you'll understand…") vs implicit? Evidence either way.
14. How long before the **channel intro/title card** (if any)? Do top channels still use them, and what does the script do immediately after the title beat to re-hook?

### 4. Language and line-level craft

15. **Sentence rhythm for spoken delivery**: rules for alternating long/short sentences, fragment usage, the "power of three," anaphora/repetition ("He waited. Germany waited. The world waited."). Which rhetorical devices appear most in top scripts?
16. **Verb-driven writing**: concrete examples of weak narration rewritten strong (passive→active, abstract→sensory). What's the consensus on adjective/adverb density in narration?
17. **Tense strategy**: present tense for match action ("Sosa steps up…") vs past for context — how do the best scripts switch tenses, and does present-tense action narration measurably feel more immersive?
18. **Second person and direct address**: when do top scripts say "you" ("Imagine you're 22, and 80 million people want you to fail")? Overuse risks?
19. **Numbers and stats as drama**: techniques for making statistics emotional (comparison, reframing, humanizing units — "Germany had won more World Cup knockout games than Paraguay had played"). Examples from Tifo/Bois-style scripts.
20. **Names, pronunciation, and clarity for a global audience**: how to handle foreign names, nicknames, and repeated references (rotation rules: name → role → pronoun) so listeners never lose track. Non-native-English viewer readability targets (grade level? word frequency?).
21. **Clichés to ban**: compile the sports-narration cliché list ("fairytale", "against all odds", "the rest is history", "written in the stars") and fresher substitutes used by respected writers.

### 5. Writing for TTS (our special constraint)

22. Which script patterns **break AI voices** (Kokoro, ElevenLabs, OpenAI TTS): long subordinate clauses, ambiguous heteronyms, numerals, abbreviations, scoreboard notation ("2–1", "90+3'"), all-caps? Best practices for writing/normalizing text so TTS delivery sounds human.
23. **Punctuation as performance direction**: how commas, em dashes, ellipses, and paragraph breaks change TTS pacing and pause length. Community-tested tricks for inserting dramatic pauses and beats (empty lines? SSML? per-sentence generation like ours?).
24. Since our TTS can't truly "perform," how much emotion must the **words themselves** carry vs a human narrator's script? Should TTS scripts be *more* explicit about emotion ("It was cruel.") where a human would use tone alone?
25. **Per-scene scripting**: we generate TTS per scene (each scene = one narration block of ~15–40 words). What are the risks of scene-chunked narration (choppy flow, lost momentum across cuts) and how do we write lines that bridge scene boundaries (sentence spillover, connective openers, motif words)?

### 6. Script ↔ visuals interplay (stills-based format)

26. **Writing for images that don't move much**: when the visual is a slow zoom on a still, the words must supply motion. What narration techniques create kinetic feeling over static images (sensory verbs, spatial language, time pressure)?
27. **The "don't describe the image" rule**: consensus on complementary vs redundant narration — should the script ever describe what's on screen? Examples of narration adding a second layer (irony, interiority, foreshadow) over an image.
28. **Silence and music-only moments in the script**: how do top scripts *write* silence (explicit [BEAT] / no-narration scenes)? How many words-free seconds can a 9-minute video sustain, and where do they hit hardest (before/after climax)?
29. **Text cards as script elements**: what should a text card say vs what should be narrated? Rules for card copy length, and the handoff line before/after a card.
30. Practical **script formatting**: what does a production-ready two-column (visual | narration) or scene-table script look like for this genre? Show a template with scene type, duration, narration, and music/SFX cues.

### 7. Accuracy, ethics, and dramatization

31. **Fact discipline**: how do respected channels research a match (sources: FBref, transcripts, contemporaneous reports, post-match interviews)? What's the standard for verifying quotes and stats before scripting?
32. **Dramatization limits**: inventing a player's inner thoughts ("He thought of his father") — where is the line between compelling interiority and fabrication? How do documentary writers signal speculation honestly ("perhaps", "he later said", "you have to imagine")?
33. **Real names in narration**: legal/policy landscape for using real player and team names in commentary/documentary narration (nominative fair use, defamation risk when dramatizing failure — e.g., scripting a player's miss as personal collapse). How do existing channels handle criticizing/dramatizing real people?
34. **Corrections and hedging**: how to write around uncertain facts without deflating drama.

### 8. Process — from blank page to locked script

35. **Research-to-outline workflow** used by top solo writers/small teams: how long do they research, how do they pick the angle/thesis ("this isn't a match story, it's a story about pressure"), and how do they choose what to cut?
36. **The angle test**: methods for choosing the one-sentence premise before writing (e.g., "A keeper nobody rated ended a giant's tournament"). How do you know an angle is strong enough for 9 minutes vs 3?
37. **Drafting and revision passes**: recommended pass structure (story pass → line pass → read-aloud pass → cut 10% pass). Evidence that reading aloud / table-reading improves narration scripts. Target words-per-minute and total word count for 9 minutes at documentary pacing (vs our TTS speed).
38. **Using LLMs to draft sports doc scripts**: current best practices and failure modes (generic phrasing, hallucinated facts, flat rhythm). Prompting/workflow techniques that get literary-quality narration from AI drafts (style references, beat-by-beat generation, human line-editing passes, banned-word lists). How do successful AI-assisted channels split human vs AI work?
39. **Script QA checklist**: compile a pre-production checklist a strategist would insist on (fact check, cliché sweep, hook strength, tense consistency, name clarity, TTS normalization, read-aloud timing, open-loop payoff audit).

### 9. Series and format-level script strategy

40. **Repeatable script formats**: should every video follow the same beat template (viewer habit-building) or vary structure per story? What do serialized channels do?
41. **Story selection**: which football stories script best in this format — single matches, career arcs, tragedies, tactical eras, "what happened to X"? Which categories show the strongest view performance for narration-driven channels?
42. **Localization**: what changes when adapting a script for Spanish/Portuguese dubs (South American football audience) beyond translation — idioms, reference framing, emotional register?
43. Anything I didn't ask: assume I'm a competent writer but new to this genre — add whatever a head writer at a top sports storytelling channel would insist I know before scaling to 2 scripts/week.

---

### Output format I want from the research

1. **Executive summary** — the 10 highest-leverage script findings.
2. **Per-section findings** with quoted narration lines, named examples, and links.
3. **A house style guide for my channel's scripts**: target word count and WPM, tense rules, sentence-length rhythm, banned clichés list, hook formula ranking, beat sheet template with minute timestamps and per-beat word budgets, TTS formatting rules.
4. **An annotated rewrite demo**: take a mediocre 100-word sample of match narration (invent one) and rewrite it applying the findings, with margin notes explaining each change.
5. **A script QA checklist** (one page) to run on every script before production.
6. **A prioritized action list** — the top 10 changes to make to my next script, ordered by expected impact.
