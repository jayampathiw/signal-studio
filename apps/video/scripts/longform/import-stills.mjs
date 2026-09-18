import { readdirSync, readFileSync } from 'fs';
import { resolve, extname, basename } from 'path';
import { parseArgs } from 'util';

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { env } from '@signal-studio/config';
import { getServiceClient } from '@signal-studio/database';

const { values } = parseArgs({
  options: {
    project: { type: 'string' },
    dir: { type: 'string' },
    dry: { type: 'boolean', default: false },
    refs: { type: 'boolean', default: false },
  },
  strict: false,
});

if (!values.project) {
  console.error('Error: --project <id> required');
  process.exit(2);
}
if (!values.dir) {
  console.error('Error: --dir <folder> required');
  process.exit(2);
}

const projectId = Number(values.project);
const dry = values.dry;
const refsMode = values.refs;
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

// Match v2 multi-cut filenames: S01-A.png, S12-B.png, S34-CARD.png
const V2_PATTERN = /^S(\d+)-([A-D]|CARD)\./i;
// Match legacy single-still filenames: S5.png (routes to content_clips)
const LEGACY_PATTERN = /^S(\d+)\./i;
// Match kit reference filenames: GK-GILL.png, PY-OUTFIELD.png, DE-GK.png, etc.
const REF_PATTERN = /^([A-Z][A-Z0-9-]+)\./;

async function importRefs(dir, files, r2, counts) {
  const refFiles = files.filter(
    (f) =>
      REF_PATTERN.test(basename(f)) &&
      !V2_PATTERN.test(basename(f)) &&
      !LEGACY_PATTERN.test(basename(f)),
  );

  if (!refFiles.length) {
    console.error(`[warn] No ref files found (expected e.g. GK-GILL.png, PY-OUTFIELD.png)`);
    return;
  }

  for (const file of refFiles) {
    const key = basename(file).replace(/\.[^.]+$/, '');
    const { data: row, error } = await db
      .from('content_references')
      .select('id, status')
      .eq('project_id', projectId)
      .eq('key', key)
      .maybeSingle();
    if (error) throw new Error(error.message);

    if (!row) {
      console.error(
        `[warn] No reference row for key "${key}" — skipped. Valid keys must be seeded first.`,
      );
      counts.unmatched++;
      continue;
    }

    if (row.status === 'passed') {
      console.error(`[skip] REF ${key}: already passed`);
      counts.skipped++;
      continue;
    }

    const r2Key = `longform/${projectId}/refs/${key}.png`;
    const r2Url = `${env.R2_PUBLIC_BASE_URL}/${r2Key}`;

    if (dry) {
      console.error(`[dry][ref] ${key}: ${resolve(dir, file)} → ${r2Url}`);
      counts.imported++;
      continue;
    }

    const buf = readFileSync(resolve(dir, file));
    await r2.send(
      new PutObjectCommand({
        Bucket: env.R2_BUCKET_RENDERED,
        Key: r2Key,
        Body: buf,
        ContentType: 'image/png',
      }),
    );

    const { error: updateErr } = await db
      .from('content_references')
      .update({ url: r2Url, status: 'passed' })
      .eq('id', row.id);
    if (updateErr) throw new Error(`DB update REF ${key}: ${updateErr.message}`);

    console.error(`[ref] ${key} → ${r2Url}`);
    counts.imported++;
  }
}

