# `examples/stills-kenburns`

A minimal, real (not fabricated) `stills-kenburns` fixture for the fast
local dev loop — a 3-scene shotlist-v2 blob (the same minimal real sample
`parse-shotlist-v2.test.ts` already uses) plus 3 synthetic stills
(`ffmpeg -f lavfi` solid-color PNGs) and a valid `manifest.json`/`project.json`
pair.

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
