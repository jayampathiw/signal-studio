import { readFile } from 'node:fs/promises';

import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import type { StorageProvider, StorageResultT } from './contracts.ts';

export type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
};

/**
 * P2.4 — Cloudflare R2 implementation of StorageProvider. Reads config from
 * the caller (not @signal-studio/config), same reasoning as llm-anthropic:
 * this package shouldn't force the whole platform's required env vars just
 * to talk to R2. `readR2ConfigFromEnv()` below is the convenience path for
 * callers that do want process.env (apps/worker, scripts).
 */
export function createR2StorageProvider(cfg: R2Config): StorageProvider {
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  });

  return {
    async put({ localPath, key }): Promise<StorageResultT> {
      await client.send(
        new PutObjectCommand({
          Bucket: cfg.bucket,
          Key: key,
          Body: await readFile(localPath),
          ContentType: contentTypeFor(key),
        }),
      );
      return { url: `${cfg.publicBaseUrl}/${key}` };
    },
    async signedUrl(key: string): Promise<string> {
      return getSignedUrl(client, new GetObjectCommand({ Bucket: cfg.bucket, Key: key }), {
        expiresIn: 3600,
      });
    },
    async presignUpload(key: string): Promise<string> {
      return getSignedUrl(client, new PutObjectCommand({ Bucket: cfg.bucket, Key: key }), {
        expiresIn: 3600,
      });
    },
  };
}

export function readR2ConfigFromEnv(bucketEnvVar = 'R2_BUCKET_RENDERED'): R2Config {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_BASE_URL } = process.env;
  const bucket = process.env[bucketEnvVar];
  const missing = Object.entries({
    R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
    R2_PUBLIC_BASE_URL,
    [bucketEnvVar]: bucket,
  })
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length > 0) {
    throw new Error(`readR2ConfigFromEnv: missing env var(s): ${missing.join(', ')}`);
  }
  return {
    accountId: R2_ACCOUNT_ID!,
    accessKeyId: R2_ACCESS_KEY_ID!,
    secretAccessKey: R2_SECRET_ACCESS_KEY!,
    bucket: bucket!,
    publicBaseUrl: R2_PUBLIC_BASE_URL!,
  };
}

function contentTypeFor(key: string): string {
  if (key.endsWith('.mp4')) return 'video/mp4';
  if (key.endsWith('.wav')) return 'audio/wav';
  if (key.endsWith('.png')) return 'image/png';
  if (key.endsWith('.jpg') || key.endsWith('.jpeg')) return 'image/jpeg';
  return 'application/octet-stream';
}
