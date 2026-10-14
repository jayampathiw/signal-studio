# `examples/clips-overlay`

A minimal, real (not fabricated) `clips-overlay` fixture for the fast local
dev loop — a tiny synthetic clip (`clips/raw/s1.mp4`, 3s, generated via
`ffmpeg -f lavfi`) plus a valid `manifest.json`/`project.json` pair.

Used by P2's T-L test gate ("`ss run-local` on `examples/clips-overlay` with
fakes < 3 min") — the real `assets` stage still runs for real against this
clip (ffmpeg is fast on a 3s synthetic source), but TTS synthesis and the
Remotion render are swapped for instant fakes via `--fake`, so the whole
loop finishes in seconds, not the minutes a real `kokoro-js`/Remotion run
takes. This is for quickly checking the pipeline's wiring (stage sequencing,
manifest → Timeline → render call shape) during development, not for
judging real output quality — for that, use real footage and drop `--fake`.

```
node --experimental-strip-types apps/worker/src/cli.ts run-local \
  --manifest examples/clips-overlay/manifest.json \
  --project examples/clips-overlay/project.json \
  --out /tmp/example-out \
  --fake
```
