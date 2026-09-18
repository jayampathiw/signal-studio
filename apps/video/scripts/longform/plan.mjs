// Phase 2 — Planning step (docs/long-form-pipeline-plan.md §4).
// Shot list → structured DB rows: one content_items project, N content_references
// (the character/motif bible), and one content_clips row per scene.
//
// Usage:
//   node apps/video/scripts/longform/plan.mjs --file <shotlist.md> [--channel football/documentary/EN] [--dry]
//
// --dry prints the plan without writing to the DB.

import { readFileSync, writeFileSync } from 'fs';
import { parseArgs } from 'util';

import { getServiceClient } from '@signal-studio/database';

import { getChannel } from '../../src/config/channels.js';
import { parseShotList } from '../../src/longform/parse-shotlist.js';
import { buildReferenceBible } from '../../src/longform/plan-references.js';

const { values } = parseArgs({
  options: {
    file: { type: 'string' },
    channel: { type: 'string', default: 'football/documentary/EN' },
    bible: { type: 'string' }, // path to a cached reference bible JSON (skips the LLM call)
    dry: { type: 'boolean', default: false },
  },
  strict: false,
});

if (!values.file) {
  console.error('Error: --file <shotlist.md> is required');
  process.exit(2);
}

async function main() {
  const channelKey = values.channel;
  const channel = getChannel(channelKey); // throws on unknown key

  const text = readFileSync(values.file, 'utf8');
  const { title, targetDurationSec, globalArtDirection, scenes } = parseShotList(text);

  const clipCount = scenes.filter((s) => s.kind === 'clip').length;
  const cardCount = scenes.filter((s) => s.kind === 'text_card').length;
  console.error(
    `Parsed: "${title}" — ${scenes.length} scenes (${clipCount} clips, ${cardCount} text cards), target ${targetDurationSec}s`,
  );

  // The reference bible can be loaded from a cache (proxy is flaky; a good bible
  // shouldn't be regenerated). Otherwise generate it and cache to <file>.bible.json
  // so a later failure never discards the LLM work.
  let references, sceneRefs;
  if (values.bible) {
    ({ references, sceneRefs } = JSON.parse(readFileSync(values.bible, 'utf8')));
    console.error(`Reference bible (cached ${values.bible}): ${references.length} anchors`);
  } else {
    console.error('Building reference bible (LLM)…');
    ({ references, sceneRefs } = await buildReferenceBible({ scenes, globalArtDirection }));
    const cachePath = values.file.replace(/\.[^.]+$/, '') + '.bible.json';
    writeFileSync(cachePath, JSON.stringify({ references, sceneRefs }, null, 2));
    console.error(`Reference bible: ${references.length} anchors — cached to ${cachePath}`);
  }
  console.error(`  anchors: ${references.map((r) => r.key).join(', ')}`);

  // Validate sceneRefs point at real keys.
  const keySet = new Set(references.map((r) => r.key));
  for (const [sn, keys] of Object.entries(sceneRefs)) {
    for (const k of keys)
      if (!keySet.has(k))
        console.error(`  ⚠ scene ${sn} cites unknown reference "${k}" — dropping`);
  }

  if (values.dry) {
    console.log(
      JSON.stringify({ title, targetDurationSec, references, sceneRefs, scenes }, null, 2),
    );
    console.error('--dry: nothing written.');
    return;
  }

  const db = getServiceClient();

  // 1. Project row.
  const { data: project, error: pErr } = await db
    .from('content_items')
    .insert({
      channel_key: channelKey,
      niche: channel.niche,
      style: channel.style,
      language: channel.language?.toLowerCase() ?? 'en',
      source_type: 'ai_video',
      title,
      format: 'long_form',
      status: 'planning',
      target_duration_sec: targetDurationSec,
      target_platforms: Object.keys(channel.platforms ?? {}),
    })
    .select('id')
    .single();
  if (pErr) throw new Error(`Insert project failed: ${pErr.message}`);
  const projectId = project.id;
  console.error(`Created project content_items.id=${projectId}`);

  // 2. Reference rows.
  const refRows = references.map((r) => ({
    project_id: projectId,
    key: r.key,
    description: r.description ?? null,
    prompt: r.prompt,
    status: 'pending',
  }));
  const { error: rErr } = await db.from('content_references').insert(refRows);
  if (rErr) throw new Error(`Insert references failed: ${rErr.message}`);

  // 3. Clip rows (text cards inserted as 'passed' — assembled directly, no generation).
  const clipRows = scenes.map((s) => {
    const isCard = s.kind === 'text_card';
    const refs = (sceneRefs[String(s.scene_n)] ?? []).filter((k) => keySet.has(k));
    return {
      project_id: projectId,
      scene_n: s.scene_n,
      kind: s.kind,
      visual_prompt: s.visual_prompt,
      vo_text: s.vo_text,
      audio_cue: s.audio_cue,
      text_overlay: s.text_overlay,
      duration_sec: s.duration_sec,
      reference_keys: isCard ? [] : refs,
      status: isCard ? 'passed' : 'pending',
    };
  });
  const { error: cErr } = await db.from('content_clips').insert(clipRows);
  if (cErr) throw new Error(`Insert clips failed: ${cErr.message}`);

  console.error(`Wrote ${refRows.length} references + ${clipRows.length} clips.`);
  console.log(
    JSON.stringify({
      projectId,
      references: references.length,
      clips: clipRows.length,
      cards: cardCount,
    }),
  );
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
