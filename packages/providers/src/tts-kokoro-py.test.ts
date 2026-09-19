import assert from 'node:assert/strict';
import { test } from 'node:test';

import { TtsResult } from './contracts.ts';
import { createKokoroPyProvider } from './tts-kokoro-py.ts';

// Real synthesis via the `kokoro` python package (see packages/media/tts.py).
// Opt-in only — this sandbox doesn't have `kokoro` installed for python3, so
// this has NOT been run for real; wire up a python env with `pip install
// kokoro soundfile numpy` before trusting this beyond typecheck. Run with:
//   PROVIDERS_REAL=1 pnpm --filter @signal-studio/providers test
const REAL = process.env.PROVIDERS_REAL === '1';

test(
  'tts-kokoro-py (real): synthesises real audio and measures duration',
  { skip: !REAL },
  async () => {
    const provider = createKokoroPyProvider();
    const result = await provider.synthesise({
      text: 'The quick brown fox jumps over the lazy dog.',
      voice: 'af_bella',
      speed: 0.85,
    });
    assert.equal(TtsResult.safeParse(result).success, true);
    assert.ok(result.durationSec > 0.5 && result.durationSec < 10);
  },
);
