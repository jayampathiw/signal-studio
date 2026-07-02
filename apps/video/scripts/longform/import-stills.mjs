import { parseArgs } from 'util';
import { readdirSync, readFileSync } from 'fs';
import { resolve, extname, basename } from 'path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getServiceClient } from '@signal-studio/database';
import { env } from '@signal-studio/config';

const { values } = parseArgs({
  options: {
    project: { type: 'string' },
    dir:     { type: 'string' },
    dry:     { type: 'boolean', default: false },
  },
  strict: false,
});

if (!values.project) { console.error('Error: --project <id> required'); process.exit(2); }
if (!values.dir)     { console.error('Error: --dir <folder> required'); process.exit(2); }

const projectId = Number(values.project);
const dry = values.dry;
const db = getServiceClient();

function getR2() {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });
}

const EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

async function main() {
  const dir = resolve(values.dir);
  let files;
  try {
    files = readdirSync(dir);
  } catch {
    console.error(`Cannot read directory: ${dir}`);
    process.exit(1);
  }

  const matched = files
    .filter((f) => EXTS.has(extname(f).toLowerCase()) && /^S\d+\./i.test(basename(f)))
    .map((f) => ({ file: f, scene_n: Number(f.match(/^S(\d+)\./i)[1]) }))
    .sort((a, b) => a.scene_n - b.scene_n);

  if (!matched.length) {
    console.error(`No S<n>.png/jpg/jpeg/webp files found in ${dir}`);
    console.error('imported 0, skipped 0, unmatched 0');
    return;
  }

  const r2 = dry ? null : getR2();
  const counts = { imported: 0, skipped: 0, unmatched: 0 };

  for (const { file, scene_n } of matched) {
    const { data: rows, error } = await db
      .from('content_clips')
      .select('id, status')
      .eq('project_id', projectId)
      .eq('scene_n', scene_n)
      .eq('image_source', 'google')
      .limit(1);
    if (error) throw new Error(error.message);

    if (!rows?.length) {
      console.error(`[warn] S${scene_n}: no matching google row — skipped`);
      counts.unmatched++;
      continue;
    }

    const row = rows[0];
    if (row.status === 'generated' || row.status === 'passed') {
      console.error(`[skip] S${scene_n}: already ${row.status}`);
      counts.skipped++;
      continue;
    }

    const key = `longform/${projectId}/stills/S${scene_n}.png`;
    const r2Url = `${env.R2_PUBLIC_BASE_URL}/${key}`;

    if (dry) {
      console.error(`[dry]  S${scene_n}: ${resolve(dir, file)} → ${r2Url}`);
      counts.imported++;
      continue;
    }

    const buf = readFileSync(resolve(dir, file));
    await r2.send(new PutObjectCommand({
      Bucket: env.R2_BUCKET_RENDERED,
      Key: key,
      Body: buf,
      ContentType: 'image/png',
    }));

    const { error: updateErr } = await db
      .from('content_clips')
      .update({ clip_url: r2Url, status: 'generated' })
      .eq('id', row.id);
    if (updateErr) throw new Error(`DB update S${scene_n}: ${updateErr.message}`);

    console.error(`[import] S${scene_n} → ${r2Url}`);
    counts.imported++;
  }

  console.error(`\nimported ${counts.imported}, skipped ${counts.skipped}, unmatched ${counts.unmatched}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
