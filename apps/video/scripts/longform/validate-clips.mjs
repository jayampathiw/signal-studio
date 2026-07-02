// Phase 5 — Validation pool (docs/long-form-pipeline-plan.md §5 Phase 2).
//
// Two-pass per clip (Phase 0 decision: both mechanisms from day one):
//   Pass A — Semantic-action gate (text-only, automated):
//     chatText() checks visual_prompt + vo_text against channel rules and
//     per-scene expected action. Catches wrong-sport, prohibited content, etc.
//   Pass B — Look gate (frames, interactive):
//     ffmpeg extracts 3 frames → saved to temp/longform/frames/scene_N/
//     The Claude Code session reads these with its own vision (proxy can't do
//     vision calls) via the separate look-gate-clips.mjs script.
//
// Status flow:  generated → validating (A+B pending)
//                 → failed     (semantic blocked → retry regeneration)
//                 → blocked    (hard rule violation; needs human fix)
//                 → validating (semantic passed; frames extracted for look-gate)
// look-gate-clips.mjs then moves validating → passed | failed.
//
// Usage:
//   node apps/video/scripts/longform/validate-clips.mjs --project 29 [--scene 8] [--limit 8] [--semantic-only]

import { parseArgs } from 'util';
import { getServiceClient } from '@signal-studio/database';
import { runPool } from '../../src/longform/pool.js';
import { semanticGate } from '../../src/longform/semantic-gate.js';
import { extractFrames } from '../../src/longform/frame-extractor.js';
import { mkdirSync } from 'fs';
import { join } from 'path';

const { values } = parseArgs({
  options: {
    project:        { type: 'string' },
    scene:          { type: 'string' },
    limit:          { type: 'string', default: '4' }, // lower for validation (heavier per-item)
    'max-retry':    { type: 'string', default: '2' },
    'semantic-only': { type: 'boolean', default: false },
    'frames-dir':   { type: 'string', default: 'temp/longform/frames' },
  },
  strict: false,
});

if (!values.project) { console.error('Error: --project <id> required'); process.exit(2); }
const projectId = Number(values.project);
const limit     = Number(values.limit);
const maxRetry  = Number(values['max-retry']);
const semanticOnly = values['semantic-only'];
const framesDir    = values['frames-dir'];
const db = getServiceClient();

async function main() {
  const { data: project, error: pErr } = await db
    .from('content_items').select('id, channel_key').eq('id', projectId).single();
  if (pErr || !project) throw new Error(`project ${projectId} not found: ${pErr?.message}`);

  // Load generated clips (the only ones ready for validation).
  let q = db.from('content_clips')
    .select('*').eq('project_id', projectId).eq('kind', 'clip')
    .in('status', ['generated']);
  if (values.scene) q = q.eq('scene_n', Number(values.scene));
  const { data: clips, error: cErr } = await q.order('scene_n');
  if (cErr) throw new Error(cErr.message);
  if (!clips.length) {
    console.error('No generated clips to validate (re-run after Phase 4 completes).');
    return finish();
  }

  console.error(`Validating ${clips.length} clip(s), ${limit}-wide. semantic-only=${semanticOnly}`);
  console.error(`Frames dir: ${framesDir}`);
  mkdirSync(framesDir, { recursive: true });

  await runPool(clips, async (clip) => {
    await db.from('content_clips').update({ status: 'validating' }).eq('id', clip.id);

    // ── Pass A: Semantic-action gate (text-only) ──────────────────────────────
    const semantic = await semanticGate({
      visual_prompt: clip.visual_prompt,
      vo_text:       clip.vo_text,
      channel_key:   project.channel_key,
    });

    console.error(`  scene ${clip.scene_n} semantic → ${semantic.verdict}: ${semantic.reason}`);

    if (semantic.verdict === 'blocked') {
      await db.from('content_clips').update({
        status:      'blocked',
        fail_reason: `[semantic] ${semantic.reason} | expected: ${semantic.expectedAction}`,
      }).eq('id', clip.id);
      return { scene: clip.scene_n, pass: 'A', verdict: 'blocked', reason: semantic.reason };
    }

    if (semantic.verdict === 'retry') {
      const attempt = (clip.retry_count || 0) + 1;
      const terminal = attempt > maxRetry;
      await db.from('content_clips').update({
        status:       terminal ? 'blocked' : 'failed',
        retry_count:  attempt,
        fail_reason:  `[semantic-retry] ${semantic.reason}`,
      }).eq('id', clip.id);
      return { scene: clip.scene_n, pass: 'A', verdict: terminal ? 'blocked' : 'failed', reason: semantic.reason };
    }

    // ── Pass B: Frame extraction (for look-gate) ─────────────────────────────
    if (!semanticOnly && clip.clip_url) {
      const sceneDir = join(framesDir, `scene_${String(clip.scene_n).padStart(3, '0')}`);
      try {
        const { framePaths } = await extractFrames({
          clipUrl: clip.clip_url,
          sceneN:  clip.scene_n,
          frameCount: 3,
          outDir: sceneDir,
        });
        console.error(`    frames: ${framePaths.join(', ')}`);
        // Status stays 'validating' — look-gate-clips.mjs will move it to passed/failed.
        await db.from('content_clips').update({
          status:      'validating',
          fail_reason: `[look-gate-pending] frames at ${sceneDir}`,
        }).eq('id', clip.id);
        return { scene: clip.scene_n, pass: 'B', verdict: 'look-gate-pending', frames: framePaths };
      } catch (err) {
        // Frame extraction failure is non-blocking — mark validating, note the error.
        console.error(`    frame extraction failed: ${err.message}`);
        await db.from('content_clips').update({
          status:      'validating',
          fail_reason: `[frame-extract-error] ${err.message}`,
        }).eq('id', clip.id);
        return { scene: clip.scene_n, pass: 'B', verdict: 'look-gate-pending-no-frames' };
      }
    }

    // semantic-only mode or no clip URL: mark passed (no look-gate).
    await db.from('content_clips').update({ status: 'passed', fail_reason: null }).eq('id', clip.id);
    return { scene: clip.scene_n, pass: 'A', verdict: 'passed' };
  }, {
    limit,
    onSettle: (r) => {
      if (r.ok) {
        const v = r.value?.verdict;
        const icon = v === 'passed' ? '✅' : v === 'blocked' ? '🚫' : v?.startsWith('look-gate') ? '🔍' : '⚠️';
        console.error(`  ${icon} scene ${r.value?.scene}: ${v}`);
      } else {
        console.error(`  ✗ scene ${r.item?.scene_n}: ${r.error?.message}`);
      }
    },
  });

  await finish();
}

async function finish() {
  const { data: all } = await db.from('content_clips').select('status').eq('project_id', projectId).eq('kind', 'clip');
  const byStatus = all.reduce((m, r) => ((m[r.status] = (m[r.status] || 0) + 1), m), {});
  console.error(`\nClips: ${JSON.stringify(byStatus)}`);
  const validating = (byStatus.validating || 0);
  if (validating > 0) {
    console.error(`🔍 ${validating} clip(s) need look-gate — run look-gate-clips.mjs next.`);
  }
  const allDone = ['passed', 'blocked'].every(() => true) &&
    !byStatus.generated && !byStatus.validating && !byStatus.pending && !byStatus.generating && !byStatus.failed;
  if (allDone) {
    console.error('✅ Validation complete — Phase 6 (assembly) may proceed.');
  }
  console.log(JSON.stringify({ projectId, byStatus }));
}

main().catch((e) => { console.error(e.message); process.exit(1); });
