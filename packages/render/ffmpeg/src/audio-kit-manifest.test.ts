import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';

import { AUDIO_KIT_MANIFEST_KEY, loadManifest } from './audio-mix.ts';

const saved = {
  dir: process.env.AUDIO_KIT_DIR,
  base: process.env.R2_PUBLIC_BASE_URL,
  fetch: globalThis.fetch,
};

beforeEach(() => {
  delete process.env.AUDIO_KIT_DIR;
  delete process.env.R2_PUBLIC_BASE_URL;
});

afterEach(() => {
  for (const [k, v] of [
    ['AUDIO_KIT_DIR', saved.dir],
    ['R2_PUBLIC_BASE_URL', saved.base],
  ] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  globalThis.fetch = saved.fetch;
});

test('loadManifest: reads AUDIO_KIT_DIR/manifest.json when AUDIO_KIT_DIR is set', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'audio-kit-'));
  try {
    await writeFile(
      path.join(dir, 'manifest.json'),
      JSON.stringify({ hum: { url: 'https://x/hum.mp3' } }),
    );
    process.env.AUDIO_KIT_DIR = dir;
    process.env.R2_PUBLIC_BASE_URL = 'https://r2.example';
    globalThis.fetch = (() => {
      throw new Error('should not fetch when AUDIO_KIT_DIR is set');
    }) as typeof fetch;
    assert.deepEqual(await loadManifest(), { hum: { url: 'https://x/hum.mp3' } });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('loadManifest: without AUDIO_KIT_DIR, fetches audio-kit/manifest.json from R2_PUBLIC_BASE_URL', async () => {
  process.env.R2_PUBLIC_BASE_URL = 'https://r2.example/';
  const requested: string[] = [];
  globalThis.fetch = (async (url: string) => {
    requested.push(url);
    return new Response(
      JSON.stringify({ tension: { url: 'https://r2.example/audio-kit/tension.mp3' } }),
    );
  }) as typeof fetch;

  const manifest = await loadManifest();
  assert.deepEqual(requested, [`https://r2.example/${AUDIO_KIT_MANIFEST_KEY}`]);
  assert.equal(manifest.tension?.url, 'https://r2.example/audio-kit/tension.mp3');
});

test('loadManifest: a missing R2 manifest or no config at all fails with a clear error', async () => {
  await assert.rejects(loadManifest(), /set AUDIO_KIT_DIR .* or R2_PUBLIC_BASE_URL/);

  process.env.R2_PUBLIC_BASE_URL = 'https://r2.example';
  globalThis.fetch = (async () => new Response('nope', { status: 404 })) as unknown as typeof fetch;
  await assert.rejects(
    loadManifest(),
    /HTTP 404 fetching https:\/\/r2\.example\/audio-kit\/manifest\.json/,
  );
});
