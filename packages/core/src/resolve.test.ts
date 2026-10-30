import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolveJob } from './resolve.ts';
import { Manifest } from './schemas/manifest.v1.ts';
import { Project } from './schemas/project.v1.ts';

const project = Project.parse({
  slug: 'test-project',
  orgId: 'org-1',
  defaults: { template: 'clips-overlay', voice: 'af_heart', speed: 1.0, outputs: ['fb', 'ig'] },
  gates: ['image-quality-gate'],
  providers: {
    tts: 'kokoro',
    captions: 'claude',
    image: 'higgsfield',
    storage: 'r2',
    publish: 'facebook',
  },
});

const manifest = Manifest.parse({
  version: '1',
  projectRef: 'wildlife/intimacy/EN',
  template: 'clips-overlay',
  visual: { mode: 'clips-overlay' },
  shots: [{ id: 's1', clip: 's1.mp4', overlay_out_s: 4.5, voiceover_text: 'a fact' }],
  end_card: { subject: 'Mimic octopus', disclosure: 'AI visualisation' },
  outputs: ['fb'],
  gates: ['continuity-checker'],
});

test('resolveJob snapshot: manifest fields win, gates are additive', () => {
  const resolved = resolveJob(project, manifest);

  assert.deepEqual(resolved, {
    manifest,
    projectSlug: 'test-project',
    orgId: 'org-1',
    template: 'clips-overlay',
    voice: 'af_heart', // manifest sets no audio, so the project's default applies
    speed: 1.0,
    outputs: ['fb'], // manifest declared one output; project default (fb, ig) not used
    gates: ['image-quality-gate', 'continuity-checker'],
    providers: {
      tts: 'kokoro',
      captions: 'claude',
      image: 'higgsfield',
      storage: 'r2',
      publish: 'facebook',
    },
  });
});

test('resolveJob: voice/speed come from the project unless the manifest sets them', () => {
  const slow = Project.parse({ ...project, defaults: { ...project.defaults, speed: 1.15 } });
  assert.deepEqual((({ voice, speed }) => ({ voice, speed }))(resolveJob(slow, manifest)), {
    voice: 'af_heart',
    speed: 1.15,
  });
  const own = Manifest.parse({ ...manifest, audio: { voice: 'am_michael', speed: 0.9 } });
  const resolved = resolveJob(slow, own);
  assert.deepEqual(
    { voice: resolved.voice, speed: resolved.speed },
    { voice: 'am_michael', speed: 0.9 },
  );
  const voiceOnly = Manifest.parse({ ...manifest, audio: { voice: 'am_michael' } });
  assert.equal(resolveJob(slow, voiceOnly).speed, 1.15);
});

test('resolveJob falls back to project defaults.outputs when manifest.outputs somehow empty', () => {
  // outputs can't actually be empty post-schema (min(1)), but resolve.ts's
  // own fallback logic is exercised directly here for the untyped-input case
  // (e.g. a manifest object built by hand, not through Manifest.parse).
  const bareManifest = { ...manifest, outputs: [] as string[] };
  const resolved = resolveJob(project, bareManifest);
  assert.deepEqual(resolved.outputs, ['fb', 'ig']);
});

test('resolveJob returns a frozen object', () => {
  const resolved = resolveJob(project, manifest);
  assert.throws(() => {
    // @ts-expect-error intentionally mutating a frozen object
    resolved.voice = 'changed';
  });
});
