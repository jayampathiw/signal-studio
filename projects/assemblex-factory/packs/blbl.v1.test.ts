import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { packToManifest } from './blbl.v1.ts';
import { Pack } from './pack.schema.ts';

const PILOT_PACK_PATH = path.resolve(
  import.meta.dirname,
  '../content/2026-W38/standalone_sample-001/pack.json',
);

async function loadPilotPack() {
  const raw = JSON.parse(await readFile(PILOT_PACK_PATH, 'utf8'));
  return Pack.parse(raw);
}

test('packToManifest: converts the real pilot pack.json into a valid manifest.v1', async () => {
  const pack = await loadPilotPack();
  const manifest = packToManifest(pack, { projectRef: 'assemblex-factory' });

  assert.equal(manifest.version, '1');
  assert.equal(manifest.projectRef, 'assemblex-factory');
  assert.equal(manifest.template, 'clips-overlay');
  assert.equal(manifest.visual.mode, 'clips-overlay');
  assert.equal(manifest.shots.length, pack.shots.length);
  assert.deepEqual(manifest.outputs, ['fb', 'ig']);
  assert.equal(manifest.disclosure, true);
});

test('packToManifest: maps each shot field to its manifest.v1 equivalent', async () => {
  const pack = await loadPilotPack();
  const manifest = packToManifest(pack, { projectRef: 'assemblex-factory' });

  const packShot = pack.shots[0];
  const manifestShot = manifest.shots[0];

  assert.equal(manifestShot.id, packShot.id);
  assert.equal(manifestShot.clip, packShot.clip_file);
  assert.equal(manifestShot.overlay_text, packShot.overlay_text);
  assert.equal(manifestShot.voiceover_text, packShot.voiceover_text);
  assert.equal(manifestShot.ig_optional, packShot.ig_optional);
  assert.deepEqual(manifestShot.audio, packShot.audio);
  assert.equal(manifestShot.fact_confidence, packShot.fact_confidence);
  // Pilot-script-written-back fields don't exist on manifest.v1's Shot at all.
  assert.equal((manifestShot as Record<string, unknown>).duration_s, undefined);
  assert.equal((manifestShot as Record<string, unknown>).voiceover_file, undefined);
});

test('packToManifest: maps audio/music, end_card, watermark, captions straight through', async () => {
  const pack = await loadPilotPack();
  const manifest = packToManifest(pack, { projectRef: 'assemblex-factory' });

  assert.equal(manifest.audio.voice, pack.audio.voice_id);
  assert.equal(manifest.audio.speed, pack.audio.voice_speed);
  assert.equal(manifest.audio.music.mood, pack.music.mood);
  assert.equal(manifest.audio.music.gain_db, pack.music.gain_db);
  assert.deepEqual(manifest.end_card, pack.end_card);
  assert.deepEqual(manifest.watermark, pack.watermark);
  assert.equal(manifest.captions.facebook, pack.captions.facebook);
});

test('packToManifest: gates/publish default empty — not on Pack, not guessed at', async () => {
  const pack = await loadPilotPack();
  const manifest = packToManifest(pack, { projectRef: 'assemblex-factory' });

  assert.deepEqual(manifest.gates, []);
  assert.deepEqual(manifest.publish, []);
});
