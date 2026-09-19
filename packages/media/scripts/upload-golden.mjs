// One-off: upload P0.1's golden reference .mp4s to R2 under golden/<case>/reference.mp4.
// The .mp4s are gitignored (real production-adjacent media); golden.json (the
// measured metrics) stays committed. Run from repo root: pnpm --filter @signal-studio/media exec node scripts/upload-golden.mjs

// Talks to R2 directly rather than via @signal-studio/config's uploadToR2 —
// that helper validates the *entire* platform's required env vars (SUPABASE_*,
// ANTHROPIC_KEY, FAL_KEY) at import time, none of which this one-off script needs.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const repoRoot = path.resolve(import.meta.dirname, '../../..');
const goldenDir = path.join(repoRoot, 'golden');

const {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET_RENDERED,
  R2_PUBLIC_BASE_URL,
} = process.env;
for (const [k, v] of Object.entries({
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET_RENDERED,
  R2_PUBLIC_BASE_URL,
})) {
  if (!v) throw new Error(`Missing required env var: ${k}`);
}

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
});

const cases = readdirSync(goldenDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

for (const name of cases) {
  const localPath = path.join(goldenDir, name, 'reference.mp4');
  if (!existsSync(localPath)) {
    console.error(`skip ${name}: no reference.mp4`);
    continue;
  }
  const key = `golden/${name}/reference.mp4`;
  await r2.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_RENDERED,
      Key: key,
      Body: readFileSync(localPath),
      ContentType: 'video/mp4',
    }),
  );
  console.log(`${name}: ${R2_PUBLIC_BASE_URL}/${key}`);
}
