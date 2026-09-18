#!/usr/bin/env node
/**
 * review-stills.mjs — F4-3
 * List, approve, and reject generated stills per act for a long-form project.
 *
 * Usage:
 *   node review-stills.mjs --project 29 --act 1               # list stills for act 1
 *   node review-stills.mjs --project 29 --act 1 --all         # list all acts
 *   node review-stills.mjs --project 29 --reject S07-B "bad framing"
 *   node review-stills.mjs --project 29 --approve-all --act 1
 */

import { parseArgs } from 'util';

import { getServiceClient } from '@signal-studio/database';

const { values, positionals } = parseArgs({
  options: {
    project: { type: 'string' },
    act: { type: 'string' },
    all: { type: 'boolean', default: false },
    reject: { type: 'string' }, // S07-B
    'approve-all': { type: 'boolean', default: false },
  },
  allowPositionals: true,
  strict: false,
});

if (!values.project) {
  console.error('Error: --project <id> required');
  process.exit(2);
}

const projectId = Number(values.project);
const db = getServiceClient();

const ACT_LABELS = { 0: 'Cold Open', 6: 'Outro' };
function actLabel(a) {
  return ACT_LABELS[String(a)] ?? `Act ${a}`;
}

// ── reject a single still ────────────────────────────────────────────────────

async function rejectStill(id, reason) {
  // id is e.g. "S07-B"
  const match = id.match(/^S(\d+)-([A-D]|CARD)$/i);
  if (!match) {
    console.error(`Invalid still id "${id}" — expected e.g. S07-B`);
    process.exit(2);
  }
  const scene_n = Number(match[1]);
  const cut = match[2].toUpperCase();

  const { data: row, error } = await db
    .from('content_stills')
    .select('id, status, clip_url')
    .eq('project_id', projectId)
    .eq('scene_n', scene_n)
    .eq('cut', cut)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!row) {
    console.error(`No content_stills row for ${id} in project ${projectId}`);
    process.exit(1);
  }

  const { error: updErr } = await db
    .from('content_stills')
    .update({ status: 'pending', fail_reason: reason ?? null, clip_url: null })
    .eq('id', row.id);
  if (updErr) throw new Error(updErr.message);

  console.log(`[reject] S${scene_n}-${cut}: → pending${reason ? ` (${reason})` : ''}`);
}

// ── approve-all for an act ───────────────────────────────────────────────────

async function approveAll(act) {
  if (act == null) {
    console.error('--approve-all requires --act <number>');
    process.exit(2);
  }

  const { data: rows, error } = await db
    .from('content_stills')
    .select('id, scene_n, cut, status')
    .eq('project_id', projectId)
    .eq('act', Number(act));
  if (error) throw new Error(error.message);

  const pending = rows.filter((r) => r.status === 'pending');
  if (pending.length) {
    console.error(`Cannot approve — ${pending.length} still(s) still pending in ${actLabel(act)}:`);
    pending.forEach((r) => console.error(`  S${r.scene_n}-${r.cut}`));
    process.exit(1);
  }

  const toApprove = rows.filter((r) => r.status === 'generated');
  if (!toApprove.length) {
    const allPassed = rows.every((r) => r.status === 'passed');
    console.log(
      allPassed
        ? `[skip] All stills in ${actLabel(act)} are already passed.`
        : `[warn] No generated stills found in ${actLabel(act)}.`,
    );
    return;
  }

  const ids = toApprove.map((r) => r.id);
  const { error: updErr } = await db
    .from('content_stills')
    .update({ status: 'passed', fail_reason: null })
    .in('id', ids);
  if (updErr) throw new Error(updErr.message);

  console.log(`[approve] ${actLabel(act)}: ${toApprove.length} still(s) → passed`);
  toApprove.forEach((r) => console.log(`  ✓ S${r.scene_n}-${r.cut}`));
}

// ── list stills ──────────────────────────────────────────────────────────────

async function listStills(act) {
  let query = db
    .from('content_stills')
    .select('scene_n, cut, act, status, clip_url, fail_reason')
    .eq('project_id', projectId)
    .order('act')
    .order('scene_n')
    .order('cut');

  if (act != null) query = query.eq('act', Number(act));

  const { data: rows, error } = await query;
  if (error) throw new Error(error.message);
  if (!rows?.length) {
    console.log('No stills found.');
    return;
  }

  const STATUS_ICON = { pending: '⬜', generated: '🟡', passed: '✅', failed: '🔴' };

  let currentAct = null;
  for (const r of rows) {
    if (r.act !== currentAct) {
      currentAct = r.act;
      const actRows = rows.filter((x) => x.act === currentAct);
      const counts = { pending: 0, generated: 0, passed: 0 };
      actRows.forEach((x) => {
        if (x.status in counts) counts[x.status]++;
      });
      console.log(
        `\n── ${actLabel(currentAct)} (${actRows.length} stills: ${counts.pending}⬜ ${counts.generated}🟡 ${counts.passed}✅) ──`,
      );
    }
    const icon = STATUS_ICON[r.status] ?? '❓';
    const urlNote = r.clip_url ? ` → ${r.clip_url}` : '';
    const rejectNote = r.fail_reason ? ` [rejected: ${r.fail_reason}]` : '';
    console.log(`  ${icon} S${String(r.scene_n).padStart(2, '0')}-${r.cut}${urlNote}${rejectNote}`);
  }
  console.log('');
}

// ── main ─────────────────────────────────────────────────────────────────────

try {
  if (values.reject) {
    const reason = positionals[0] ?? null;
    await rejectStill(values.reject, reason);
  } else if (values['approve-all']) {
    await approveAll(values.act);
  } else {
    const act = values.all ? null : values.act;
    await listStills(act ?? null);
  }
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
}
