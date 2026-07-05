import { parseArgs } from 'util';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getServiceClient } from '@signal-studio/database';

const { values } = parseArgs({
  options: {
    project: { type: 'string' },
    output:  { type: 'string' },
  },
  strict: false,
});

if (!values.project) { console.error('Error: --project <id> required'); process.exit(2); }

const projectId = Number(values.project);
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../');
const outputPath = values.output ?? resolve(projectRoot, `temp/longform/${projectId}-promptsheet.md`);
const db = getServiceClient();

const ACT_LABELS = {
  0: 'COLD OPEN',
  1: 'ACT 1 — THE LINEAGE',
  2: 'ACT 2 — THE SETUP',
  3: 'ACT 3 — THE MATCH',
  4: 'ACT 4 — THE WALL',
  5: 'ACT 5 — WHAT IT MEANS',
  6: 'OUTRO',
};

// Drift checklists per act for generation review
const DRIFT_CHECKS = {
  0: ['GK-GILL amber jersey consistent?', 'Grey gloves visible?', 'Face in shadow?'],
  1: ['GK-GILL amber consistent?', 'PY-OUTFIELD five red stripes on white?', 'GK-90s navy/rust geometric print correct?', 'DE-OUTFIELD charcoal-black (not navy)?'],
  2: ['Charcoal-black [DE-KIT] visually distinct from navy tones?', 'PY-OUTFIELD stripes consistent?'],
  3: ['Both kits legible in same frame?', 'GK-GILL amber vs DE-GK forest-green: clearly different?', 'Cold blue grade on loss scenes?'],
  4: ['GK-GILL amber holds across all shootout scenes?', 'DE-GK forest-green consistent?'],
  5: ['S45-A three-keeper lineup: all three kit variants distinct?', 'Warm amber grade returning?'],
  6: [],
};

async function main() {
  // Load pending stills from content_stills
  const { data: stills, error: sErr } = await db
    .from('content_stills')
    .select('id, scene_n, cut, act, prompt, motion, image_source, reference_keys, status')
    .eq('project_id', projectId)
    .in('image_source', ['google', 'higgsfield'])
    .eq('status', 'pending')
    .order('act')
    .order('scene_n')
    .order('cut');
  if (sErr) throw new Error(sErr.message);

  // Load pending kit references
  const { data: refs, error: rErr } = await db
    .from('content_references')
    .select('key, description, prompt, url, status')
    .eq('project_id', projectId)
    .order('key');
  if (rErr) throw new Error(rErr.message);

  const pendingRefs = (refs ?? []).filter((r) => r.status === 'pending' || !r.url);
  const passedRefByKey = Object.fromEntries((refs ?? []).filter((r) => r.url).map((r) => [r.key, r.url]));

  const sections = [];

  // ── Section 1: Kit reference sheets ────────────────────────────────────────
  if (pendingRefs.length) {
    sections.push('# ① KIT REFERENCE SHEETS — generate these FIRST\n');
    sections.push('> Review and approve each one before generating any scenes.\n');
    for (const ref of pendingRefs) {
      sections.push(`## REF: ${ref.key} — ${ref.description ?? ''}`);
      sections.push(`\n**Prompt** (copy exactly):\n\`\`\`\n${ref.prompt}\n\`\`\``);
      sections.push(`\n**Output filename:** \`${ref.key}.png\`\n`);
    }
    sections.push('\n---\n');
  }

  // ── Section 2: Stills grouped by act ───────────────────────────────────────
  if (!stills?.length) {
    if (!pendingRefs.length) { console.error('No pending rows found.'); return; }
  }

  const byAct = {};
  for (const still of stills ?? []) {
    const act = still.act ?? 99;
    if (!byAct[act]) byAct[act] = [];
    byAct[act].push(still);
  }

  let totalStills = 0;
  for (const [act, actStills] of Object.entries(byAct).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    const label = ACT_LABELS[act] ?? `ACT ${act}`;
    const checks = DRIFT_CHECKS[act] ?? [];

    sections.push(`# ② ${label} (${actStills.length} stills)\n`);
    if (checks.length) {
      sections.push('**After generating this act, review every image for:**');
      for (const c of checks) sections.push(`- [ ] ${c}`);
      sections.push('');
    }

    for (const still of actStills) {
      const id = `S${String(still.scene_n).padStart(2, '0')}-${still.cut}`;
      sections.push(`## ${id} · motion: ${still.motion}`);
      sections.push(`\n**Prompt** (copy exactly):\n\`\`\`\n${still.prompt}\n\`\`\``);
      sections.push(`\n**Output filename:** \`${id}.png\``);

      const refKeys = still.reference_keys ?? [];
      const refLines = refKeys.map((k) => {
        const url = passedRefByKey[k];
        return url ? `- \`${k}\`: attach approved reference → ${url}` : `- \`${k}\`: not yet approved — generate kit sheet first`;
      });
      if (refLines.length) {
        sections.push(`\n**Reference images to attach:**`);
        for (const l of refLines) sections.push(l);
      }
      sections.push('');
      totalStills++;
    }
    sections.push('---\n');
  }

  const output = sections.join('\n') + '\n';
  mkdirSync(resolve(projectRoot, 'temp/longform'), { recursive: true });
  writeFileSync(outputPath, output, 'utf8');
  console.error(`Wrote ${pendingRefs.length} ref sheet(s) + ${totalStills} still prompt(s) → ${outputPath}`);

  // Verify no ART_DIRECTION prefix leaked in
  if (output.includes('ART_DIRECTION') || output.includes('GLOBAL ART DIRECTION')) {
    console.error('[warn] ART_DIRECTION prefix detected in output — check prompt data');
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
