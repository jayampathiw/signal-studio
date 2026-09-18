# AssembleX Factory — pilot bridge (P0.8)

Standalone Remotion + Node pipeline for one AssembleX post: `prep → tts → render → captions → log`.
Built on top of `@signal-studio/render-core`-style conventions but self-contained — no DB, no API,
local only. This is the **pilot bridge** (refactor-plan.md §10, Phase 0.8): everything here is
designed to be lifted into the engine's `clips-overlay` template in Phase 2 largely unchanged. It
lives at `projects/assemblex-factory/pilot/` in the engine repo for now and moves to the private
workspace repo at Phase 6.

## Commands

Run from this directory (`pilot/`), each takes a pack directory as its argument:

| Command                                                                                                                  | What it does                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run validate <pack-dir>`                                                                                            | Validates `pack.json` against the `Pack` zod schema; prints path-precise errors                                                                                         |
| `npm run prep <pack-dir>`                                                                                                | Normalises `clips/raw/*.mp4` → `clips/*.mp4` (1080×1920/30fps), writes QA contact sheets to `qa/`, writes `duration_s` back into `pack.json`                            |
| `npm run tts <pack-dir>`                                                                                                 | Generates VO per shot via kokoro-js, loudnorms to `vo/<id>_vo_n.wav`, writes `voiceover_file`/`voiceover_duration_s` back into `pack.json`, warns on VO-budget overruns |
| `npm run render <pack-dir> [<pack-dir> ...] [--only <post_id>] [--variant fb\|ig]`                                       | Renders `Post` → `out/<post_id>_fb.mp4` / `_ig.mp4`                                                                                                                     |
| `npm run render:compilation <series-dir> [--out <name>]`                                                                 | Renders `Compilation` from `<series-dir>/ep1/`, `ep2/`, ... → `<series-dir>/out/<name>.mp4`                                                                             |
| `npm run captions <pack-dir>`                                                                                            | Writes `out/captions.txt` (FB/IG captions + hashtags + disclosure, YouTube Shorts title)                                                                                |
| `npm run log -- --post <id> --shot <id> --attempt <n> --credits <n> --accepted <bool> [--reason <text>] [--clip <file>]` | Appends one row to `../production-log.csv`                                                                                                                              |
| `npm run studio`                                                                                                         | Opens Remotion Studio against the sample pack for visual QA                                                                                                             |
| `npm run test`                                                                                                           | Runs the schema unit tests                                                                                                                                              |

Run `prep` and `tts` before `render` — `render` needs the normalised clips and generated VO that
those two stages write.

## Folder rules

```
content/<week>/<post_id>/          # e.g. 2026-W38/standalone_sample-001/
  pack.json                        # source of truth — validated by scripts/validate.ts
  prompts.md                       # master-prompt transcript for this post
  refs/                            # reference images/videos from the master prompt (gitignored)
  stills/                          # end-card background stills, if any (gitignored)
  clips/raw/                       # your Google Flow output, one file per shot (gitignored)
  clips/                           # prep's normalised output (gitignored)
  vo/                              # tts's generated + loudnorm'd VO (gitignored)
  qa/                              # prep's contact sheets (gitignored)
  out/                             # render/captions output — the deliverables (gitignored)

content/<week>/series_<name>/      # a compilation series
  ep1/, ep2/, ep3/, ...            # each is a full post dir as above
  out/                             # render:compilation's output (gitignored)
```

Only `pack.json` and `prompts.md` are committed per post — everything else is generated/regenerable
and gitignored (`projects/**/{clips,vo,out,qa,stills,refs}/` in the repo root `.gitignore`).

A pack with `"_placeholder": true` at the top is scaffolding, not real content — replace it with the
real master-prompt output and delete that field.

## The seven-day rhythm

1. **Sunday** — run the master prompt (`BATCH 7`), save each `pack.json` + `prompts.md` under a new `content/<week>/` folder.
2. **Mon–Wed** — generate each shot's clip in Google Flow, drop the file into that post's `clips/raw/`.
3. **Thu** — run `prep`, `tts`, `render` on each post (and `render:compilation` for the week's compilation) — nothing manual once clips are in.
4. **Fri** — run `captions`, then schedule the posts (manually in Meta Business Suite for now).
5. Log every Flow attempt (accepted or rejected) as you go with `log`, not in a batch at the end.
