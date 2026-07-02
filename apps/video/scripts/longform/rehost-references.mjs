import { parseArgs } from 'util';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getServiceClient } from '@signal-studio/database';
import { env } from '@signal-studio/config';

const { values } = parseArgs({
  options: {
    project: { type: 'string' },
    dry: { type: 'boolean', default: false },
  },
  strict: false,
});

if (!values.project) { console.error('Error: --project <id> required'); process.exit(2); }
const projectId = Number(values.project);
const dry = values.dry;
const db = getServiceClient();

function getR2Client() {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });
}

async function uploadBuffer(r2, buf, key) {
  await r2.send(new PutObjectCommand({
    Bucket: env.R2_BUCKET_RENDERED,
    Key: key,
    Body: buf,
    ContentType: 'image/png',
  }));
  return `${env.R2_PUBLIC_BASE_URL}/${key}`;
}

async function main() {
  const { data: refs, error } = await db
    .from('content_references')
    .select('id, key, url, higgsfield_media_id')
    .eq('project_id', projectId);
  if (error) throw new Error(error.message);
  if (!refs?.length) { console.error('No references found for project', projectId); return; }

  const r2PublicBase = env.R2_PUBLIC_BASE_URL ?? '';
  const r2 = dry ? null : getR2Client();

  let uploaded = 0;
  let skipped = 0;

  for (const ref of refs) {
    if (ref.url && r2PublicBase && ref.url.startsWith(r2PublicBase)) {
      console.error(`[skip] ${ref.key} already on R2`);
      skipped++;
      continue;
    }

    const r2Key = `longform/${projectId}/refs/${ref.key}.png`;
    const newUrl = `${r2PublicBase}/${r2Key}`;

    if (dry) {
      console.error(`[dry]  ${ref.key} → ${newUrl}`);
      uploaded++;
      continue;
    }

    const res = await fetch(ref.url);
    if (!res.ok) throw new Error(`fetch ${ref.url} → ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());

    const publicUrl = await uploadBuffer(r2, buf, r2Key);

    const { error: updateErr } = await db
      .from('content_references')
      .update({ url: publicUrl })
      .eq('id', ref.id);
    if (updateErr) throw new Error(`DB update for ${ref.key}: ${updateErr.message}`);

    console.error(`[upload] ${ref.key} → ${publicUrl}`);
    uploaded++;
  }

  console.error(`\n${uploaded} uploaded, ${skipped} skipped`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
