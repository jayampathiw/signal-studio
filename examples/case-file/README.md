# `examples/case-file`

A minimal, real (not fabricated) `case-file` fixture — one document shot
with a synthetic image (`ffmpeg -f lavfi`) and a valid
`manifest.json`/`project.json` pair.

Used by P3's T-L test gate — `ss run-local --fake` swaps TTS synthesis and
the Remotion render for instant stand-ins.

```
node --experimental-strip-types apps/worker/src/cli.ts run-local \
  --manifest examples/case-file/manifest.json \
  --project examples/case-file/project.json \
  --out /tmp/example-out \
  --fake
```