async function importStills(dir, files, r2, counts) {
  // v2 multi-cut files
  const v2Files = files
    .filter((f) => V2_PATTERN.test(basename(f)))
    .map((f) => {
      const m = basename(f).match(V2_PATTERN);
      return {
        file: f,
        scene_n: Number(m[1]),
        cut: m[2].toUpperCase() === 'CARD' ? 'A' : m[2].toUpperCase(),
      };
    })
    .sort((a, b) => a.scene_n - b.scene_n || a.cut.localeCompare(b.cut));

  // Legacy single-still files (no cut letter) — route to content_clips
  const legacyFiles = files
    .filter((f) => LEGACY_PATTERN.test(basename(f)) && !V2_PATTERN.test(basename(f)))
    .map((f) => ({ file: f, scene_n: Number(basename(f).match(LEGACY_PATTERN)[1]) }))
    .sort((a, b) => a.scene_n - b.scene_n);

  // ── v2 stills ──────────────────────────────────────────────────────────────
  for (const { file, scene_n, cut } of v2Files) {
    const id = `S${String(scene_n).padStart(2, '0')}-${cut}`;
    const { data: rows, error } = await db
      .from('content_stills')
      .select('id, status')
      .eq('project_id', projectId)
      .eq('scene_n', scene_n)
      .eq('cut', cut)
      .limit(1);
    if (error) throw new Error(error.message);

    if (!rows?.length) {
      console.error(`[warn] ${id}: no content_stills row — skipped`);
      counts.unmatched++;
      continue;
    }

    const row = rows[0];
    if (row.status === 'generated' || row.status === 'passed') {
      console.error(`[skip] ${id}: already ${row.status}`);
      counts.skipped++;
      continue;
    }

    const r2Key = `longform/${projectId}/stills/${id}.png`;
    const r2Url = `${env.R2_PUBLIC_BASE_URL}/${r2Key}`;

    if (dry) {
      console.error(`[dry]  ${id}: ${resolve(dir, file)} → ${r2Url}`);
      counts.imported++;
      continue;
    }

    const buf = readFileSync(resolve(dir, file));
    await r2.send(
      new PutObjectCommand({
        Bucket: env.R2_BUCKET_RENDERED,
        Key: r2Key,
        Body: buf,
        ContentType: 'image/png',
      }),
    );

    const { error: updateErr } = await db
      .from('content_stills')
      .update({ clip_url: r2Url, status: 'generated' })
      .eq('id', row.id);
    if (updateErr) throw new Error(`DB update ${id}: ${updateErr.message}`);

    console.error(`[import] ${id} → ${r2Url}`);
    counts.imported++;
  }

  // ── legacy single-still files → content_clips ──────────────────────────────
  for (const { file, scene_n } of legacyFiles) {
    const { data: rows, error } = await db
      .from('content_clips')
      .select('id, status')
      .eq('project_id', projectId)
      .eq('scene_n', scene_n)
      .eq('image_source', 'google')
      .limit(1);
    if (error) throw new Error(error.message);

    if (!rows?.length) {
      console.error(`[warn] S${scene_n}: no matching legacy google row — skipped`);
      counts.unmatched++;
      continue;
    }

    const row = rows[0];
    if (row.status === 'generated' || row.status === 'passed') {
      console.error(`[skip] S${scene_n}: already ${row.status}`);
      counts.skipped++;
      continue;
    }

    const r2Key = `longform/${projectId}/stills/S${scene_n}.png`;
    const r2Url = `${env.R2_PUBLIC_BASE_URL}/${r2Key}`;

    if (dry) {
      console.error(`[dry][legacy] S${scene_n}: ${resolve(dir, file)} → ${r2Url}`);
      counts.imported++;
      continue;
    }

    const buf = readFileSync(resolve(dir, file));
    await r2.send(
      new PutObjectCommand({
        Bucket: env.R2_BUCKET_RENDERED,
        Key: r2Key,
        Body: buf,
        ContentType: 'image/png',
      }),
    );

    const { error: updateErr } = await db
      .from('content_clips')
      .update({ clip_url: r2Url, status: 'generated' })
      .eq('id', row.id);
    if (updateErr) throw new Error(`DB update S${scene_n}: ${updateErr.message}`);

    console.error(`[legacy] S${scene_n} → ${r2Url}`);
    counts.imported++;
  }
}

async function main() {
  const dir = resolve(values.dir);
  let files;
  try {
    files = readdirSync(dir).filter((f) => EXTS.has(extname(f).toLowerCase()));
  } catch {
    console.error(`Cannot read directory: ${dir}`);
    process.exit(1);
  }

  if (!files.length) {
    console.error(`No image files found in ${dir}`);
    return;
  }

  const r2 = dry ? null : getR2();
  const counts = { imported: 0, skipped: 0, unmatched: 0 };

  if (refsMode) {
    await importRefs(dir, files, r2, counts);
  } else {
    await importStills(dir, files, r2, counts);
  }

  console.error(
    `\nimported ${counts.imported}, skipped ${counts.skipped}, unmatched ${counts.unmatched}`,
  );
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
