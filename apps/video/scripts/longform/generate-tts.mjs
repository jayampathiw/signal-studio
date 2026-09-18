import { execSync } from 'child_process';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { parseArgs } from 'util';

import { getServiceClient } from '@signal-studio/database';
import { uploadToR2 } from '@signal-studio/media/storage';
import { synthesise } from '@signal-studio/media/tts';

const { values } = parseArgs({
  options: {
    project: { type: 'string' },
    dry: { type: 'boolean', default: false },
    limit: { type: 'string' },
    report: { type: 'boolean', default: false },
  },
  strict: false,
});

if (!values.project) {
  console.error('Error: --project <id> required');
  process.exit(2);
}

const projectId = Number(values.project);
const dry = values.dry;
const limit = values.limit ? Number(values.limit) : undefined;
const report = values.report;
const db = getServiceClient();

// R2 public host prefix used to detect already-uploaded rows
const R2_HOST = process.env.R2_PUBLIC_BASE_URL ?? '';

function probeDuration(filePath) {
  try {
    const out = execSync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${filePath}"`,
      { encoding: 'utf-8' },
    );
    return Number(out.trim());
  } catch {
    return 0;
  }
}

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
  if (!rows.length) {
    console.error('No rows with vo_text found for project', projectId);
    return;
  }

  let done = 0,
    skipped = 0,
    errors = 0;
  const reportData = [];

  for (const row of rows) {
    const label = `S${row.scene_n}`;

    if (row.vo_url && R2_HOST && row.vo_url.startsWith(R2_HOST)) {
      console.log(`[skip] ${label} already has VO`);
      skipped++;
      if (report) reportData.push({ scene_n: row.scene_n, status: 'skip', vo_url: row.vo_url });
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

      if (report) {
        const wordCount = row.vo_text.trim().split(/\s+/).length;
        const durationSec = probeDuration(tmpFile);
        const wpm = durationSec > 0 ? Math.round((wordCount / durationSec) * 60) : 0;
        const sceneDuration = row.duration_sec ?? null;
        reportData.push({
          scene_n: row.scene_n,
          status: 'generated',
          duration_sec: durationSec,
          word_count: wordCount,
          wpm,
          scene_window_sec: sceneDuration,
          over_budget: sceneDuration && durationSec > sceneDuration + 1.5,
          vo_url: url,
        });
      }

      console.log(`[done] ${label} → ${url}`);
      done++;
    } catch (err) {
      console.error(`[error] ${label}: ${err.message}`);
      await db
        .from('content_clips')
        .update({ fail_reason: `tts error: ${err.message.slice(0, 200)}` })
        .eq('id', row.id);
      if (report) reportData.push({ scene_n: row.scene_n, status: 'error', error: err.message });
      errors++;
    } finally {
      await rm(tmpFile, { force: true });
    }
  }

  console.log(`\nGenerated ${done} VO segments, ${skipped} skipped, ${errors} errors`);

  if (report && reportData.length) {
    const outDir = resolve('temp/longform');
    mkdirSync(outDir, { recursive: true });
    const outPath = resolve(outDir, `${projectId}-vo-report.json`);
    writeFileSync(outPath, JSON.stringify(reportData, null, 2));
    console.log(`\nVO report: ${outPath}`);
    const overBudget = reportData.filter((r) => r.over_budget);
    if (overBudget.length) {
      console.warn(
        `  ⚠ Over-budget scenes (VO > window+1.5s): ${overBudget.map((r) => `S${r.scene_n} (${r.duration_sec}s vs ${r.scene_window_sec}s window)`).join(', ')}`,
      );
    }
    const totalVo = reportData.reduce((s, r) => s + (r.duration_sec ?? 0), 0);
    console.log(`  Total VO duration: ${totalVo.toFixed(1)}s`);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
