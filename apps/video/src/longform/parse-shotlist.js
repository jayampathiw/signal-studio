// Deterministic parser for the house shot-list format.
// The format is stable and emoji-tagged, so we parse it directly (no LLM) —
// scene identification is mostly parsing (docs/long-form-pipeline-plan.md §4).
// The LLM is reserved for the reference-bible clustering (plan-references.js).
//
// Recognised structure:
//   TITLE: <title>
//   TARGET_DURATION_SEC: <int>            (optional)
//   GLOBAL ART DIRECTION ...\n<paragraph>  (applied to every clip prompt)
//   SCENE <n> — <timecode> (<Xs>) [· 📝 ...inline text card]
//     🎬 <visual prompt>
//     🎙️ "<vo>"
//     🔊 <audio cue>
//     📝 <on-screen text>
//
// A scene with no 🎬 line (or an inline "No clip needed") is a text_card.

const RE_SCENE = /^SCENE\s+(\d+)\s*[—–-]\s*(.+?)\((\d+)\s*s\)\s*(.*)$/i;
const RE_TITLE = /^TITLE:\s*(.+)$/i;
const RE_TARGET = /^TARGET_DURATION_SEC:\s*(\d+)/i;

function stripTag(line, tag) {
  return line.slice(line.indexOf(tag) + tag.length).trim();
}

function dequote(s) {
  return s ? s.replace(/^["“”]+|["“”]+$/g, '').trim() : s;
}

export function parseShotList(text) {
  const lines = text.split(/\r?\n/);

  let title = null;
  let targetDurationSec = null;
  let globalArtDirection = '';

  // Global art direction: the paragraph after the "GLOBAL ART DIRECTION" heading.
  const gadIdx = lines.findIndex((l) => /GLOBAL ART DIRECTION/i.test(l));
  if (gadIdx !== -1) {
    for (let i = gadIdx + 1; i < lines.length; i++) {
      const t = lines[i].trim();
      if (!t) {
        if (globalArtDirection) break;
        continue;
      }
      if (/^Per-scene format/i.test(t) || RE_SCENE.test(t) || /^(COLD OPEN|ACT )/i.test(t)) break;
      globalArtDirection += (globalArtDirection ? ' ' : '') + t;
    }
  }

  const scenes = [];
  let cur = null;
  const push = () => {
    if (cur) {
      scenes.push(cur);
      cur = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (title === null) {
      const m = line.match(RE_TITLE);
      if (m) {
        title = m[1].trim();
        continue;
      }
    }
    if (targetDurationSec === null) {
      const m = line.match(RE_TARGET);
      if (m) {
        targetDurationSec = Number(m[1]);
        continue;
      }
    }

    const sm = line.match(RE_SCENE);
    if (sm) {
      push();
      const [, n, , dur, trailing] = sm;
      cur = {
        scene_n: Number(n),
        kind: 'clip',
        visual_prompt: null,
        vo_text: null,
        audio_cue: null,
        text_overlay: null,
        duration_sec: Number(dur),
      };
      // Inline content on the SCENE line (e.g. "· 📝 TITLE CARD: SILENCED. No clip needed.")
      if (trailing) {
        const after = trailing.replace(/^·\s*/, '').trim();
        if (after.includes('📝')) {
          cur.text_overlay = stripTag(after, '📝');
          cur.kind = 'text_card';
        }
        if (/no clip needed/i.test(after)) cur.kind = 'text_card';
      }
      continue;
    }

    if (!cur) continue;
    if (line.includes('🎬')) {
      cur.visual_prompt = stripTag(line, '🎬');
    } else if (line.includes('🎙️')) {
      cur.vo_text = dequote(stripTag(line, '🎙️'));
    } else if (line.includes('🔊')) {
      cur.audio_cue = stripTag(line, '🔊');
    } else if (line.includes('📝')) {
      cur.text_overlay = stripTag(line, '📝');
    }
  }
  push();

  // Classify: a scene with no visual prompt is a text card.
  for (const s of scenes) {
    if (!s.visual_prompt) s.kind = 'text_card';
  }

  return { title, targetDurationSec, globalArtDirection, scenes };
}

export default { parseShotList };
