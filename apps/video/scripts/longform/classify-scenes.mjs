import { readFileSync } from 'fs';
import { parseArgs } from 'util';

import { getServiceClient } from '@signal-studio/database';

const { values } = parseArgs({
  options: {
    project: { type: 'string' },
    file: { type: 'string' },
    dry: { type: 'boolean', default: false },
  },
  strict: false,
});

if (!values.project) {
  console.error('Error: --project <id> required');
  process.exit(2);
}
if (!values.file) {
  console.error('Error: --file <path> required');
  process.exit(2);
}

const projectId = Number(values.project);

function dbKind(entry) {
  return entry.kind === 'motion' ? 'clip' : entry.kind;
}

function dbImageSource(entry) {
  if (entry.kind === 'text_card' || entry.kind === 'motion') return null;
  return entry.image_source ?? null;
}

async function main() {
  const entries = JSON.parse(readFileSync(values.file, 'utf8'));

  if (values.dry) {
    let still = 0,
      clip = 0,
      text_card = 0;
    for (const e of entries) {
      const kind = dbKind(e);
      const src = dbImageSource(e);
      console.log(
        `S${String(e.scene_n).padStart(2, '0')}  kind=${kind}${src ? `  image_source=${src}` : ''}`,
      );
      if (kind === 'still') still++;
      else if (kind === 'clip') clip++;
      else text_card++;
    }
    console.log(`\n--dry: ${still} still, ${clip} clip, ${text_card} text_card — nothing written.`);
    return;
  }

  const db = getServiceClient();

  const { data: existing, error: fetchErr } = await db
    .from('content_clips')
    .select('scene_n, kind, image_source')
    .eq('project_id', projectId);
  if (fetchErr) throw new Error(`Fetch failed: ${fetchErr.message}`);

  const current = new Map(existing.map((r) => [r.scene_n, r]));

  let updated = 0,
    skipped = 0,
    errored = 0;
  const totals = { still: 0, clip: 0, text_card: 0 };

  for (const e of entries) {
    const kind = dbKind(e);
    const image_source = dbImageSource(e);
    totals[kind] = (totals[kind] ?? 0) + 1;

    const row = current.get(e.scene_n);
    if (row && row.kind === kind && row.image_source === image_source) {
      skipped++;
      continue;
    }

    const { error } = await db
      .from('content_clips')
      .update({ kind, image_source })
      .eq('project_id', projectId)
      .eq('scene_n', e.scene_n);

    if (error) {
      console.error(`  ✗ S${e.scene_n}: ${error.message}`);
      errored++;
    } else {
      console.log(
        `  ✓ S${e.scene_n}: kind=${kind}${image_source ? ` image_source=${image_source}` : ''}`,
      );
      updated++;
    }
  }

  console.log(
    `\n${totals.still ?? 0} still, ${totals.clip ?? 0} clip, ${totals.text_card ?? 0} text_card in file.`,
  );
  console.log(`Updated ${updated}, skipped ${skipped} (already match), errored ${errored}.`);
  if (errored > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
