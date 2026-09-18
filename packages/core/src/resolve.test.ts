import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolveJob } from './resolve.ts';
import { Manifest } from './schemas/manifest.v1.ts';
import { Project } from './schemas/project.v1.ts';

const project = Project.parse({
  slug: 'wild-eye',
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
    projectSlug: 'wild-eye',
    orgId: 'org-1',
    template: 'clips-overlay',
    voice: 'bm_george', // manifest's own zod default wins over project's af_heart
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
