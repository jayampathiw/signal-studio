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

// ── Parser (ported from apps/video/src/longform/parse-shotlist-v2.js) ─────────

const ACT_FROM_HEADER: Record<string, number> = {
  'COLD OPEN': 0,
  'ACT 1': 1, 'ACT 2': 2, 'ACT 3': 3, 'ACT 4': 4, 'ACT 5': 5,
  'OUTRO': 6,
};

function tcToSec(tc: string): number {
  const [m, s] = tc.split(':').map(Number);
  return m * 60 + s;
}

function normalizeMotion(raw: string): string {
  const s = raw.toLowerCase();
  if (s.includes('smash')) return 'smash';
  if (s.includes('parallax') || s.includes('2.5d')) return 'parallax';
  if (s.includes('micro')) return 'micro_push';
  if (s.includes('pull')) return 'pull';
  if (s.includes('pan')) return s.includes('rl') || s.includes('right') ? 'pan_rl' : 'pan_lr';
  if (s.includes('hold')) return 'hold';
  return 'push';
}

function parseMotionLine(motionLine: string, cutCount: number) {
  const line = motionLine.replace(/^🎞️\s*/, '').trim();
  const cutPattern = /\b([A-D]):\s*(SMASH|PUSH|PULL|PARALLAX|micro.?PUSH|Slow lateral pan|Hold|pan)\b/gi;
  const cutMatches = [...line.matchAll(cutPattern)];
  if (cutMatches.length >= 2) {
    return cutMatches.map((m) => ({ cut: m[1].toUpperCase(), motion: normalizeMotion(m[2]) }));
  }
  const primary = normalizeMotion(line);
  return Array.from({ length: cutCount || 1 }, (_, i) => ({
    cut: String.fromCharCode(65 + i),
    motion: primary,
  }));
}

function parseOverlayLine(line: string) {
  // v2: "📝 CARD TEXT — Bebas Neue, amber "WORD", white rest, large, right third. 3s. Drops at 2:07"
  // v1: "📝 Editor overlay at 2:07: "16 years" (small, cream)"
  const raw = line.replace(/^📝\s*/, '').trim();
  const v2sep = raw.indexOf(' — Bebas');
  if (v2sep !== -1) {
    const cardText = raw.slice(0, v2sep).trim();
    const meta = raw.slice(v2sep + 2);
    const amberM = meta.match(/amber(?:\s+on)?\s+"([^"]+)"/i);
    const durM = meta.match(/(\d+)s[\s.]/);
    const atM = meta.match(/at\s+(\d+:\d+)/i);
    const zoneM = meta.match(/(right third|left third|bottom third|centered|over [^,\.]+|editor [^,\.]+)/i);
    const sizeM = meta.match(/\b(large|small)\b/i);
    return {
      text: cardText,
      amber_word: amberM ? amberM[1] : null,
      size: sizeM ? sizeM[1].toLowerCase() : 'large',
      zone: zoneM ? zoneM[1].toLowerCase().trim() : null,
      duration_sec: durM ? Number(durM[1]) : null,
      at_sec: atM ? tcToSec(atM[1]) : null,
    };
  }
  const timeMatch = line.match(/at\s+(\d+:\d+)/);
  const textMatch = line.match(/"([^"]+)"/);
  return {
    text: textMatch ? textMatch[1] : raw,
    amber_word: null,
    size: 'small',
    zone: null,
    duration_sec: null,
    at_sec: timeMatch ? tcToSec(timeMatch[1]) : null,
  };
}

interface Still {
  cut: string;
  prompt: string;
  reference_keys: string[];
  negative_space: string | null;
}

interface Scene {
  scene_n: number;
  act: number | null;
  from_tc: string;
  to_tc: string;
  duration_sec: number;
  grade: string | null;
  vo_text: string | null;
  audio_cue: string | null;
  overlays: ReturnType<typeof parseOverlayLine>[];
  still_motions: { cut: string; motion: string }[];
  stills: Still[];
  keep_video: boolean;
  kind: 'still' | 'editor_build';
  motion_raw?: string;
}

