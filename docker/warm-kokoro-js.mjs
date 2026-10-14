// Bakes the kokoro-js ONNX model into the image build layer (see
// docker/Dockerfile's "prewarm" stage) so a worker container never does a
// first-run download in production.
//
// Must run as a real file, not `node -e "..."` — under
// --experimental-strip-types, an inline eval script's dynamically-imported
// modules get the wrong `import.meta.dirname` (it resolves to the eval
// script's own working directory rather than the loaded module's real file
// location), which breaks kokoro-js's internal voice-file path resolution
// (`path.resolve(import.meta.dirname, '../voices/<id>.bin')` inside
// kokoro-js's dist/kokoro.js). Confirmed by reproducing the exact failure
// (ENOENT on a voices/*.bin path resolved relative to the wrong directory)
// with `-e` and confirming a real file doesn't hit it.
import { createKokoroJsProvider } from '../packages/providers/src/tts-kokoro-js.ts';

const provider = createKokoroJsProvider({ loudnorm: false });
await provider.synthesise({ text: 'warm up', voice: 'bm_george', speed: 1 });
// This repo's no-console rule only allows console.error, even for
// informational build-time output.
console.error('kokoro-js model cached');
