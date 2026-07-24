# shorts/

Single working directory for all short-form (vertical, 9:16) clip production and tracking cut from `content/longform/*` videos. Exists so cutting, naming, and posting Shorts doesn't become ad-hoc or scattered across the project.

## Jobs

1. **Keeps every clip file discoverable months later.** One folder per long-form video (slug-named), with a strict naming rule — `{video-slug}-s{N}-{beat-name}-{LANG}.mp4` — so you can find "the Spanish variant of Silenced's reversal clip" instantly instead of guessing from a flat pile of files.

2. **Separates source material from finished output.** `src/` holds the re-framed 9:16 stills/segments before rendering; `thumbs/` holds optional custom Short thumbnails. Keeps raw assets and final exports from getting mixed together.

3. **Gives the tracker a fixed home** (`tracker.csv`) — the single spreadsheet where every clip's hook line, language, posting dates, and performance numbers live. Without a fixed location, the tracker (the only tool for A/B-testing hooks and proving the funnel works) drifts out of sync with the actual files.

In short: this is the infrastructure that makes "a video isn't done until its 3 Shorts are live" (SOP Phase 6) actually operable.

## Layout

```
shorts/
  <video-slug>/
    thumbs/    # optional custom Short thumbnails
    src/       # re-framed 9:16 stills/segments, pre-render
  tracker.csv  # hook lines, language, posting dates, performance
```

Rendered/final clips live at the video-slug root (not in `src/`), named `{video-slug}-s{N}-{beat-name}-{LANG}.mp4`.

## Status (2026-07-24)

- **Silenced** — all 3 rows in `tracker.csv` filled (beat + hook line drafted from its shot list).
- **Same Coin, Son Also Saves, One Match Short, Fifth Match** — rows exist with beat category (peak/reversal/meaning) but hook line is blank, flagged `NEEDS SHOT LIST` in the notes column. Fill from the video's shot list, don't invent beats.

Filling the tracker's hook-line column is a Day 2 deliverable; cutting is Day 3–4.
