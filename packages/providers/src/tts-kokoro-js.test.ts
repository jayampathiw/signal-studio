import assert from 'node:assert/strict';
import { test } from 'node:test';

import { TtsResult } from './contracts.ts';
import { createKokoroJsProvider } from './tts-kokoro-js.ts';

// Real synthesis — downloads the ~80MB Kokoro-82M ONNX model on first run
// (cached under ~/.cache/kokoro-js after that). Opt-in only, same convention
// as storage-r2.test.ts. Run with:
//   PROVIDERS_REAL=1 pnpm --filter @signal-studio/providers test
const REAL = process.env.PROVIDERS_REAL === '1';

test(
  'tts-kokoro-js (real): synthesises real audio and measures duration',
  { skip: !REAL },
  async () => {
    const provider = createKokoroJsProvider();
    const result = await provider.synthesise({
      text: 'The quick brown fox jumps over the lazy dog.',
      voice: 'bm_george',
      speed: 1,
    });
    assert.equal(TtsResult.safeParse(result).success, true);
    assert.ok(result.durationSec > 0.5 && result.durationSec < 10);
  },
);

test('tts-kokoro-js (real): rejects an unknown voice', { skip: !REAL }, async () => {
  const provider = createKokoroJsProvider();
  await assert.rejects(
    () => provider.synthesise({ text: 'hello', voice: 'not-a-real-voice', speed: 1 }),
    /unknown voice/,
  );
});
