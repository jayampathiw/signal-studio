import assert from 'node:assert/strict';
import { test } from 'node:test';

import { TtsResult } from './contracts.ts';
import { createPiperProvider } from './tts-piper.ts';

// Real synthesis — needs a real Piper .onnx voice model on disk (Piper
// models aren't committed to this repo, same reason `packages/media/
// piper-voices/` is gitignored: large binaries). Point TEST_PIPER_VOICE at
// one (e.g. a public voice downloaded from huggingface.co/rhasspy/
// piper-voices) to exercise this for real; skipped otherwise, same
// opt-in convention as tts-kokoro-js.test.ts. Verified for real this pass
// against `en_US-lessac-medium.onnx`.
const REAL = process.env.PROVIDERS_REAL === '1' && !!process.env.TEST_PIPER_VOICE;

test(
  'tts-piper (real): synthesises real audio and measures duration',
  { skip: !REAL },
  async () => {
    const provider = createPiperProvider();
    const result = await provider.synthesise({
      text: 'The quick brown fox jumps over the lazy dog.',
      voice: process.env.TEST_PIPER_VOICE!,
      speed: 1,
    });
    assert.equal(TtsResult.safeParse(result).success, true);
    assert.ok(result.durationSec > 0.5 && result.durationSec < 10);
  },
);
