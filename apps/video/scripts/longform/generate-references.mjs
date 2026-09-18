// DEPRECATED — longform stills are generated manually via Google Flow (see docs/longform-final-plan.md).
// This script submits Higgsfield jobs which are no longer used in the longform pipeline.
console.error(
  'DEPRECATED: generate-references.mjs is not used in the current pipeline.\nStills and refs are generated manually via Google Flow. See docs/longform-final-plan.md.',
);
process.exit(1);

// Phase 3 — Reference images + gate (docs/long-form-pipeline-plan.md §4 Phase 3).
// Generates the character/motif reference images in the 8-wide image pool, gates
// each with the vision quality gate, and stores the reusable higgsfield_media_id.
// A hard barrier (checked here and by Phase 4) blocks video generation until every
// reference is 'passed' — a bad reference poisons every clip that cites it.
//
// Resumable: only non-passed references are (re)processed on each run.
//
// Usage: node apps/video/scripts/longform/generate-references.mjs --project 29 [--limit 8] [--max-retry 2]

import { parseArgs } from 'util';

import { getServiceClient } from '@signal-studio/database';

import { getChannel } from '../../src/config/channels.js';
import { generate } from '../../src/longform/higgsfield.js';
import { runPool } from '../../src/longform/pool.js';
import { gateImage } from '../../src/longform/vision-gate.js';

const { values } = parseArgs({
  options: {
    project: { type: 'string' },
    limit: { type: 'string', default: '8' },
    'max-retry': { type: 'string', default: '2' },
  },
  strict: false,
});

if (!values.project) {
  console.error('Error: --project <id> required');
  process.exit(2);
}
const projectId = Number(values.project);
const limit = Number(values.limit);
const maxRetry = Number(values['max-retry']);
const db = getServiceClient();

async function main() {
  const { data: project, error: pErr } = await db
    .from('content_items')
    .select('id, channel_key')
    .eq('id', projectId)
    .single();
  if (pErr || !project) throw new Error(`project ${projectId} not found: ${pErr?.message}`);
  const channel = getChannel(project.channel_key);
  const imgParams = { aspect_ratio: channel.aspectRatio, resolution: channel.imageRes };

  const { data: refs, error: rErr } = await db
    .from('content_references')
    .select('*')
    .eq('project_id', projectId)
    .neq('status', 'passed');
  if (rErr) throw new Error(rErr.message);
  if (refs.length === 0) {
    console.error('All references already passed. Barrier OPEN.');
    return finish();
  }

  console.error(
    `Generating ${refs.length} reference image(s), ${limit}-wide, model=${channel.imageModel}…`,
  );

  await runPool(
    refs,
    async (ref) => {
      await db.from('content_references').update({ status: 'generating' }).eq('id', ref.id);

      for (let attempt = 1; attempt <= maxRetry + 1; attempt++) {
        const { jobId, url } = await generate(channel.imageModel, {
          prompt: ref.prompt,
          ...imgParams,
        });
        const gate = await gateImage({ imageUrl: url, prompt: ref.prompt });

        if (gate.verdict === 'pass' || gate.verdict === 'error') {
          // 'error' = gate transport failed (flaky proxy) → keep the image, flag for human review, don't block.
          await db
            .from('content_references')
            .update({
              status: gate.verdict === 'pass' ? 'passed' : 'generated',
              higgsfield_media_id: jobId,
              url,
              fail_reason: gate.verdict === 'error' ? `gate unavailable: ${gate.reason}` : null,
            })
            .eq('id', ref.id);
          return { key: ref.key, verdict: gate.verdict };
        }
        if (gate.verdict === 'blocked') {
          await db
            .from('content_references')
            .update({
              status: 'blocked',
              higgsfield_media_id: jobId,
              url,
              fail_reason: gate.reason,
            })
            .eq('id', ref.id);
          return { key: ref.key, verdict: 'blocked' };
        }
        // retry: regenerate unless we're out of attempts
        await db
          .from('content_references')
          .update({
            status: 'failed',
            higgsfield_media_id: jobId,
            url,
            retry_count: attempt,
            fail_reason: gate.reason,
          })
          .eq('id', ref.id);
      }
      return { key: ref.key, verdict: 'retry-exhausted' };
    },
    {
      limit,
      onSettle: (r) => {
        if (r.ok) console.error(`  ✓ ${r.value.key}: ${r.value.verdict}`);
        else console.error(`  ✗ ${r.item.key}: ${r.error.message}`);
      },
    },
  );

  await finish();
}

async function finish() {
  const { data: all } = await db
    .from('content_references')
    .select('key,status')
    .eq('project_id', projectId);
  const passed = all.filter((r) => r.status === 'passed').length;
  const byStatus = all.reduce((m, r) => ((m[r.status] = (m[r.status] || 0) + 1), m), {});
  const barrierOpen = all.every((r) => r.status === 'passed');
  console.error(`\nReferences: ${JSON.stringify(byStatus)}`);
  console.error(
    barrierOpen
      ? '✅ BARRIER OPEN — all references passed; Phase 4 may proceed.'
      : `⛔ BARRIER CLOSED — ${passed}/${all.length} passed. Re-run to retry non-passed, or review blocked/generated.`,
  );
  console.log(JSON.stringify({ projectId, barrierOpen, byStatus }));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
