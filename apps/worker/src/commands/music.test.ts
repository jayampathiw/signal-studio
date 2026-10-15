import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { createLogger } from '../logger.ts';
import { musicSyncCommand, type MusicDeps } from './music.ts';

const YAML = `version: 1
tracks:
  - id: tension-01
    file: Tension_01.mp3
    source: pixabay
    licence: pixabay-content-license
    moods: [tension]
  - id: hope-01
    file: Hope_01.mp3
    source: pixabay
    licence: pixabay-content-license
    moods: [hope]
`;

async function setup(yaml = YAML, files = ['Tension_01.mp3', 'Hope_01.mp3', 'stray.mp3']) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'music-sync-test-'));
  for (const f of files) await writeFile(path.join(dir, f), 'audio');
  const libraryPath = path.join(dir, 'library.yaml');
  await writeFile(libraryPath, yaml);
  const inStorage = new Set<string>(['music/hope-01.mp3']);
  const puts: Array<{ key: string; body: string }> = [];
  const deps: MusicDeps = {
    storage: {
      signedUrl: async (key: string) => `https://r2.test/${key}`,
      async put({ localPath, key }: { localPath: string; key: string }) {
        puts.push({ key, body: await readFile(localPath, 'utf8') });
        inStorage.add(key);
        return { url: `https://r2.test/${key}` };
      },
    } as never,
    fetchFn: (async (url: string) =>
      new Response('x', {
        status: inStorage.has(url.replace('https://r2.test/', '')) ? 206 : 404,
      })) as never,
    probeDuration: () => 123.456,
  };
  return { dir, libraryPath, deps, puts, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

const logger = createLogger({ level: 'error' });

test('music sync: uploads only tracks not in storage, then publishes the index with durations', async () => {
  const t = await setup();
  try {
    const r = await musicSyncCommand({ libraryPath: t.libraryPath, dir: t.dir }, t.deps, logger);
    assert.deepEqual(r.uploaded, ['music/tension-01.mp3']);
    assert.deepEqual(r.skipped, ['music/hope-01.mp3']);
    assert.deepEqual(r.extraFiles, ['stray.mp3']);
    assert.deepEqual(
      t.puts.map((p) => p.key),
      ['music/tension-01.mp3', 'music/library.json'],
    );
    const index = JSON.parse(t.puts[1].body);
    assert.equal(index.tracks.length, 2);
    assert.equal(index.tracks[0].duration_s, 123.5);
    assert.equal(index.tracks[0].enabled, true);
  } finally {
    await t.cleanup();
  }
});

test('music sync: --force re-uploads everything; --dry-run writes nothing', async () => {
  const t = await setup();
  try {
    const forced = await musicSyncCommand(
      { libraryPath: t.libraryPath, dir: t.dir, force: true },
      t.deps,
      logger,
    );
    assert.equal(forced.uploaded.length, 2);
    t.puts.length = 0;
    await musicSyncCommand(
      { libraryPath: t.libraryPath, dir: t.dir, force: true, dryRun: true },
      t.deps,
      logger,
    );
    assert.equal(t.puts.length, 0);
  } finally {
    await t.cleanup();
  }
});

test('music sync: refuses to upload anything when a listed file is missing or the yaml is invalid', async () => {
  const missing = await setup(YAML, ['Hope_01.mp3']);
  try {
    await assert.rejects(
      musicSyncCommand(
        { libraryPath: missing.libraryPath, dir: missing.dir },
        missing.deps,
        logger,
      ),
      /Tension_01\.mp3/,
    );
    assert.equal(missing.puts.length, 0);
  } finally {
    await missing.cleanup();
  }
  const bad = await setup(YAML.replace('source: pixabay', 'source: spotify'));
  try {
    await assert.rejects(
      musicSyncCommand({ libraryPath: bad.libraryPath, dir: bad.dir }, bad.deps, logger),
      /invalid/,
    );
    assert.equal(bad.puts.length, 0);
  } finally {
    await bad.cleanup();
  }
});