interface ParseResult {
  title: string | null;
  target_duration_sec: number | null;
  scenes: Scene[];
}

function parseShotlistText(text: string): ParseResult {
  const lines = text.split('\n');
  const scenes: Scene[] = [];
  let currentScene: Scene | null = null;
  let currentAct: number | null = null;
  let stillCount = 0;
  let targetDurationSec: number | null = null;
  let title: string | null = null;

  const flush = () => {
    if (currentScene) scenes.push(currentScene);
    currentScene = null;
    stillCount = 0;
  };

  for (const line of lines) {
    if (!title) {
      const titleM = line.match(/^\*\*TITLE:\*\*\s*(.*)/);
      if (titleM) { title = titleM[1].trim(); continue; }
    }
    if (targetDurationSec === null) {
      const durM = line.match(/\*\*TARGET_DURATION_SEC:\*\*\s*(\d+)/);
      if (durM) { targetDurationSec = Number(durM[1]); continue; }
    }

    const actM = line.match(/^##\s+(COLD OPEN|ACT \d+|OUTRO)/);
    if (actM) {
      const key = actM[1].replace(/\s*—.*$/, '').trim();
      currentAct = ACT_FROM_HEADER[key] ?? null;
      continue;
    }

    const sceneM = line.match(/\*\*SCENE\s+(\d+)\s+[—-]\s+(\d+:\d+)[–-](\d+:\d+)\s+\((\d+)s\)\*\*/);
    if (sceneM) {
      flush();
      const [, n, fromTc, toTc, durStr] = sceneM;
      const gradeM = line.match(/·\s*(WARM|COLD|MONOCHROME|MOURNFUL)/i);
      currentScene = {
        scene_n: Number(n),
        act: currentAct,
        from_tc: fromTc,
        to_tc: toTc,
        duration_sec: Number(durStr),
        grade: gradeM ? gradeM[1].toUpperCase() : null,
        vo_text: null,
        audio_cue: null,
        overlays: [],
        still_motions: [],
        stills: [],
        keep_video: line.includes('KEEP-VIDEO'),
        kind: line.includes('EDITOR GRAPHIC') || line.includes('EDITOR BUILD') ? 'editor_build' : 'still',
      };
      stillCount = 0;
      continue;
    }

    if (!currentScene) continue;

    if (line.startsWith('🖼️')) {
      stillCount++;
      const cutM = line.match(/🖼️\s+STILL\s+([A-D]):\s*(.*)/);
      if (cutM) {
        const prompt = cutM[2].trim();
        const bracketRefs = [...prompt.matchAll(/\[([A-Z][A-Z0-9-]+)\]/g)].map((m: RegExpMatchArray) => m[1]);
        const atRefs = [...prompt.matchAll(/@([a-z][a-z0-9]+)\b/g)].map((m: RegExpMatchArray) => m[1]);
        const refKeys = [...new Set([...bracketRefs, ...atRefs])];
        const zoneM = prompt.match(/(right|left|bottom) third negative space/i);
        const negative_space = zoneM ? `${zoneM[1].toLowerCase()}_third` : null;
        currentScene.stills.push({ cut: cutM[1], prompt, reference_keys: refKeys, negative_space });
      }
      continue;
    }

    if (line.startsWith('🎞️')) {
      currentScene.motion_raw = line.replace(/^🎞️\s*/, '').trim();
      continue;
    }

    if (line.startsWith('🎙️')) {
      currentScene.vo_text = line.replace(/^🎙️\s*/, '').trim().replace(/^"/, '').replace(/"$/, '');
      continue;
    }

    if (line.startsWith('🔊')) {
      currentScene.audio_cue = line.replace(/^🔊\s*/, '').trim();
      continue;
    }

    if (line.startsWith('📝')) {
      currentScene.overlays.push(parseOverlayLine(line));
      continue;
    }
  }
  flush();

  for (const scene of scenes) {
    if (scene.motion_raw) {
      scene.still_motions = parseMotionLine(scene.motion_raw, stillCount);
      delete scene.motion_raw;
    }
  }

  return { title, target_duration_sec: targetDurationSec, scenes };
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
  if (project.status !== 'brief') return json({ error: `Project must be in 'brief' status (current: ${project.status})` }, 409);

  // Parse
  const { title, target_duration_sec, scenes } = parseShotlistText(shotlistText);

  const generatedStills: unknown[] = [];
  const editorRows: unknown[] = [];

  for (const scene of scenes) {
    const startSec = tcToSec(scene.from_tc);
    const endSec = tcToSec(scene.to_tc);

    if (scene.kind === 'editor_build' || scene.stills.length === 0) {
      // Text card / editor build — one row, image_source='editor', status='passed'
      editorRows.push({
        project_id: projectId,
        scene_n: scene.scene_n,
        cut: 'A',
        act: scene.act,
        motion: 'hold',
        start_sec: startSec,
        end_sec: endSec,
        image_source: 'editor',
        reference_keys: [],
        prompt: null,
        status: 'passed',
      });
    } else {
      for (const still of scene.stills) {
        const motionEntry = scene.still_motions.find((m) => m.cut === still.cut) ?? scene.still_motions[0];
        generatedStills.push({
          project_id: projectId,
          scene_n: scene.scene_n,
          cut: still.cut,
          act: scene.act,
          motion: motionEntry?.motion ?? 'push',
          start_sec: startSec,
          end_sec: endSec,
          image_source: 'google',
          reference_keys: still.reference_keys,
          prompt: still.prompt,
          status: 'pending',
          // v2 fields
          ...(still.negative_space ? { regrade: null } : {}), // negative_space stored in prompt text
        });
      }
    }
  }

  // Upsert content_stills
  const allStills = [...generatedStills, ...editorRows];
  let inserted = 0;
  let skipped = 0;
  for (const row of allStills) {
    const r = row as { project_id: number; scene_n: number; cut: string };
    const { data: existing } = await supabase
      .from('content_stills')
      .select('id')
      .eq('project_id', r.project_id)
      .eq('scene_n', r.scene_n)
      .eq('cut', r.cut)
      .maybeSingle();
    if (existing) { skipped++; continue; }
    const { error } = await supabase.from('content_stills').insert(row);
    if (error) return json({ error: `Insert S${r.scene_n}-${r.cut}: ${error.message}` }, 500);
    inserted++;
  }

  // Upsert content_clips (VO + kind per scene)
  for (const scene of scenes) {
    const clipKind = scene.kind === 'editor_build' ? 'editor_build' : 'still';
    const { data: existing } = await supabase
      .from('content_clips')
      .select('id')
      .eq('project_id', projectId)
      .eq('scene_n', scene.scene_n)
      .maybeSingle();

    const clipRow = {
      project_id: projectId,
      scene_n: scene.scene_n,
      kind: clipKind,
      vo_text: scene.vo_text,
      audio_cue: scene.audio_cue,
      duration_sec: scene.duration_sec,
      overlays: scene.overlays.length ? scene.overlays : null,
      // v2: colour grade stored in sfx jsonb for now (no dedicated column yet)
      sfx: scene.grade ? { grade: scene.grade } : null,
    };

    if (existing) {
      await supabase.from('content_clips').update(clipRow).eq('id', (existing as { id: number }).id);
    } else {
      await supabase.from('content_clips').insert(clipRow);
    }
  }

  // Update project: set target_duration_sec + advance status to storyboard
  const projectUpdate: Record<string, unknown> = { status: 'storyboard' };
  if (target_duration_sec) projectUpdate.target_duration_sec = target_duration_sec;
  if (title) projectUpdate.ai_caption = { title };

  await supabase.from('content_items').update(projectUpdate).eq('id', projectId);

  return json({
    ok: true,
    title,
    target_duration_sec,
    scenes_total: scenes.length,
    stills_inserted: inserted,
    stills_skipped: skipped,
    clips_upserted: scenes.length,
  });
});
