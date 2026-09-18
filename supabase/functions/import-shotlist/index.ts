import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// ── Parser — v2 shot list templates (2026-07-29) ──────────────────────────────
// Two templates, both one-clip-per-file: a `key: value` header followed by a
// pipe-delimited scene table. `clip_type` in the header picks the template:
//   'long_form' — timecode-driven, shorts_source_flag marks Shorts candidates.
//   'short'     — role-driven (Hook/Stakes/Build/Peak/End Card), timecodes
//                 optional, asset_type is the load-bearing field.
// Old bullet/emoji-format long-form shot lists (the 5 published videos + Wave
// 1 Shorts) are NOT parsed by this — fresh start from Video #7, per decision.

function tcToSec(tc: string): number | null {
  const m = tc.trim().match(/^(\d+):(\d+)$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

interface ParsedHeader {
  [key: string]: string | Record<string, string>;
}

function parseHeader(text: string): ParsedHeader {
  const lines = text.split('\n');
  const header: ParsedHeader = {};
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*\|/.test(line)) break; // scene table started — header section is done
    const m = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    const rest = m[2].trim();

    if (rest === '|') {
      // Block scalar (global_art_direction: |) — collect indented lines.
      const block: string[] = [];
      let j = i + 1;
      while (j < lines.length && (lines[j].trim() === '' || /^\s+/.test(lines[j]))) {
        if (lines[j].trim() !== '') block.push(lines[j].trim());
        j++;
      }
      header[key] = block.join(' ');
      i = j - 1;
    } else if (rest === '') {
      // Possible nested mapping (posting_dates:) — collect indented sub-keys.
      const sub: Record<string, string> = {};
      let j = i + 1;
      while (j < lines.length && /^\s{2,}[a-zA-Z_]+:/.test(lines[j])) {
        const sm = lines[j].match(/^\s{2,}([a-zA-Z_]+):\s*(.*)$/);
        if (sm) sub[sm[1].trim()] = sm[2].trim();
        j++;
      }
      if (Object.keys(sub).length) {
        header[key] = sub;
        i = j - 1;
      } else {
        header[key] = '';
      }
    } else {
      header[key] = rest;
    }
  }
  return header;
}

interface SceneRow {
  [column: string]: string;
}

function parseSceneTable(text: string): SceneRow[] {
  const lines = text.split('\n').filter((l) => /^\s*\|/.test(l));
  if (lines.length < 2) return [];

  const cells = (line: string) =>
    line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => c.trim());

  const columns = cells(lines[0]).map((c) => c.toLowerCase().replace(/\s+/g, '_'));
  const isSeparator = (line: string) => cells(line).every((c) => /^:?-+:?$/.test(c));

  const rows: SceneRow[] = [];
  for (const line of lines.slice(1)) {
    if (isSeparator(line)) continue;
    const values = cells(line);
    const row: SceneRow = {};
    columns.forEach((col, i) => {
      row[col] = (values[i] ?? '').trim();
    });
    rows.push(row);
  }
  return rows;
}

const ASSET_TYPES = new Set(['new_still', 'reused_crop', 'vertical_native_redesign', 'title_card']);

function normalizeAssetType(raw: string): string | null {
  const s = raw.toLowerCase().trim();
  for (const t of ASSET_TYPES) if (s.includes(t)) return t;
  return null;
}

function stripQuotes(s: string): string {
  return s.replace(/^"(.*)"$/, '$1');
}

// ── Audio: shot-list-driven music beds (2026-07-29 template v3) ──────────────
// Two independent layers: `audio_cue` (unchanged) feeds SFX one-shots via
// map-audio-cues.js — not handled here. `music_bed` (+ `music_gain_db` for
// long-form, `heartbeat_layer` for Shorts) feeds the continuous background
// bed, merged from per-scene rows into segments here.

const LONGFORM_MUSIC_BEDS = new Set([
  'somber',
  'tension',
  'drone',
  'release',
  'reflective',
  'hum_only',
  'silence',
]);
// Only these 5 have an actual bed audio file (manifest.json) — hum_only/silence
// have no track to apply a gain to, so they never get the flat-default fallback.
const GAIN_BEARING_BEDS = new Set(['somber', 'tension', 'drone', 'release', 'reflective']);
const LONGFORM_DEFAULT_GAIN_DB = -23; // audio-mix.js:119 — seg.gain_db ?? -23

