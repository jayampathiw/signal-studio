import assert from 'node:assert/strict';
import { test } from 'node:test';

import { mapAudioCue, mapAllCues, type SfxEvent } from './map-audio-cues.ts';

test('mapAudioCue: real cue text maps to the right kit key', () => {
  assert.deepEqual(mapAudioCue('Heartbeat rhythm builds under the VO'), {
    sfx: [{ key: 'heartbeat' }],
    unmatched: [],
  });
  assert.deepEqual(mapAudioCue('A low, heavy drum hit on the cut.'), {
    sfx: [{ key: 'drum_hit' }],
    unmatched: [],
  });
});

test('mapAudioCue: "hold for N-second silence" maps to a silence directive with hold_sec', () => {
  const result = mapAudioCue('Hold for 2-second silence after the miss');
  assert.deepEqual(result, { sfx: [{ key: 'silence', hold_sec: 2 }], unmatched: [] });
});

test('mapAudioCue: noop rules (ring-out, "let the card land") produce no SFX but count as matched', () => {
  assert.deepEqual(mapAudioCue('let it ring out'), { sfx: [], unmatched: [] });
  assert.deepEqual(mapAudioCue('let the card land'), { sfx: [], unmatched: [] });
});

test('mapAudioCue: unrecognised cue text is reported unmatched, not silently dropped', () => {
  const result = mapAudioCue('Some unknown FX description here');
  assert.deepEqual(result, { sfx: [], unmatched: ['Some unknown FX description here'] });
});

test('mapAudioCue: no cue at all is neither matched nor unmatched', () => {
  assert.deepEqual(mapAudioCue(undefined), { sfx: [], unmatched: [] });
  assert.deepEqual(mapAudioCue(null), { sfx: [], unmatched: [] });
});

test('mapAllCues: writes .sfx onto each scene, collects unmatched with scene_n', () => {
  const scenes: Array<{ scene_n: number; audio_cue?: string; sfx?: SfxEvent[] }> = [
    { scene_n: 37, audio_cue: 'Heartbeat rhythm builds under the VO' },
    { scene_n: 99, audio_cue: 'Some unknown FX description here' },
    { scene_n: 100 },
  ];
  const unmatched = mapAllCues(scenes);
  assert.deepEqual(scenes[0].sfx, [{ key: 'heartbeat' }]);
  assert.deepEqual(scenes[1].sfx, []);
  assert.equal(scenes[2].sfx, undefined);
  assert.deepEqual(unmatched, [{ scene_n: 99, cue: 'Some unknown FX description here' }]);
});
