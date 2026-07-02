import { parseArgs } from 'util';
import { tmpdir } from 'os';
import { join } from 'path';
import { rm } from 'fs/promises';
import { getServiceClient } from '@signal-studio/database';
import { synthesise } from '@signal-studio/media/tts';
import { uploadToR2 } from '@signal-studio/media/storage';

const { values } = parseArgs({
  options: {
    project: { type: 'string' },
    dry: { type: 'boolean', default: false },
    limit: { type: 'string' },
  },
  strict: false,
});

if (!values.project) { console.error('Error: --project <id> required'); process.exit(2); }

const projectId = Number(values.project);
const dry = values.dry;
const limit = values.limit ? Number(values.limit) : undefined;
const db = getServiceClient();

// R2 public host prefix used to detect already-uploaded rows
const R2_HOST = process.env.R2_PUBLIC_BASE_URL ?? '';

async function main() {
  let query = db
    .from('content_clips')
    .select('id, scene_n, vo_text, vo_url')
    .eq('project_id', projectId)
    .not('vo_text', 'is', null)
    .order('scene_n');

  if (limit) query = query.limit(limit);

  const { data: rows, error } = await query;
  if (error) throw new Error(error.message);
  if (!rows.length) { console.error('No rows with vo_text found for project', projectId); return; }

  let done = 0, skipped = 0, errors = 0;

  for (const row of rows) {
    const label = `S${row.scene_n}`;

    if (row.vo_url && R2_HOST && row.vo_url.startsWith(R2_HOST)) {
      console.log(`[skip] ${label} already has VO`);
      skipped++;
      continue;
    }

    if (dry) {
      console.log(`[dry]  ${label}: would synthesise "${row.vo_text.slice(0, 60)}…"`);
      done++;
      continue;
    }

    const tmpFile = join(tmpdir(), `longform-${projectId}-S${row.scene_n}.wav`);
    try {
      await synthesise(row.vo_text, tmpFile, { country: 'EN' });

      const key = `longform/${projectId}/tts/S${row.scene_n}.wav`;
      const url = await uploadToR2(tmpFile, { key });

      const { error: updateErr } = await db
        .from('content_clips')
        .update({ vo_url: url })
        .eq('id', row.id);
      if (updateErr) throw new Error(updateErr.message);

      console.log(`[done] ${label} → ${url}`);
      done++;
    } catch (err) {
      console.error(`[error] ${label}: ${err.message}`);
      await db.from('content_clips').update({ status_note: `tts error: ${err.message.slice(0, 200)}` }).eq('id', row.id);
      errors++;
    } finally {
      await rm(tmpFile, { force: true });
    }
  }

  console.log(`\nGenerated ${done} VO segments, ${skipped} skipped, ${errors} errors`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
