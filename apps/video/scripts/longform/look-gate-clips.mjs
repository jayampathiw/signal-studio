// DEPRECATED — the video-clip validation pool is not used in the stills-only pipeline (see docs/longform-final-plan.md).
console.error('DEPRECATED: look-gate-clips.mjs is not used in the current pipeline.\nThe longform pipeline is stills-only with manual image approval gates. See docs/longform-final-plan.md.');
process.exit(1);

// Phase 5B — Interactive look-gate (docs/long-form-pipeline-plan.md §5).
//
// Processes all 'validating' clips in project. For each clip:
//   1. Reads the extracted frame paths from fail_reason (set by validate-clips.mjs)
//   2. Prints them for the Claude Code session to review via the Read (image) tool
//   3. After review: updates status to 'passed' or 'failed' + reason
//
// This script is NOT run autonomously — it is the driver for an INTERACTIVE session
// where the Claude Code agent uses its own vision to evaluate frames against the
// clip's visual_prompt + reference_keys.
//
// Usage:
//   node apps/video/scripts/longform/look-gate-clips.mjs --project 29 [--scene 8] [--status passed|failed] [--reason "..."]
//
// Two modes:
//   (a) --list   → prints all validating clips with their frame paths (for Claude to review)
//   (b) --scene N --status passed|failed [--reason "..."] → updates one clip after review

import { parseArgs } from 'util';
import { getServiceClient } from '@signal-studio/database';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';

const { values } = parseArgs({
  options: {
    project:       { type: 'string' },
    scene:         { type: 'string' },
    status:        { type: 'string' },  // 'passed' or 'failed'
    reason:        { type: 'string', default: '' },
    list:          { type: 'boolean', default: false },
    'frames-dir':  { type: 'string', default: 'temp/longform/frames' },
  },
  strict: false,
});

if (!values.project) { console.error('Error: --project <id> required'); process.exit(2); }
const projectId  = Number(values.project);
const framesDir  = values['frames-dir'];
const db = getServiceClient();

async function main() {
  if (values.scene && values.status) {
    // Update mode: set outcome for one clip after visual review.
    const sceneN  = Number(values.scene);
    const newStatus = values.status === 'passed' ? 'passed' : 'failed';
    const retryCount = newStatus === 'failed' ? undefined : null;

    const { data: clip } = await db.from('content_clips')
      .select('id, retry_count').eq('project_id', projectId).eq('scene_n', sceneN).single();
    if (!clip) { console.error(`scene ${sceneN} not found`); process.exit(1); }

    const update = {
      status:      newStatus,
      fail_reason: newStatus === 'failed'
        ? `[look-gate] ${values.reason || 'failed look-gate review'}`
        : null,
    };
    if (newStatus === 'failed') update.retry_count = (clip.retry_count || 0) + 1;
    await db.from('content_clips').update(update).eq('id', clip.id);
    console.log(`scene ${sceneN} → ${newStatus}${values.reason ? ': ' + values.reason : ''}`);
    return;
  }

  // List mode: show validating clips + frame paths.
  const { data: clips, error } = await db.from('content_clips')
    .select('scene_n, visual_prompt, vo_text, reference_keys, fail_reason, clip_url')
    .eq('project_id', projectId).eq('kind', 'clip').eq('status', 'validating')
    .order('scene_n');
  if (error) throw new Error(error.message);

  if (!clips.length) {
    console.log('No validating clips. Run validate-clips.mjs first.');
    return;
  }

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`LOOK-GATE QUEUE — project ${projectId} — ${clips.length} clip(s) to review`);
  console.log(`${'═'.repeat(70)}\n`);

  for (const clip of clips) {
    const sceneDir = join(framesDir, `scene_${String(clip.scene_n).padStart(3, '0')}`);
    let framePaths = [];
    if (existsSync(sceneDir)) {
      framePaths = readdirSync(sceneDir)
        .filter(f => f.endsWith('.jpg'))
        .sort()
        .map(f => join(sceneDir, f));
    }

    console.log(`── SCENE ${clip.scene_n} ──────────────────────────────────────────────`);
    console.log(`PROMPT:  ${clip.visual_prompt}`);
    console.log(`VO:      ${clip.vo_text ?? '(none)'}`);
    console.log(`REFS:    ${(clip.reference_keys || []).join(', ') || '(none)'}`);
    console.log(`URL:     ${clip.clip_url ?? '(no url)'}`);
    if (framePaths.length) {
      console.log(`FRAMES:`);
      for (const f of framePaths) console.log(`  ${f}`);
    } else {
      console.log(`FRAMES:  (none — extract manually or re-run validate-clips.mjs)`);
    }
    console.log(`NOTE:    ${clip.fail_reason ?? '(none)'}`);
    console.log();
  }

  console.log('To update a clip after review:');
  console.log(`  node apps/video/scripts/longform/look-gate-clips.mjs --project ${projectId} --scene N --status passed`);
  console.log(`  node apps/video/scripts/longform/look-gate-clips.mjs --project ${projectId} --scene N --status failed --reason "wrong sport"`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
