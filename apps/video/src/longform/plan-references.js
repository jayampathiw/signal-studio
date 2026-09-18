// LLM step: cluster the shot list's recurring visual anchors into a
// reference-image bible, and map each clip scene to the reference(s) it cites.
// This is the one genuinely reasoning-heavy part of planning — everything else
// is deterministic parsing. See docs/long-form-pipeline-plan.md §4.

import { chatText, extractJson } from '@signal-studio/ai';

const SYSTEM = `You are a video art director planning a long-form documentary built from many short AI-generated clips.

Recurring characters, locations and motifs MUST look identical every time they appear, or the film looks like disconnected pieces. The technique: generate ONE reference image per recurring anchor, then pass it as the visual reference to every clip that shows that anchor.

Your job, given the scene list + global art direction:
1. Identify the recurring visual ANCHORS — distinct characters (note: visually different people are DIFFERENT anchors even if same role), specific locations, and repeated motifs. One-off visuals that appear in a single scene do NOT need a reference.
2. For each anchor, write an image-generation PROMPT that bakes in the global art direction so the reference itself is on-style.
3. Map every clip scene to the reference key(s) it should use. A scene may cite 0, 1, or several.

Return ONLY JSON, no prose:
{
  "references": [
    { "key": "snake_case_slug", "description": "what it is (for humans)", "prompt": "full image-gen prompt incl. art direction" }
  ],
  "sceneRefs": { "<scene_n>": ["key", ...], ... }
}

Rules:
- keys are stable snake_case slugs (e.g. keeper_gill, map_south_america).
- Distinguish visually distinct characters even in the same role (e.g. a 1990s keeper vs a modern keeper vs an opposing veteran keeper are three references).
- Only include clip scenes in sceneRefs; omit scenes with no recurring anchor.
- Keep the reference set tight — merge near-duplicates.`;

/**
 * @param {{ scenes: Array<{scene_n:number, kind:string, visual_prompt:string}>, globalArtDirection: string }} input
 * @returns {Promise<{references: Array<{key:string,description:string,prompt:string}>, sceneRefs: Record<string,string[]>}>}
 */
export async function buildReferenceBible({ scenes, globalArtDirection }) {
  const clipScenes = scenes
    .filter((s) => s.kind === 'clip')
    .map((s) => ({ scene_n: s.scene_n, visual: s.visual_prompt }));

  const user = `GLOBAL ART DIRECTION:
${globalArtDirection}

SCENES (clip scenes only):
${JSON.stringify(clipScenes, null, 1)}`;

  // The reseller proxy's latency varies widely (60–120s+); this is a one-time
  // call, so use a generous timeout and retry once on an abort/network blip.
  let text;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      text = await chatText({
        system: SYSTEM,
        messages: [{ role: 'user', content: user }],
        maxTokens: 4096,
        timeoutMs: 240_000,
      });
      break;
    } catch (e) {
      if (attempt === 2) throw e;
      process.stderr.write(`Reference bible attempt ${attempt} failed (${e.message}); retrying…\n`);
    }
  }

  const json = extractJson(text);
  if (!json)
    throw new Error(`Reference bible: no JSON in model output:\n${String(text).slice(0, 400)}`);
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    throw new Error(`Reference bible: JSON parse failed (${e.message}):\n${json.slice(0, 400)}`);
  }

  if (!Array.isArray(parsed.references) || typeof parsed.sceneRefs !== 'object') {
    throw new Error('Reference bible: output missing references[] or sceneRefs{}');
  }
  return parsed;
}

export default { buildReferenceBible };