interface SceneAudioRow {
  sceneN: number;
  startSec: number | null;
  endSec: number | null;
  musicBed: string | null;
  musicGainDb: number | null;
  heartbeat: boolean;
}

// Shared merge core: walk rows in file order, comparing each row only to the
// immediately preceding one. Same value as previous → extend the open run.
// Different value (including blank, which always closes a run) → close it and
// start a new one if the new value is non-blank. A value reappearing later is
// always a NEW run — never merged with an earlier, non-adjacent occurrence.
function mergeConsecutive<T>(
  rows: SceneAudioRow[],
  getValue: (r: SceneAudioRow) => T | null,
): { value: T; startIdx: number; endIdx: number }[] {
  const runs: { value: T; startIdx: number; endIdx: number }[] = [];
  let current: { value: T; startIdx: number; endIdx: number } | null = null;
  rows.forEach((row, i) => {
    const v = getValue(row);
    if (v === null || v === undefined) {
      current = null;
      return;
    }
    if (current && current.value === v) {
      current.endIdx = i;
    } else {
      current = { value: v, startIdx: i, endIdx: i };
      runs.push(current);
    }
  });
  return runs;
}

// Long-form: music_bed (required every row) + music_gain_db → audio_plan.
function buildLongformAudioPlan(rows: SceneAudioRow[]): Record<string, unknown>[] {
  const runs = mergeConsecutive(rows, (r) => r.musicBed);
  return runs.map(({ value: track, startIdx, endIdx }) => {
    // Gain: last non-blank music_gain_db encountered while extending the run
    // (satisfies both "use the only override" and "disagreement → use the
    // last one encountered" from the spec, since they're the same rule).
    let gainDb: number | null = null;
    for (let i = startIdx; i <= endIdx; i++) {
      if (rows[i].musicGainDb != null) gainDb = rows[i].musicGainDb;
    }
    if (gainDb == null && GAIN_BEARING_BEDS.has(track)) gainDb = LONGFORM_DEFAULT_GAIN_DB;
    return {
      track,
      from_sec: rows[startIdx].startSec,
      to_sec: rows[endIdx].endSec,
      gain_db: gainDb,
    };
  });
}

// Shorts: music_bed (optional — blank = no bed) + heartbeat_layer, both
// scene-referenced (start_scene/end_scene, not seconds — timecodes are
// optional for Shorts until cutting is locked).
function buildShortsSoundDesign(rows: SceneAudioRow[]): {
  bed: Record<string, unknown>[];
  heartbeat: Record<string, unknown>[];
} {
  const bedRuns = mergeConsecutive(rows, (r) => r.musicBed);
  const heartbeatRuns = mergeConsecutive(rows, (r) => (r.heartbeat ? 'yes' : null));
  return {
    bed: bedRuns.map(({ value: key, startIdx, endIdx }) => ({
      key,
      start_scene: rows[startIdx].sceneN,
      end_scene: rows[endIdx].sceneN,
    })),
    heartbeat: heartbeatRuns.map(({ startIdx, endIdx }) => ({
      start_scene: rows[startIdx].sceneN,
      end_scene: rows[endIdx].sceneN,
    })),
  };
}

interface ParsedShotlist {
  header: ParsedHeader;
  clipType: 'long_form' | 'short';
  title: string | null;
  videoSlug: string | null;
  parentVideoSlug: string | null;
  targetDurationSec: number | null;
  scenes: SceneRow[];
}

