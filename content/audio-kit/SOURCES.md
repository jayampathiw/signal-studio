# Audio Kit — Source List & Download Instructions

Save each file with the **exact filename** shown, into the matching subfolder:
- Music beds → `content/audio-kit/beds/`
- Ambience + SFX one-shots → `content/audio-kit/sfx/`

All files must be CC0 / royalty-free. Suggested sources below — use the exact search terms.

After downloading, run:
```
node apps/video/scripts/longform/import-audio-kit.mjs
```
Then verify all 23 files are on R2:
```
node apps/video/scripts/longform/import-audio-kit.mjs --check
```

---

## Music Beds — save to `beds/` (9 files)

| Filename | Description | Suggested search |
|---|---|---|
| `somber.mp3` | Somber/dramatic orchestral — slow, building dread. 2-3 min loop. | Pixabay: "cinematic dramatic orchestra somber" |
| `tension.mp3` | Building tension — staccato strings or pulsing synth. 2-3 min. | Pixabay: "tension suspense thriller strings" |
| `drone.mp3` | Low minimal drone — near-silence, sparse, weight. 2-3 min. | Pixabay: "dark ambient drone suspense" |
| `release.mp3` | Emotional release/triumph — rising, warm, earned. 1-2 min. | Pixabay: "cinematic triumphant orchestral emotional" |
| `reflective.mp3` | Reflective/hopeful — gentle piano or acoustic. 2-3 min. | Pixabay: "reflective piano orchestral cinematic" |
| `piano_sad_solo.mp3` | Solo piano, sad/somber — reversal/injustice beats (Shorts-specific, e.g. Silenced S2). | Pixabay: "sad solo piano instrumental" |
| `tragic_loss.mp3` | Gutting, specific loss — heavier than `somber`. | Pixabay: "cinematic dramatic orchestra terrible loss" |
| `epic_dramatic.mp3` | Big, bombastic dramatic orchestral — bigger than `tension`/`release`. | Pixabay: "epic dramatic orchestra" |
| `ethereal_mystery.mp3` | Ambient/mysterious atmosphere — distinct from `drone`/`reflective`. | Pixabay: "ambient mysterious atmosphere" |

---

## Ambience — save to `sfx/` (1 file)

| Filename | Description | Suggested search |
|---|---|---|
| `stadium_hum.mp3` | Continuous low crowd hum/murmur, no commentary. Loop-able 1-2 min. | Freesound: "stadium crowd murmur ambient loop" |

---

## SFX One-Shots — save to `sfx/` (13 files)

| Filename | Description | Suggested search |
|---|---|---|
| `drum_hit.mp3` | Single heavy low-freq drum impact (< 2s) | Freesound: "cinematic drum hit impact" |
| `musical_hit.mp3` | Sharp orchestral/electronic impact hit (< 1s) | Freesound: "impact hit stinger" |
| `ref_whistle.mp3` | Referee whistle blast (< 2s) | Freesound: "whistle referee short" |
| `crowd_roar.mp3` | Crowd eruption/roar (< 4s) | Freesound: "crowd cheer roar stadium" |
| `celebration_cut.mp3` | Crowd roar that cuts to dead silence abruptly — or edit `crowd_roar.mp3` with a fade-out (< 3s) | Use crowd_roar + trim |
| `hum_cut_silence.mp3` | Low hum that cuts suddenly to silence (< 2s) — can edit `stadium_hum.mp3` | Use stadium_hum + trim |
| `heartbeat.mp3` | Single heartbeat thud (< 1s) | Freesound: "heartbeat single thud" |
| `crowd_quiet.mp3` | Hushed held-breath stadium murmur (< 3s) | Freesound: "crowd hushed murmur tense" |
| `ball_thud.mp3` | Ball hitting woodwork or heavy thud (< 1s) | Freesound: "football hit post thud" |
| `crowd_clap.mp3` | Short audience clapping burst (< 15s) | Freesound/Pixabay: "audience clapping" |
| `crowd_applause.mp3` | Sustained applause/ovation (< 30s) | Freesound/Pixabay: "applause ovation" |
| `crowd_cheer.mp3` | Sustained crowd cheer — lighter energy than `crowd_roar` (< 10s) | Freesound/Pixabay: "crowd cheers" |
| `stadium_crowd_energy.mp3` | Energetic live stadium crowd texture, longer than `stadium_hum` (< 20s) | Freesound/Pixabay: "live stadium crowd cheering" |

---

## Notes
- All files should be 44.1kHz or 48kHz, stereo or mono — both fine.
- `celebration_cut.mp3` and `hum_cut_silence.mp3` can be crafted from `crowd_roar.mp3`
  and `stadium_hum.mp3` respectively using Audacity (free) if you can't find them directly.
- Do not commit the mp3/wav files — they are gitignored. Only `manifest.json` and this file are committed.
