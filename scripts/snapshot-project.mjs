import { createHash } from 'crypto';
import { mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { parseArgs } from 'util';

import { getServiceClient } from '@signal-studio/database';

const { values } = parseArgs({
  options: { project: { type: 'string' } },
  strict: false,
});

if (!values.project) {
  console.error('Error: --project <id> required');
  process.exit(2);
}

const projectId = Number(values.project);
const db = getServiceClient();

async function main() {
  const { data: item, error: iErr } = await db
    .from('content_items')
    .select('id, title, status, target_duration_sec, audio_plan, chapters, created_at, updated_at')
    .eq('id', projectId)
    .single();
  if (iErr) throw new Error(iErr.message);

  const { data: clips, error: cErr } = await db
    .from('content_clips')
    .select(
      'id, scene_n, kind, status, vo_url, clip_url, vo_text, fail_reason, image_source, duration_sec',
    )
    .eq('project_id', projectId)
    .order('scene_n');
  if (cErr) throw new Error(cErr.message);

  const { data: refs, error: rErr } = await db
    .from('content_references')
    .select('id, key, status, url, higgsfield_media_id')
    .eq('project_id', projectId)
    .order('key');
  if (rErr) throw new Error(rErr.message);

  const snapshot = {
    snapshotAt: new Date().toISOString(),
    projectId,
    item,
    clips: (clips ?? []).map((c) => ({
      ...c,
      vo_text_hash: c.vo_text
        ? createHash('sha256').update(c.vo_text).digest('hex').slice(0, 12)
        : null,
      vo_text: undefined,
    })),
    refs: refs ?? [],
    summary: {
      clips_total: clips?.length ?? 0,
      clips_by_status: countBy(clips ?? [], 'status'),
      refs_total: refs?.length ?? 0,
      refs_by_status: countBy(refs ?? [], 'status'),
    },
  };

  const outDir = resolve('temp/longform');
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, `${projectId}-pre-v2-snapshot.json`);
  writeFileSync(outPath, JSON.stringify(snapshot, null, 2));

  console.log(`Snapshot written: ${outPath}`);
  console.log(`  content_items:     1 row`);
  console.log(
    `  content_clips:     ${snapshot.summary.clips_total} rows`,
    snapshot.summary.clips_by_status,
  );
  console.log(
    `  content_references:${snapshot.summary.refs_total} rows`,
    snapshot.summary.refs_by_status,
  );
}

function countBy(arr, key) {
  return arr.reduce((acc, row) => {
    acc[row[key]] = (acc[row[key]] ?? 0) + 1;
    return acc;
  }, {});
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
