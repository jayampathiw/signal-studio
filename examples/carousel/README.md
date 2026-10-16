# `examples/carousel`

A minimal, real (not fabricated) `carousel` fixture — 2 slides plus a
synthetic watermark logo (`ffmpeg -f lavfi`) and a valid
`manifest.json`/`project.json` pair.

Used by P3's T-L test gate — `ss run-local --fake` swaps the Remotion
still-render for an instant stand-in (no TTS involved at all — `carousel`'s
`compile()` has no narration/duration concept, see its own header).
Unlike every other template, the output is N still PNGs, not one video —
`ss run-local`'s result has a single `carousel` key holding the slide paths.

```
node --experimental-strip-types apps/worker/src/cli.ts run-local \
  --manifest examples/carousel/manifest.json \
  --project examples/carousel/project.json \
  --out /tmp/example-out \
  --fake
```
