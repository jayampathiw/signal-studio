// DEPRECATED — Higgsfield video generation is not used in the stills-only pipeline (see docs/longform-final-plan.md).
console.error(
  'DEPRECATED: generate-clips.mjs is not used in the current pipeline.\nThe longform pipeline is stills-only; all visuals come from manually generated stills. See docs/longform-final-plan.md.',
);
process.exit(1);

// Phase 4 — Generation pool (docs/long-form-pipeline-plan.md §4 Phase 2).
// Generates every clip in the 8-wide rolling pool, each conditioned on its
// reference image(s) for cross-scene consistency. Resumable: reprocesses only
// non-terminal clips, and re-polls in-flight jobs before submitting new ones
// (no duplicate Higgsfield jobs). Overflow past 8 is handled as back-off, not
// failure (higgsfield.js).
//
// Barrier: refuses to run until every content_reference is 'passed'.
//
// Usage:
//   node apps/video/scripts/longform/generate-clips.mjs --project 29 [--limit 8] [--max-retry 2] [--scene 8]

import { parseArgs } from 'util';

import { getServiceClient } from '@signal-studio/database';

import { getChannel } from '../../src/config/channels.js';
import { submit, poll } from '../../src/longform/higgsfield.js';
import { runPool } from '../../src/longform/pool.js';

const { values } = parseArgs({
  options: {
    project: { type: 'string' },
    limit: { type: 'string', default: '8' },
    'max-retry': { type: 'string', default: '2' },
    scene: { type: 'string' }, // optional: generate a single scene (smoke test)
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

const clampDuration = (sec) => Math.max(3, Math.min(15, Math.round(Number(sec) || 5)));

async function main() {
  const { data: project, error: pErr } = await db
    .from('content_items')
    .select('id, channel_key')
    .eq('id', projectId)
    .single();
  if (pErr || !project) throw new Error(`project ${projectId} not found: ${pErr?.message}`);
  const channel = getChannel(project.channel_key);

  // Barrier: all references must be passed.
  const { data: refs } = await db
    .from('content_references')
    .select('key, higgsfield_media_id, status')
    .eq('project_id', projectId);
  const notReady = refs.filter((r) => r.status !== 'passed' || !r.higgsfield_media_id);
  if (notReady.length) {
    throw new Error(
      `⛔ Reference barrier CLOSED: ${notReady.length} reference(s) not passed — run Phase 3 first.`,
    );
  }
  const refMedia = Object.fromEntries(refs.map((r) => [r.key, r.higgsfield_media_id]));

  // Load non-terminal clip rows (resumable). Text cards are already 'passed'.
  let q = db
    .from('content_clips')
    .select('*')
    .eq('project_id', projectId)
    .eq('kind', 'clip')
    .in('status', ['pending', 'generating', 'failed']);
  if (values.scene) q = q.eq('scene_n', Number(values.scene));
  const { data: clips, error: cErr } = await q.order('scene_n');
  if (cErr) throw new Error(cErr.message);
  if (!clips.length) {
    console.error('No clips to generate (all done or none match).');
    return finish();
  }

  console.error(`Generating ${clips.length} clip(s), ${limit}-wide, model=${channel.videoModel}…`);

  await runPool(
    clips,
    async (clip) => {
      const primaryKey = (clip.reference_keys || [])[0];
      const imageRef = primaryKey ? refMedia[primaryKey] : undefined;
      const params = {
        prompt: clip.visual_prompt,
        aspect_ratio: channel.aspectRatio,
        duration: clampDuration(clip.duration_sec),
        generate_audio: false,
        ...(imageRef ? { image: imageRef } : {}),
      };

      for (let attempt = clip.retry_count + 1; attempt <= maxRetry + 1; attempt++) {
        let jobId = clip.higgsfield_job_id;
        try {
          // Resume-safe: re-poll an existing in-flight job before submitting anew.
          if (!(clip.status === 'generating' && jobId)) {
            jobId = await submit(channel.videoModel, params);
            await db
              .from('content_clips')
              .update({ status: 'generating', higgsfield_job_id: jobId })
              .eq('id', clip.id);
            clip.status = 'generating';
          }
          const { url } = await poll(jobId);
          await db
            .from('content_clips')
            .update({ status: 'generated', clip_url: url, fail_reason: null })
            .eq('id', clip.id);
          return { scene: clip.scene_n, ok: true };
        } catch (err) {
          clip.higgsfield_job_id = null;
          clip.status = 'failed'; // force resubmit next attempt
          const terminal = attempt > maxRetry;
          await db
            .from('content_clips')
            .update({
              status: terminal ? 'blocked' : 'failed',
              higgsfield_job_id: null,
              retry_count: attempt,
              fail_reason: err.message.slice(0, 400),
            })
            .eq('id', clip.id);
          if (terminal) return { scene: clip.scene_n, ok: false, reason: err.message };
        }
      }
      return { scene: clip.scene_n, ok: false, reason: 'retry-exhausted' };
    },
    {
      limit,
      onSettle: (r) => {
        if (r.ok && r.value.ok) console.error(`  ✓ scene ${r.value.scene} generated`);
        else
          console.error(
            `  ✗ scene ${r.value?.scene ?? '?'}: ${r.value?.reason ?? r.error?.message}`,
          );
      },
    },
  );

  await finish();
}

async function finish() {
  const { data: all } = await db
    .from('content_clips')
    .select('status')
    .eq('project_id', projectId)
    .eq('kind', 'clip');
  const byStatus = all.reduce((m, r) => ((m[r.status] = (m[r.status] || 0) + 1), m), {});
  const done = all.every((r) => ['generated', 'validating', 'passed'].includes(r.status));
  console.error(`\nClips: ${JSON.stringify(byStatus)}`);
  console.error(
    done
      ? '✅ All clips generated — Phase 5 (validation) may proceed.'
      : '⛔ Some clips not generated — re-run to retry failed/pending.',
  );
  console.log(JSON.stringify({ projectId, byStatus, done }));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
