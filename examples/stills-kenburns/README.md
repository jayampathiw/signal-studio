# `examples/stills-kenburns`

A minimal, real (not fabricated) `stills-kenburns` fixture for the fast
local dev loop — a 3-scene shotlist-v2 blob (the same minimal real sample
`parse-shotlist-v2.test.ts` already uses, with scene 3's end-card text given
its own background still too) plus 4 synthetic stills (`ffmpeg -f lavfi`
solid-color PNGs) and a valid `manifest.json`/`project.json` pair.

**Scene 3's background still matters for more than `--fake`** (P3's T-G
gate, 2026-10-17): a title-only scene with no still at all renders a
genuinely black background for its full duration, which real-QA's
`blackFrames` check correctly flags as a failure — `qa.ts`'s own
`ignoreBlackAfterSec` escape hatch (built for `clips-overlay`'s dark end
card) isn't wired through this template's handler. Found running a real
(non-`--fake`) job through `run-job.yml` against `:dev`; fixed here by
giving the fixture a real background instead of chasing the QA-stage gap —
flagged as a real finding in the plan's T-G entry, not silently patched.

Used by P3's T-L test gate ("`examples/{stills-kenburns,...}` render with
fakes in CI time") — `ss run-local --fake` swaps TTS synthesis and the
ffmpeg render for instant stand-ins, so the whole loop finishes in seconds.
This checks the pipeline's wiring (shotlist parsing → `compile()` → render
dispatch), not real output quality — for that, use real stills/VO and drop
`--fake`.

```
node --experimental-strip-types apps/worker/src/cli.ts run-local \
  --manifest examples/stills-kenburns/manifest.json \
  --project examples/stills-kenburns/project.json \
  --out /tmp/example-out \
  --fake
```
