import { parseArgs } from 'util';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createHash } from 'crypto';
import { getServiceClient } from '@signal-studio/database';
import { parsePromptsV2 } from '../../src/longform/parse-prompts-v2.js';
import { parseShotlistV2 } from '../../src/longform/parse-shotlist-v2.js';
import { mapAllCues } from '../../src/longform/map-audio-cues.js';

const { values } = parseArgs({
  options: {
    project: { type: 'string' },
    dry: { type: 'boolean', default: false },
    prompts: { type: 'string' },
    shotlist: { type: 'string' },
    snapshot: { type: 'string' },
  },
  strict: false,
});

if (!values.project) { console.error('Error: --project <id> required'); process.exit(2); }

const projectId = Number(values.project);
const dry = values.dry;
const db = getServiceClient();

const REPO_ROOT = resolve(new URL('.', import.meta.url).pathname, '../../../../');
const promptsPath = values.prompts ?? resolve(REPO_ROOT, `content/longform/${projectId}/prompts-v2.md`);
const shotlistPath = values.shotlist ?? resolve(REPO_ROOT, `content/longform/${projectId}/shotlist-v2.md`);

if (!existsSync(promptsPath)) { console.error(`prompts-v2.md not found: ${promptsPath}`); process.exit(1); }
if (!existsSync(shotlistPath)) { console.error(`shotlist-v2.md not found: ${shotlistPath}`); process.exit(1); }

function voHash(text) {
  return createHash('sha256').update(text ?? '').digest('hex').slice(0, 12);
}

// Load optional snapshot for VO diff checking
function loadSnapshot(path) {
  if (!path || !existsSync(path)) return {};
  const snap = JSON.parse(readFileSync(path, 'utf-8'));
  const map = {};
  for (const clip of snap.clips ?? []) {
    map[clip.scene_n] = clip.vo_text_hash;
  }
  return map;
}

// Kit reference rows: derived from INLINE KIT DEFINITIONS in prompts-v2.md
const KIT_REFS = [
  {
    key: 'GK-GILL',
    description: 'Paraguay GK — amber-gold kit, grey gloves, face in shadow',
    prompt: 'Kit reference sheet: one anonymous goalkeeper figure, front view, neutral pose, full kit visible, plain dark background. Kit: deep amber-gold long-sleeved goalkeeper jersey (solid amber-gold, no patterns, no logos, no numbers), plain black goalkeeper shorts, black socks, pale grey goalkeeper gloves. Face fully in shadow — no facial features visible. Cinematic film still, 35mm, slight film grain, neutral dark background, 16:9 aspect ratio.',
  },
  {
    key: 'PY-OUTFIELD',
    description: 'Paraguay outfield — five red stripes on white, royal-blue shorts',
    prompt: 'Kit reference sheet: one anonymous outfield player figure, front view, neutral pose, full kit visible, plain dark background. Kit: football shirt with five bold vertical red stripes on a white base (stripes run full length top to bottom, equal width), plain royal-blue shorts, royal-blue socks with one white band at the top. No badges, no crests, no numbers. Cinematic film still, 35mm, slight film grain, neutral dark background, 16:9 aspect ratio.',
  },
  {
    key: 'DE-OUTFIELD',
    description: 'Germany outfield — charcoal-black kit, white collar/cuff trim',
    prompt: 'Kit reference sheet: one anonymous outfield player figure, front view, neutral pose, full kit visible, plain dark background. Kit: matte charcoal-black football shirt with thin white trim on the collar and sleeve cuffs only, plain black shorts, plain black socks. No badges, no crests, no numbers. Cinematic film still, 35mm, slight film grain, neutral dark background, 16:9 aspect ratio.',
  },
  {
    key: 'DE-GK',
    description: 'Germany GK — dark forest-green kit, black gloves, face in shadow',
    prompt: 'Kit reference sheet: one anonymous goalkeeper figure, front view, neutral pose, full kit visible, plain dark background. Kit: dark forest-green long-sleeved goalkeeper jersey (solid forest green, no logos), plain black shorts, plain black gloves. Face in shadow. Cinematic film still, 35mm, slight film grain, neutral dark background, 16:9 aspect ratio.',
  },
  {
    key: 'GK-90s',
    description: 'Paraguay 1990s GK — navy/rust geometric print, cream gloves, face in shadow',
    prompt: 'Kit reference sheet: one anonymous goalkeeper figure, front view, neutral pose, full kit visible, plain dark background. Kit: boxy oversized 1990s-cut long-sleeved goalkeeper jersey with bold abstract geometric print — navy-blue base with large rust-orange angular block shapes across chest and sleeves. Plain black shorts. Chunky cream-white 1990s goalkeeper gloves. Face in shadow. Cinematic film still, 35mm, slight film grain, neutral dark background, 16:9 aspect ratio.',
  },
];

