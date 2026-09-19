import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { StorageResult } from './contracts.ts';
import { createLocalStorageProvider } from './storage-local.ts';

test('storage-local: put copies the file, signedUrl/presignUpload point at it', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'storage-local-test-'));
  try {
    const srcFile = path.join(tmp, 'src.txt');
    await writeFile(srcFile, 'hello world');

    const provider = createLocalStorageProvider(path.join(tmp, 'root'));
    const result = await provider.put({ localPath: srcFile, key: 'clips/x.txt' });
    assert.equal(StorageResult.safeParse(result).success, true);
    assert.match(result.url, /^file:\/\//);

    const destPath = path.join(tmp, 'root', 'clips', 'x.txt');
    assert.equal(await readFile(destPath, 'utf8'), 'hello world');

    const signed = await provider.signedUrl('clips/x.txt');
    const presign = await provider.presignUpload('clips/x.txt');
    assert.match(signed, /clips\/x\.txt$/);
    assert.match(presign, /clips\/x\.txt$/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('storage-local: put creates nested key directories', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'storage-local-test-'));
  try {
    const srcFile = path.join(tmp, 'src.txt');
    await writeFile(srcFile, 'nested');

    const provider = createLocalStorageProvider(path.join(tmp, 'root'));
    await provider.put({ localPath: srcFile, key: 'a/b/c/deep.txt' });

    assert.equal(
      await readFile(path.join(tmp, 'root', 'a', 'b', 'c', 'deep.txt'), 'utf8'),
      'nested',
    );
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});
