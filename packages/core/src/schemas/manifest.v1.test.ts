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
  assert.equal(result.audio.voice, undefined); // left to the project's defaults
  assert.equal(result.audio.speed, undefined);
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

test('P2.2 addition: compilationTargetS is optional, accepted when set', () => {
  assert.equal(Manifest.safeParse(validManifest()).success, true);
  const result = Manifest.parse(validManifest({ compilationTargetS: 90 }));
  assert.equal(result.compilationTargetS, 90);
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

test('case-file shot accepts durationSecs + visual, rejects a non-positive durationSecs', () => {
  const caseFile = {
    template: 'case-file',
    visual: { mode: 'case-file' },
    end_card: undefined,
    case_file: { caseId: 'c1' },
  };
  const ok = Manifest.parse(
    validManifest({
      ...caseFile,
      shots: [
        { id: 's1', durationSecs: 4, visual: { kind: 'pointerCard', text: 'Ask in writing.' } },
      ],
    }),
  );
  assert.equal(ok.shots[0]!.durationSecs, 4);
  assert.deepEqual(ok.shots[0]!.visual, { kind: 'pointerCard', text: 'Ask in writing.' });

  const bad = Manifest.safeParse(
    validManifest({ ...caseFile, shots: [{ id: 's1', durationSecs: 0 }] }),
  );
  assert.equal(bad.success, false);
});

test('shorts-916 sound_design scene numbers are 1-based and range-checked', () => {
  const shorts = (sound_design: Record<string, unknown>) =>
    Manifest.safeParse(
      validManifest({
        template: 'shorts-916',
        visual: { mode: 'shorts-916' },
        end_card: undefined,
        shots: [],
        shorts916: {
          output: 'x.mp4',
          scenes: [
            { image: 'S01-A', vo: 'one', target_duration_sec: 3 },
            { image: 'S02-A', vo: 'two', target_duration_sec: 3 },
            { image: 'S03-A', vo: 'three', target_duration_sec: 3 },
          ],
          sound_design,
        },
      }),
    );
  const messages = (r: ReturnType<typeof shorts>) =>
    r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);

  assert.equal(shorts({ bed: { key: 'tension', start_scene: 1, end_scene: 3 } }).success, true);
  assert.equal(shorts({ bed: { key: 'tension', start_scene: 3, end_scene: null } }).success, true);

  assert.match(
    messages(shorts({ bed: { key: 'tension', start_scene: 0 } })).join('\n'),
    /bed\.start_scene: scenes are numbered from 1/,
  );
  assert.match(
    messages(shorts({ heartbeat: { key: 'heartbeat', start_scene: 2, end_scene: 4 } })).join('\n'),
    /heartbeat\.end_scene: scene 4 doesn't exist: scenes are numbered 1\.\.3/,
  );
  assert.match(
    messages(shorts({ bed: { key: 'tension', start_scene: 3, end_scene: 2 } })).join('\n'),
    /bed\.end_scene: end_scene \(2\) is before start_scene \(3\)/,
  );
});
