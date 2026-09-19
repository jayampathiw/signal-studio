import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { createR2StorageProvider, readR2ConfigFromEnv } from './storage-r2.ts';

test('readR2ConfigFromEnv: throws listing every missing var', () => {
  const prev = { ...process.env };
  for (const k of [
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_PUBLIC_BASE_URL',
    'R2_BUCKET_RENDERED',
  ]) {
    delete process.env[k];
  }
  try {
    assert.throws(
      () => readR2ConfigFromEnv(),
      /R2_ACCOUNT_ID.*R2_ACCESS_KEY_ID.*R2_SECRET_ACCESS_KEY.*R2_PUBLIC_BASE_URL.*R2_BUCKET_RENDERED/s,
    );
  } finally {
    process.env = prev;
  }
});

test('readR2ConfigFromEnv: reads a custom bucket env var name', () => {
  const prev = { ...process.env };
  Object.assign(process.env, {
    R2_ACCOUNT_ID: 'acct',
    R2_ACCESS_KEY_ID: 'key',
    R2_SECRET_ACCESS_KEY: 'secret',
    R2_PUBLIC_BASE_URL: 'https://pub.example',
    R2_BUCKET_INBOX: 'inbox-bucket',
  });
  try {
    const cfg = readR2ConfigFromEnv('R2_BUCKET_INBOX');
    assert.equal(cfg.bucket, 'inbox-bucket');
    assert.equal(cfg.accountId, 'acct');
  } finally {
    process.env = prev;
  }
});

// Real network round-trip against R2 — opt-in only (never in CI). Run with:
//   set -a && source .env && set +a && PROVIDERS_REAL=1 pnpm --filter @signal-studio/providers test
const REAL = process.env.PROVIDERS_REAL === '1';
test('storage-r2 (real): put + signedUrl + presignUpload round-trip', { skip: !REAL }, async () => {
  const cfg = readR2ConfigFromEnv();
  const provider = createR2StorageProvider(cfg);

  const tmp = await mkdtemp(path.join(os.tmpdir(), 'storage-r2-test-'));
  try {
    const srcFile = path.join(tmp, 'src.txt');
    const content = `providers-contract-test-${Date.now()}`;
    await writeFile(srcFile, content);

    const key = `providers-contract-test/${Date.now()}.txt`;
    const putResult = await provider.put({ localPath: srcFile, key });
    assert.match(putResult.url, new RegExp(key.replace(/\//g, '\\/')));

    const getUrl = await provider.signedUrl(key);
    const res = await fetch(getUrl);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), content);

    const uploadUrl = await provider.presignUpload(`${key}.upload`);
    assert.match(uploadUrl, /X-Amz-Signature/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});
