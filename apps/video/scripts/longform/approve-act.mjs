#!/usr/bin/env node
/**
 * approve-act.mjs — F4-4
 * Gate: verify all stills + refs for a project are passed, then advance project status.
 *
 * Usage:
 *   node approve-act.mjs --project 29 --act 1       # gate-check act 1 (refs separately)
 *   node approve-act.mjs --project 29 --final       # all acts + refs → status awaiting_stills
 *   node approve-act.mjs --project 29 --status      # show per-act summary only
 */

import { parseArgs } from 'util';
import { getServiceClient } from '@signal-studio/database';

const { values } = parseArgs({
  options: {
    project: { type: 'string' },
    act:     { type: 'string' },
    final:   { type: 'boolean', default: false },
    status:  { type: 'boolean', default: false },
  },
  strict: false,
});

if (!values.project) { console.error('Error: --project <id> required'); process.exit(2); }

const projectId = Number(values.project);
const db = getServiceClient();

const ACT_LABELS = { '0': 'Cold Open', '6': 'Outro' };
function actLabel(a) { return ACT_LABELS[String(a)] ?? `Act ${a}`; }

async function getStillSummary() {
  const { data, error } = await db.from('content_stills')
    .select('scene_n, cut, act, status')
    .eq('project_id', projectId)
    .order('act').order('scene_n');
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function getRefSummary() {
  const { data, error } = await db.from('content_references')
    .select('key, status')
    .eq('project_id', projectId);
  if (error) throw new Error(error.message);
  return data ?? [];
}

function groupByAct(rows) {
  const acts = {};
  for (const r of rows) {
    const a = String(r.act ?? '?');
    if (!acts[a]) acts[a] = { pending: [], generated: [], passed: [] };
    const bucket = acts[a][r.status] ?? (acts[a].other = acts[a].other ?? []);
    bucket.push(r);
  }
  return acts;
}

// ── status summary ───────────────────────────────────────────────────────────

async function showStatus() {
  const [stills, refs] = await Promise.all([getStillSummary(), getRefSummary()]);
  const acts = groupByAct(stills);

  console.log('\n── Still status by act ──────────────────────────────');
  for (const [act, buckets] of Object.entries(acts).sort()) {
    const total = (buckets.pending?.length ?? 0) + (buckets.generated?.length ?? 0) + (buckets.passed?.length ?? 0);
    const ready = buckets.passed?.length ?? 0;
    const icon = ready === total ? '✅' : (buckets.pending?.length ? '⬜' : '🟡');
    console.log(`  ${icon} ${actLabel(act)}: ${ready}/${total} passed`);
    if (buckets.pending?.length) console.log(`     ⬜ pending: ${buckets.pending.map((r) => `S${r.scene_n}-${r.cut}`).join(', ')}`);
    if (buckets.generated?.length) console.log(`     🟡 generated (needs approve): ${buckets.generated.map((r) => `S${r.scene_n}-${r.cut}`).join(', ')}`);
  }

  console.log('\n── Reference status ─────────────────────────────────');
  refs.forEach((r) => console.log(`  ${r.status === 'passed' ? '✅' : '⬜'} ${r.key}`));

  const allStillsPassed = stills.every((r) => r.status === 'passed');
  const allRefsPassed   = refs.every((r) => r.status === 'passed');
  console.log(`\nAll stills passed: ${allStillsPassed ? 'YES ✅' : 'NO ❌'}`);
  console.log(`All refs passed:   ${allRefsPassed   ? 'YES ✅' : 'NO ❌'}`);

  if (allStillsPassed && allRefsPassed) {
    console.log('\n✅ Ready for assembly. Run:\n  node approve-act.mjs --project ' + projectId + ' --final');
  }
}

// ── single act gate-check ────────────────────────────────────────────────────

async function checkAct(actNum) {
  const stills = await getStillSummary();
  const actRows = stills.filter((r) => String(r.act) === String(actNum));

  if (!actRows.length) {
    console.error(`No stills found for ${actLabel(actNum)} in project ${projectId}`);
    process.exit(1);
  }

  const pending   = actRows.filter((r) => r.status === 'pending');
  const generated = actRows.filter((r) => r.status === 'generated');
  const passed    = actRows.filter((r) => r.status === 'passed');

  console.log(`\n── ${actLabel(actNum)}: ${passed.length}/${actRows.length} passed ──`);
  if (pending.length)   console.log(`  ⬜ pending:   ${pending.map((r) => `S${r.scene_n}-${r.cut}`).join(', ')}`);
  if (generated.length) console.log(`  🟡 generated: ${generated.map((r) => `S${r.scene_n}-${r.cut}`).join(', ')}  ← run --approve-all with review-stills.mjs`);
  if (passed.length)    console.log(`  ✅ passed:    ${passed.map((r) => `S${r.scene_n}-${r.cut}`).join(', ')}`);

  if (pending.length || generated.length) {
    console.log(`\n❌ ${actLabel(actNum)} is not complete. Resolve the above before advancing.`);
    process.exit(1);
  }

  console.log(`\n✅ ${actLabel(actNum)} complete.`);
}

// ── final gate: all acts + refs → advance project status ────────────────────

async function finalGate() {
  const [stills, refs] = await Promise.all([getStillSummary(), getRefSummary()]);

  const blockedStills = stills.filter((r) => r.status !== 'passed');
  const blockedRefs   = refs.filter((r) => r.status !== 'passed');

  if (blockedStills.length || blockedRefs.length) {
    if (blockedStills.length) {
      console.error(`\n❌ ${blockedStills.length} still(s) not passed:`);
      blockedStills.forEach((r) => console.error(`  S${r.scene_n}-${r.cut}: ${r.status}`));
    }
    if (blockedRefs.length) {
      console.error(`\n❌ ${blockedRefs.length} ref(s) not passed:`);
      blockedRefs.forEach((r) => console.error(`  ${r.key}: ${r.status}`));
    }
    process.exit(1);
  }

  // All clear — advance project status
  const { data: item, error: fetchErr } = await db.from('content_items')
    .select('id, status').eq('id', projectId).single();
  if (fetchErr) throw new Error(fetchErr.message);

  const ADVANCEABLE = ['awaiting_refs', 'awaiting_stills', 'seeding'];
  if (!ADVANCEABLE.includes(item.status)) {
    console.log(`[skip] Project status is "${item.status}" — not advancing (already past awaiting_stills or in a running state).`);
    console.log('\nAll stills and refs are passed. To trigger assembly:\n  curl the trigger-longform edge fn with stage=assemble');
    return;
  }

  const { error: updErr } = await db.from('content_items')
    .update({ status: 'awaiting_stills', status_note: 'all stills and refs passed — ready for assembly' })
    .eq('id', projectId);
  if (updErr) throw new Error(updErr.message);

  console.log(`\n✅ All ${stills.length} stills + ${refs.length} refs passed.`);
  console.log(`Project ${projectId}: status → awaiting_stills`);
  console.log('\nNext step — dispatch assembly:\n  node scripts/set-status.mjs --project ' + projectId + ' --status awaiting_stills');
  console.log('  # then trigger via edge fn or dispatch longform.yml stage=assemble');
}

// ── main ─────────────────────────────────────────────────────────────────────

try {
  if (values.status) {
    await showStatus();
  } else if (values.final) {
    await finalGate();
  } else if (values.act != null) {
    await checkAct(values.act);
  } else {
    console.error('Usage:');
    console.error('  --status           show per-act summary');
    console.error('  --act <n>          gate-check a single act');
    console.error('  --final            all acts + refs → advance to awaiting_stills');
    process.exit(2);
  }
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
}
