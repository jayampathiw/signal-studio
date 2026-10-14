import { readFileSync } from 'fs';
import { basename } from 'path';

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { env } from '@signal-studio/config';

let _r2 = null;

function getR2Client() {
  if (!_r2) {
    _r2 = new S3Client({
      region: 'auto',
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return _r2;
}

/**
 * Upload a local file to Cloudflare R2.
 *
 * @param {string} localPath
 * @param {{ bucket?: string, key?: string }} opts
 * @returns {Promise<string>} public URL
 */
export async function uploadToR2(localPath, { bucket, key } = {}) {
  const resolvedBucket = bucket ?? env.R2_BUCKET_RENDERED;
  const resolvedKey = key ?? basename(localPath);

  await getR2Client().send(
    new PutObjectCommand({
      Bucket: resolvedBucket,
      Key: resolvedKey,
      Body: readFileSync(localPath),
      ContentType: localPath.endsWith('.mp4') ? 'video/mp4' : 'application/octet-stream',
    }),
  );

  return `${env.R2_PUBLIC_BASE_URL}/${resolvedKey}`;
}
