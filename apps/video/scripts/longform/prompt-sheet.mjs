import { parseArgs } from 'util';
import { readFileSync, writeFileSync } from 'fs';
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
const shotlist = readFileSync(resolve(projectRoot, 'temp/longform/silenced-shotlist.md'), 'utf8');
const artMatch = shotlist.match(/GLOBAL ART DIRECTION[^\n]*\n\n([^\n]+)/);
const ART_DIRECTION = artMatch?.[1] ?? '';

const outputPath = values.output ?? resolve(projectRoot, `temp/longform/${projectId}-promptsheet.md`);
const db = getServiceClient();

async function main() {
  const { data: clips, error: cErr } = await db
    .from('content_clips')
    .select('scene_n, visual_prompt, reference_keys')
    .eq('project_id', projectId)
    .eq('image_source', 'google')
    .eq('status', 'pending')
    .order('scene_n');
  if (cErr) throw new Error(cErr.message);
  if (!clips?.length) { console.error('No pending google-source rows found.'); return; }

  const { data: refs, error: rErr } = await db
    .from('content_references')
    .select('key, url')
    .eq('project_id', projectId);
  if (rErr) throw new Error(rErr.message);
  const refByKey = Object.fromEntries((refs ?? []).map((r) => [r.key, r.url]));

  const sections = clips.map((clip) => {
    const heading = `## S${clip.scene_n} — ${clip.visual_prompt.slice(0, 60).trimEnd()}`;
    const prompt = `**Prompt:**\n${ART_DIRECTION}\n\n${clip.visual_prompt}`;
    const filename = `**Output filename:** \`S${clip.scene_n}.png\``;

    const refKeys = clip.reference_keys ?? [];
    const refLines = refKeys
      .map((k) => refByKey[k] ? `- \`${k}\`: ${refByKey[k]}` : null)
      .filter(Boolean);
    const refBlock = refLines.length
      ? `\n**Reference images to attach** (download and attach in Gemini before generating):\n${refLines.join('\n')}`
      : '';

    return `${heading}\n\n${prompt}\n\n${filename}${refBlock}`;
  });

  const output = sections.join('\n\n---\n\n') + '\n\n---\n';
  writeFileSync(outputPath, output, 'utf8');
  console.error(`Wrote ${clips.length} scene(s) → ${outputPath}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
