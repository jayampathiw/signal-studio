import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isKokoroJsVoice, routeTtsByVoice } from './tts.ts';

test('isKokoroJsVoice: English a*/b* voices only', () => {
  for (const v of ['bm_george', 'am_michael', 'af_heart', 'bf_emma'])
    assert.equal(isKokoroJsVoice(v), true, v);
  for (const v of ['ff_siwis', 'if_sara', 'em_alex', 'pm_alex', ''])
    assert.equal(isKokoroJsVoice(v), false, v);
});

test('routeTtsByVoice: English → js, French → py', async () => {
  const calls: string[] = [];
  const fake = (name: string) => async (args: { voice: string }) => {
    calls.push(`${name}:${args.voice}`);
    return { wavPath: `/tmp/${name}.wav`, durationSec: 1 };
  };
  const tts = routeTtsByVoice(fake('js'), fake('py'));
  await tts({ text: 'hi', voice: 'bm_george', speed: 1 });
  await tts({ text: 'salut', voice: 'ff_siwis', speed: 1 });
  assert.deepEqual(calls, ['js:bm_george', 'py:ff_siwis']);
});