function parseShotlist(text: string): ParsedShotlist {
  const header = parseHeader(text);
  const clipType =
    header.clip_type === 'short' ? 'short' : header.clip_type === 'long_form' ? 'long_form' : null;
  const scenes = parseSceneTable(text);
  return {
    header,
    clipType: (clipType ?? 'long_form') as 'long_form' | 'short',
    title: (header.title as string) || null,
    videoSlug: (header.video_slug as string) || null,
    parentVideoSlug: (header.parent_video_slug as string) || null,
    targetDurationSec: header.target_runtime_sec ? Number(header.target_runtime_sec) : null,
    scenes,
  };
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let projectId: number;
  let shotlistText: string;

  try {
    const body = await req.json();
    projectId = Number(body.project_id);
    shotlistText = String(body.shotlist_text ?? '');
    if (!projectId || !shotlistText) throw new Error('project_id and shotlist_text required');
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }

  // Verify project exists and is in 'brief' status
  const { data: project, error: projErr } = await supabase
    .from('content_items')
    .select('id, status')
    .eq('id', projectId)
    .maybeSingle();
  if (projErr || !project) return json({ error: 'Project not found' }, 404);
  if (project.status !== 'brief')
    return json({ error: `Project must be in 'brief' status (current: ${project.status})` }, 409);

  const parsed = parseShotlist(shotlistText);
  if (!parsed.header.clip_type) {
    return json({ error: 'Shot list header is missing clip_type: long_form | short' }, 400);
  }
  if (!parsed.title) return json({ error: 'Shot list header is missing title:' }, 400);
  if (!parsed.videoSlug) return json({ error: 'Shot list header is missing video_slug:' }, 400);
  if (!parsed.scenes.length)
    return json({ error: 'No scene rows found — check the pipe-table formatting' }, 400);

  // Shorts must resolve their parent long-form project by video_slug.
  let parentProjectId: number | null = null;
  if (parsed.clipType === 'short') {
    if (!parsed.parentVideoSlug) {
      return json({ error: 'Shorts header is missing parent_video_slug:' }, 400);
    }
    const { data: parent } = await supabase
      .from('content_items')
      .select('id')
      .eq('video_slug', parsed.parentVideoSlug)
      .maybeSingle();
    if (!parent) {
      return json(
        { error: `Parent video "${parsed.parentVideoSlug}" not found — import/create it first.` },
        404,
      );
    }
    parentProjectId = (parent as { id: number }).id;
  }

  // Long-form: music_bed is required on every row, no exceptions (template v3).
  if (parsed.clipType === 'long_form') {
    for (const row of parsed.scenes) {
      const bed = (row.music_bed ?? '').toLowerCase().trim();
      if (!LONGFORM_MUSIC_BEDS.has(bed)) {
        return json(
          {
            error: `Scene ${row.scene_id || '?'}: music_bed must be one of ${[...LONGFORM_MUSIC_BEDS].join(', ')} (got "${row.music_bed ?? ''}")`,
          },
          400,
        );
      }
    }
  }

  // Build content_stills + content_clips rows from the scene table.
  const stillRows: Record<string, unknown>[] = [];
  const clipRows: Record<string, unknown>[] = [];
  const sceneAudioRows: SceneAudioRow[] = [];

  parsed.scenes.forEach((row, idx) => {
    const sceneN = Number.parseInt(row.scene_id, 10) || idx + 1;
    const startSec = row.timecode_start ? tcToSec(row.timecode_start) : null;
    const endSec = row.timecode_end ? tcToSec(row.timecode_end) : null;
    const assetType = normalizeAssetType(row.asset_type ?? '');
    const isTextCard = assetType === 'title_card';

    const musicBed = (row.music_bed ?? '').toLowerCase().trim() || null;
    const musicGainDb = row.music_gain_db ? Number(row.music_gain_db) : null;
    const heartbeat = (row.heartbeat_layer ?? '').toLowerCase().trim() === 'yes';
    sceneAudioRows.push({ sceneN, startSec, endSec, musicBed, musicGainDb, heartbeat });

    clipRows.push({
      project_id: projectId,
      scene_n: sceneN,
      kind: isTextCard ? 'text_card' : 'still',
      vo_text: row.vo_text ? stripQuotes(row.vo_text) : null,
      audio_cue: row.audio_cue || null,
      duration_sec: row.duration_sec ? Number(row.duration_sec) || null : null,
      scene_role: row.scene_role || null,
      word_count_check: row.word_count_check || null,
      kit_tag: row.kit_tag || null,
      kit_tag_check: row.kit_tag_check || null,
      captions_mode: row.captions_mode || null,
      tier_overlay: row.tier_overlay || null,
      pattern_interrupt_check: row.pattern_interrupt_check || null,
      shorts_source_flag: row.shorts_source_flag || null,
      sfx:
        musicBed || musicGainDb != null || heartbeat
          ? { music_bed: musicBed, music_gain_db: musicGainDb, heartbeat_layer: heartbeat || null }
          : null,
    });

    if (!isTextCard) {
      const imageSource = assetType === 'reused_crop' ? 'reuse' : 'google';
      stillRows.push({
        project_id: projectId,
        scene_n: sceneN,
        cut: 'A',
        start_sec: startSec,
        end_sec: endSec,
        image_source: imageSource,
        reuse_of: assetType === 'reused_crop' ? row.asset_ref || null : null,
        prompt: row.asset_ref || null,
        asset_type: assetType,
        asset_ref: row.asset_ref || null,
        status: 'pending',
      });
    }
  });

  // Upsert content_stills
  let stillsInserted = 0;
  let stillsSkipped = 0;
  for (const row of stillRows) {
    const r = row as { project_id: number; scene_n: number; cut: string };
    const { data: existing } = await supabase
      .from('content_stills')
      .select('id')
      .eq('project_id', r.project_id)
      .eq('scene_n', r.scene_n)
      .eq('cut', r.cut)
      .maybeSingle();
    if (existing) {
      stillsSkipped++;
      continue;
    }
    const { error } = await supabase.from('content_stills').insert(row);
    if (error) return json({ error: `Insert S${r.scene_n}: ${error.message}` }, 500);
    stillsInserted++;
  }

  // Upsert content_clips
  for (const row of clipRows) {
    const r = row as { project_id: number; scene_n: number };
    const { data: existing } = await supabase
      .from('content_clips')
      .select('id')
      .eq('project_id', r.project_id)
      .eq('scene_n', r.scene_n)
      .maybeSingle();
    if (existing) {
      await supabase
        .from('content_clips')
        .update(row)
        .eq('id', (existing as { id: number }).id);
    } else {
      await supabase.from('content_clips').insert(row);
    }
  }

  // Update project: clip_type, video_slug, parent link, header meta, advance to storyboard.
  const shotListMeta =
    parsed.clipType === 'long_form'
      ? {
          mode: parsed.header.mode ?? null,
          match_metadata: parsed.header.match_metadata ?? null,
          fact_check_source: parsed.header.fact_check_source ?? null,
          global_art_direction: parsed.header.global_art_direction ?? null,
        }
      : {
          shorts_role: parsed.header.shorts_role ?? null,
          hook_formula: parsed.header.hook_formula ?? null,
          stakes_clause: parsed.header.stakes_clause ?? null,
          related_video_link_set: parsed.header.related_video_link_set ?? null,
          posting_dates: parsed.header.posting_dates ?? null,
          language: parsed.header.language ?? null,
          match_metadata: parsed.header.match_metadata ?? null,
          fact_check_source: parsed.header.fact_check_source ?? null,
          sound_design: buildShortsSoundDesign(sceneAudioRows),
        };

  const projectUpdate: Record<string, unknown> = {
    status: 'storyboard',
    clip_type: parsed.clipType,
    video_slug: parsed.videoSlug,
    parent_project_id: parentProjectId,
    shot_list_meta: shotListMeta,
    title: parsed.title,
  };
  if (parsed.targetDurationSec) projectUpdate.target_duration_sec = parsed.targetDurationSec;
  if (parsed.clipType === 'long_form')
    projectUpdate.audio_plan = buildLongformAudioPlan(sceneAudioRows);

  const { error: updateErr } = await supabase
    .from('content_items')
    .update(projectUpdate)
    .eq('id', projectId);
  if (updateErr) return json({ error: `Project update: ${updateErr.message}` }, 500);

  return json({
    ok: true,
    clip_type: parsed.clipType,
    title: parsed.title,
    video_slug: parsed.videoSlug,
    parent_project_id: parentProjectId,
    target_duration_sec: parsed.targetDurationSec,
    scenes_total: parsed.scenes.length,
    stills_inserted: stillsInserted,
    stills_skipped: stillsSkipped,
    clips_upserted: clipRows.length,
  });
});
