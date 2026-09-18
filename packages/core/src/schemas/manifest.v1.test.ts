import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Manifest } from './manifest.v1.ts';

function validManifest(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    version: '1',
    projectRef: 'wildlife/intimacy/EN',
    template: 'clips-overlay',
    visual: { mode: 'clips-overlay' },
    shots: [
      {
        id: 's1',
        clip: 's1.mp4',
        overlay_out_s: 4.5,
        voiceover_text: 'A fact about the octopus.',
      },
    ],
    end_card: { subject: 'Mimic octopus', disclosure: 'AI visualisation' },
    outputs: ['fb'],
    ...overrides,
  };
}

test('valid manifest passes', () => {
  const result = Manifest.safeParse(validManifest());
  assert.equal(result.success, true);
});

test('defaults apply (audio, watermark, gates, publish, inputs)', () => {
  const result = Manifest.parse(validManifest());
  assert.equal(result.audio.voice, 'bm_george');
  assert.equal(result.watermark.text, 'AI visualisation');
  assert.deepEqual(result.gates, []);
  assert.deepEqual(result.publish, []);
  assert.deepEqual(result.inputs.jobs, []);
});

test('wrong version literal fails', () => {
  const result = Manifest.safeParse(validManifest({ version: '2' }));
  assert.equal(result.success, false);
});

test('empty outputs fails (min 1)', () => {
  const result = Manifest.safeParse(validManifest({ outputs: [] }));
  assert.equal(result.success, false);
});

test('7 shots fails (max 6)', () => {
  const shot = validManifest().shots[0];
  const result = Manifest.safeParse(validManifest({ shots: Array(7).fill(shot) }));
  assert.equal(result.success, false);
});

test('missing visual.mode fails', () => {
  const result = Manifest.safeParse(validManifest({ visual: {} }));
  assert.equal(result.success, false);
});

test('clips-overlay mode requires a clip on every shot', () => {
  const result = Manifest.safeParse(
    validManifest({ shots: [{ id: 's1', overlay_out_s: 4.5, voiceover_text: 'no clip' }] }),
  );
  assert.equal(result.success, false);
});

test('non-clips-overlay mode allows a shot with no clip/image', () => {
  const result = Manifest.safeParse(
    validManifest({
      visual: { mode: 'stills-kenburns' },
      shots: [{ id: 's1', image: 'still.jpg', overlay_out_s: 4.5, voiceover_text: 'stills mode' }],
    }),
  );
  assert.equal(result.success, true);
});
