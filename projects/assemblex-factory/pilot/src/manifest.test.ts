import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Pack, Shot } from './manifest.ts';

function validShot(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 's1',
    clip_file: 's1.mp4',
    overlay_text: 'A fact',
    overlay_out_s: 4.5,
    voiceover_text: 'Some narration.',
    fact_confidence: 'high',
    verify: 'https://example.com',
    ...overrides,
  };
}

function validPack(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    post_id: 'standalone_test-001',
    subject: 'Test subject',
    fact_confidence: 'high',
    verify: 'https://example.com',
    end_card: { subject: 'Test', disclosure: 'AI-narrated.' },
    outputs: ['fb', 'ig'],
    shots: [validShot()],
    ...overrides,
  };
}

test('valid sample pack passes', () => {
  const result = Pack.safeParse(validPack());
  assert.equal(result.success, true);
});

test('valid sample pack applies defaults', () => {
  const result = Pack.safeParse(validPack());
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.mode, 'C');
  assert.equal(result.data.disclosure, true);
  assert.equal(result.data.audio.voice_id, 'bm_george');
  assert.equal(result.data.shots[0].audio.strip_native_audio, false);
});

test('shot missing voiceover_text fails', () => {
  const shot = validShot();
  delete (shot as Record<string, unknown>).voiceover_text;
  const result = Shot.safeParse(shot);
  assert.equal(result.success, false);
  if (result.success) return;
  assert.ok(result.error.issues.some((i) => i.path.join('.') === 'voiceover_text'));
});

test('pack with 7 shots fails (max 6)', () => {
  const shots = Array.from({ length: 7 }, (_, i) => validShot({ id: `s${i + 1}` }));
  const result = Pack.safeParse(validPack({ shots }));
  assert.equal(result.success, false);
  if (result.success) return;
  assert.ok(result.error.issues.some((i) => i.path.join('.') === 'shots'));
});

test('strip_native_audio defaults to false', () => {
  const result = Shot.safeParse(validShot());
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.audio.strip_native_audio, false);
});
