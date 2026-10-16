# `examples/shorts-916`

A minimal, real (not fabricated) `shorts-916` fixture — one hook scene with a
synthetic still (`ffmpeg -f lavfi`) and a valid `manifest.json`/`project.json`
pair. Deliberately uses a single `vo` scene, not `vo_parts` — `ss run-local`
doesn't implement the two-part pause-concat ffmpeg path (`run-job.ts`'s own
`synthPausedVo`); use `ss run-job` for a real `vo_parts` scene.

Used by P3's T-L test gate — `ss run-local --fake` swaps TTS synthesis and
the ffmpeg render for instant stand-ins.

```
node --experimental-strip-types apps/worker/src/cli.ts run-local \
  --manifest examples/shorts-916/manifest.json \
  --project examples/shorts-916/project.json \
  --out /tmp/example-out \
  --fake
```
