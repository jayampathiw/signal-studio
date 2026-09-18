import { readFileSync } from 'fs';

const ACT_MAP = {
  'COLD OPEN': 0,
  'ACT 1': 1,
  'ACT 2': 2,
  'ACT 3': 3,
  'ACT 4': 4,
  'ACT 5': 5,
  OUTRO: 6,
};

function parseTimecode(tc) {
  // "5:53–5:57" → { from: '5:53', to: '5:57' }
  const m = tc.match(/(\d+:\d+)[–-](\d+:\d+)/);
  if (!m) return { from: tc, to: tc };
  return { from: m[1], to: m[2] };
}

function parseId(id) {
  id = id.trim();
  // S21-CARD → scene 21, cut 'A' (it's a generated still, text added in editor)
  const cardMatch = id.match(/^S(\d+)-CARD$/i);
  if (cardMatch) return { scene_n: Number(cardMatch[1]), cut: 'A', kind: 'still' };

  // S01-A → scene 1, cut 'A'
  const cutMatch = id.match(/^S(\d+)-([A-D])$/i);
  if (cutMatch)
    return { scene_n: Number(cutMatch[1]), cut: cutMatch[2].toUpperCase(), kind: 'still' };

  // S14 → editor build
  const bareMatch = id.match(/^S(\d+)$/i);
  if (bareMatch) return { scene_n: Number(bareMatch[1]), cut: null, kind: 'editor_build' };

  return null;
}

export function parsePromptsV2(filePath) {
  const text = readFileSync(filePath, 'utf-8');
  const lines = text.split('\n');

  const rows = [];
  let currentAct = null;

  for (const line of lines) {
    // Detect act section headers: ### COLD OPEN, ### ACT 1 — ..., ### OUTRO
    const actHeader = line.match(/^###\s+(COLD OPEN|ACT \d+|OUTRO)/);
    if (actHeader) {
      const key = actHeader[1].replace(/\s*—.*$/, '').trim();
      currentAct = ACT_MAP[key] ?? null;
      continue;
    }

    // Parse table rows (skip header/separator rows)
    if (!line.startsWith('|') || line.startsWith('|---|')) continue;
    const cells = line
      .split('|')
      .map((c) => c.trim())
      .filter((_, i, a) => i > 0 && i < a.length - 1);
    if (cells.length < 5) continue;
    const [idRaw, sceneLabel, timecodeRaw, notes, ...promptParts] = cells;
    const prompt = promptParts.join('|').trim();

    const parsed = parseId(idRaw);
    if (!parsed) continue;
    // Skip header rows
    if (idRaw === 'ID') continue;

    const timecode = parseTimecode(timecodeRaw);
    const isReuse =
      notes.toLowerCase().includes('asset reuse') || notes.toLowerCase().includes('reuse');
    const isEditorBuild = prompt === '—' || parsed.kind === 'editor_build';

    const row = {
      id: idRaw,
      scene_n: parsed.scene_n,
      cut: parsed.cut,
      act: currentAct,
      timecode,
      notes: notes || null,
      prompt: isEditorBuild ? null : prompt,
      is_reuse: isReuse && isEditorBuild,
      kind: parsed.kind,
    };

    // Detect reuse: prompt is '—' but ID has a cut letter
    if (prompt === '—' && parsed.cut) {
      row.is_reuse = true;
      row.kind = 'reuse';
    }

    rows.push(row);
  }

  return rows;
}

// CLI: node parse-prompts-v2.js <path>
if (process.argv[1].endsWith('parse-prompts-v2.js')) {
  const path = process.argv[2];
  if (!path) {
    console.error('Usage: node parse-prompts-v2.js <prompts-v2.md>');
    process.exit(1);
  }
  const rows = parsePromptsV2(path);
  const generated = rows.filter((r) => !r.is_reuse && r.kind === 'still');
  const reuse = rows.filter((r) => r.is_reuse || r.kind === 'reuse');
  const editor = rows.filter((r) => r.kind === 'editor_build');
  console.log(
    `Total rows: ${rows.length} | generated stills: ${generated.length} | reuse: ${reuse.length} | editor builds: ${editor.length}`,
  );
  // Spot-check
  const s34c = rows.find((r) => r.id === 'S34-C');
  if (s34c) console.log('S34-C timecode:', s34c.timecode, '(expect 6:01–6:05)');
}
