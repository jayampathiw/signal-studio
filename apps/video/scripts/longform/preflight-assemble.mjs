#!/usr/bin/env node
// F6-2: Pre-flight guard for the assemble stage.
// Exits 0 (OK) or 1 (blocked) and prints a clear report.
// Called by longform.yml before running assemble-longform.mjs.

import { parseArgs } from 'util';
import { getServiceClient } from '@signal-studio/database';

const { values } = parseArgs({
  options: { project: { type: 'string' } },
  strict: false,
});

if (!values.project) { console.error('--project <id> required'); process.exit(2); }

const projectId = Number(values.project);
const db = getServiceClient();

const [stilsRes, refsRes, manifestRes] = await Promise.all([
  db.from('content_stills')
    .select('scene_n, cut, status')
    .eq('project_id', projectId)
    .neq('status', 'passed'),
  db.from('content_references')
    .select('key, status')
    .eq('project_id', projectId)
    .neq('status', 'passed'),
  db.from('content_items')
    .select('audio_plan')
    .eq('id', projectId)
    .single(),
]);

const blockedStills = stilsRes.data ?? [];
const blockedRefs   = refsRes.data ?? [];
const audioPlan     = manifestRes.data?.audio_plan ?? null;

let ok = true;

if (blockedStills.length) {
  console.error(`❌ ${blockedStills.length} still(s) not passed:`);
  blockedStills.forEach((r) => console.error(`   S${r.scene_n}-${r.cut}: ${r.status}`));
  ok = false;
}

if (blockedRefs.length) {
  console.error(`❌ ${blockedRefs.length} ref(s) not passed:`);
  blockedRefs.forEach((r) => console.error(`   ${r.key}: ${r.status}`));
  ok = false;
}

const audioPlanEmpty = !audioPlan ||
  (Array.isArray(audioPlan) ? audioPlan.length === 0 : Object.keys(audioPlan).length === 0);
if (audioPlanEmpty) {
  console.error('❌ No audio_plan on project row — run seed stage first');
  ok = false;
}

if (!ok) {
  // Revert status so it's visible in the dashboard
  await db.from('content_items')
    .update({ status: 'awaiting_stills', status_note: 'assemble blocked — preflight failed (see run log)' })
    .eq('id', projectId);
  process.exit(1);
}

console.log('✅ Preflight passed — all stills, refs, and audio_plan present');