// audio_plan: 5 mood segments based on act timecodes + opening hum
const AUDIO_PLAN = {
  ambience: 'stadium_hum',
  ambience_ranges: [[31, 543]],
  segments: [
    { act: 0, from_sec: 0, to_sec: 31, track: 'hum_only', gain_db: -30 },
    { act: 1, from_sec: 31, to_sec: 133, track: 'somber', gain_db: -23 },
    { act: 2, from_sec: 133, to_sec: 197, track: 'tension', gain_db: -23 },
    { act: 3, from_sec: 197, to_sec: 318, track: 'tension', gain_db: -23 },
    { act: 4, from_sec: 318, to_sec: 426, track: 'drone', gain_db: -22 },
    { act: 5, from_sec: 426, to_sec: 543, track: 'reflective', gain_db: -25 },
  ],
};

async function main() {
  console.log(`[seed-stills-v2] project=${projectId} dry=${dry}`);

  const promptRows = parsePromptsV2(promptsPath);
  const shotlistScenes = parseShotlistV2(shotlistPath);
  const unmatched = mapAllCues(shotlistScenes);
  if (unmatched.length) {
    console.warn(`[warn] ${unmatched.length} unmatched audio cues:`, unmatched.map((u) => `S${u.scene_n}`).join(', '));
  }

  const snapshotHashes = loadSnapshot(values.snapshot);

  // Index shotlist scenes by scene_n
  const sceneByN = Object.fromEntries(shotlistScenes.map((s) => [s.scene_n, s]));

  // Build content_stills upsert rows from prompt rows
  const stillRows = [];
  const reuseRows = [];
  const editorRows = [];

  for (const p of promptRows) {
    const scene = sceneByN[p.scene_n];
    if (!scene) {
      console.warn(`[warn] prompt row ${p.id} has no matching shotlist scene ${p.scene_n}`);
      continue;
    }

    // Find motion for this cut
    const motionEntry = scene.still_motions?.find((m) => m.cut === p.cut) ?? scene.still_motions?.[0];
    const motion = motionEntry?.motion ?? 'push';

    // timecode → start_sec / end_sec
    const start_sec = tcToSec(p.timecode.from);
    const end_sec = tcToSec(p.timecode.to);

    const base = {
      project_id: projectId,
      scene_n: p.scene_n,
      cut: p.cut ?? 'A',
      act: p.act,
      motion,
      start_sec,
      end_sec,
      image_source: 'google',
      reference_keys: [],
    };

    if (p.kind === 'editor_build' || (p.is_reuse && !p.prompt)) {
      // Editor build or reuse with no prompt
      const kind = p.kind === 'editor_build' ? 'editor' : 'reuse';
      base.image_source = kind;
      base.prompt = null;
      base.status = 'passed';

      // Detect reuse_of from notes
      const reuseMatch = p.notes?.match(/reuse\s+(S\d+(?:-[A-D])?)/i);
      if (reuseMatch) base.reuse_of = reuseMatch[1];

      // Detect regrade
      if (p.notes?.toLowerCase().includes('warm') || p.notes?.toLowerCase().includes('amber')) {
        base.regrade = 'warm_amber';
      } else if (p.notes?.toLowerCase().includes('cold') || p.notes?.toLowerCase().includes('blue')) {
        base.regrade = 'cold_blue';
      }

      // Detect dissolve (S44)
      if (p.notes?.toLowerCase().includes('dissolve')) base.transition = 'dissolve';

      editorRows.push(base);
    } else {
      base.prompt = p.prompt;
      base.status = 'pending';
      stillRows.push(base);
    }
  }

  // Counts per act
  const actCounts = {};
  for (const r of [...stillRows, ...editorRows]) {
    const k = r.act ?? '?';
    actCounts[k] = (actCounts[k] ?? 0) + 1;
  }
  console.log(`\nPer-act still counts:`);
  for (const [act, count] of Object.entries(actCounts).sort()) {
    const label = act === '0' ? 'Cold Open' : act === '6' ? 'Outro' : `Act ${act}`;
    console.log(`  ${label}: ${count}`);
  }
  console.log(`  Generated prompts:  ${stillRows.length}`);
  console.log(`  Reuse/editor rows:  ${editorRows.length}`);
  console.log(`  Kit ref rows:       ${KIT_REFS.length}`);
  console.log(`  Scenes total:       ${shotlistScenes.length}`);

  if (dry) { console.log('\n[dry] No DB writes.'); return; }

  // P2-4: Upsert content_stills (generated stills)
  let insertCount = 0, skipCount = 0;
  const allRows = [...stillRows, ...editorRows];
  for (const row of allRows) {
    const { data: existing } = await db.from('content_stills')
      .select('id, status').eq('project_id', projectId).eq('scene_n', row.scene_n).eq('cut', row.cut).maybeSingle();
    if (existing) { skipCount++; continue; }
    const { error } = await db.from('content_stills').insert(row);
    if (error) throw new Error(`Insert S${row.scene_n}-${row.cut}: ${error.message}`);
    insertCount++;
  }
  console.log(`\ncontent_stills: ${insertCount} inserted, ${skipCount} already existed`);

  // P2-5: Update content_clips with VO/kind/duration/overlays/sfx (VO diff)
  let clipsUpdated = 0, clipsVoReset = 0;
  for (const scene of shotlistScenes) {
    if (!scene.vo_text) continue;
    const newHash = voHash(scene.vo_text);
    const oldHash = snapshotHashes[scene.scene_n];
    const voChanged = oldHash && oldHash !== newHash;

    const update = {
      vo_text: scene.vo_text,
      duration_sec: scene.duration_sec,
      audio_cue: scene.audio_cue ?? null,
      overlays: scene.overlays.length ? scene.overlays : null,
      sfx: scene.sfx?.length ? scene.sfx : null,
    };
    if (voChanged) {
      update.vo_url = null;
      clipsVoReset++;
    }
    if (scene.kind === 'editor_build') update.kind = 'editor_build';

    const { error } = await db.from('content_clips')
      .update(update).eq('project_id', projectId).eq('scene_n', scene.scene_n);
    if (error) throw new Error(`Clip update S${scene.scene_n}: ${error.message}`);
    clipsUpdated++;
  }
  console.log(`content_clips: ${clipsUpdated} updated, ${clipsVoReset} VO reset (text changed)`);

  // P2-6: Upsert kit references
  let refInserted = 0, refSkipped = 0;
  for (const ref of KIT_REFS) {
    const { data: existing } = await db.from('content_references')
      .select('id').eq('project_id', projectId).eq('key', ref.key).maybeSingle();
    if (existing) { refSkipped++; continue; }
    const { error } = await db.from('content_references').insert({ project_id: projectId, ...ref });
    if (error) throw new Error(`Ref insert ${ref.key}: ${error.message}`);
    refInserted++;
  }
  console.log(`content_references: ${refInserted} inserted, ${refSkipped} already existed`);

  // P2-7: Set audio_plan + status on content_items
  const { data: item } = await db.from('content_items').select('id, status, audio_plan')
    .eq('id', projectId).single();
  const safeToAdvance = ['seeding', 'brief', 'storyboard', 'planning', 'scripting'].includes(item?.status);
  const audioUpdate = { audio_plan: AUDIO_PLAN, target_duration_sec: 543 };
  if (safeToAdvance) audioUpdate.status = 'awaiting_refs';
  const { error: itemErr } = await db.from('content_items').update(audioUpdate).eq('id', projectId);
  if (itemErr) throw new Error(`content_items update: ${itemErr.message}`);
  console.log(`content_items: audio_plan set${safeToAdvance ? ', status → awaiting_refs' : ' (status unchanged)'}`);
}

function tcToSec(tc) {
  if (!tc) return null;
  const [m, s] = tc.split(':').map(Number);
  return m * 60 + s;
}

main().catch((e) => { console.error(e.message); process.exit(1); });
