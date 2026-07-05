import { readFileSync } from 'fs';

const ACT_FROM_HEADER = {
  'COLD OPEN': 0,
  'ACT 1': 1, 'ACT 2': 2, 'ACT 3': 3, 'ACT 4': 4, 'ACT 5': 5,
  'OUTRO': 6,
};

function tcToSec(tc) {
  const [m, s] = tc.split(':').map(Number);
  return m * 60 + s;
}

function parseMotionLine(motionLine, cutCount) {
  // Returns an array of per-cut motion strings, one per cut.
  // 🎞️ A: PUSH (3:17–3:23). Cut to B on "whipped in" (3:23–3:30), micro-PUSH.
  // 🎞️ PUSH 1.00 → 1.10 over 12s toward the floodlight.
  const motions = [];
  const line = motionLine.replace(/^🎞️\s*/, '').trim();

  // Try to detect per-cut references "A: <motion> ... B: <motion>"
  const cutPattern = /\b([A-D]):\s*(SMASH|PUSH|PULL|PARALLAX|micro.?PUSH|Slow lateral pan|Hold|pan)\b/gi;
  const cutMatches = [...line.matchAll(cutPattern)];

  if (cutMatches.length >= 2) {
    for (const m of cutMatches) {
      motions.push({ cut: m[1].toUpperCase(), motion: normalizeMotion(m[2]) });
    }
    return motions;
  }

  // Single motion for the whole scene (or default for all cuts)
  const primary = normalizeMotion(line);
  for (let i = 0; i < (cutCount || 1); i++) {
    motions.push({ cut: String.fromCharCode(65 + i), motion: primary });
  }
  return motions;
}

function normalizeMotion(raw) {
  const s = raw.toLowerCase();
  if (s.includes('smash')) return 'smash';
  if (s.includes('parallax') || s.includes('2.5d')) return 'parallax';
  if (s.includes('micro') || s.includes('1.06')) return 'micro_push';
  if (s.includes('pull')) return 'pull';
  if (s.includes('pan')) return s.includes('rl') || s.includes('right') ? 'pan_rl' : 'pan_lr';
  if (s.includes('hold')) return 'hold';
  if (s.includes('push')) return 'push';
  return 'push';
}

function parseOverlayLine(line) {
  // "📝 Editor overlay at 2:07: "16 years" (small, cream)"
  // Returns { at_sec, text, style }
  const timeMatch = line.match(/at\s+(\d+:\d+)/);
  const textMatch = line.match(/"([^"]+)"/);
  const styleMatch = line.match(/\(([^)]+)\)/);
  return {
    at_sec: timeMatch ? tcToSec(timeMatch[1]) : null,
    text: textMatch ? textMatch[1] : line.replace(/^📝\s*/, '').trim(),
    style: styleMatch ? styleMatch[1].toLowerCase().replace(/[\s,]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') : 'small_cream',
  };
}

export function parseShotlistV2(filePath) {
  const text = readFileSync(filePath, 'utf-8');
  const lines = text.split('\n');

  const scenes = [];
  let currentScene = null;
  let currentAct = null;
  let stillCount = 0;

  const flush = () => {
    if (currentScene) scenes.push(currentScene);
    currentScene = null;
    stillCount = 0;
  };

  for (const line of lines) {
    // Act section headers: ## COLD OPEN, ## ACT 1, etc.
    const actM = line.match(/^##\s+(COLD OPEN|ACT \d+|OUTRO)/);
    if (actM) {
      const key = actM[1].replace(/\s*—.*$/, '').trim();
      currentAct = ACT_FROM_HEADER[key] ?? null;
      continue;
    }

    // Scene header: **SCENE N — H:MM–H:MM (Xs)**
    const sceneM = line.match(/\*\*SCENE\s+(\d+)\s+[—-]\s+(\d+:\d+)[–-](\d+:\d+)\s+\((\d+)s\)\*\*/);
    if (sceneM) {
      flush();
      const [, n, fromTc, toTc, durStr] = sceneM;
      currentScene = {
        scene_n: Number(n),
        act: currentAct,
        from_tc: fromTc,
        to_tc: toTc,
        duration_sec: Number(durStr),
        vo_text: null,
        audio_cue: null,
        overlays: [],
        still_motions: [],
        keep_video: line.includes('KEEP-VIDEO'),
        kind: line.includes('EDITOR GRAPHIC') || line.includes('EDITOR BUILD') ? 'editor_build' : 'still',
      };
      stillCount = 0;
      continue;
    }

    if (!currentScene) continue;

    // Still lines: 🖼️ STILL A: ...
    if (line.startsWith('🖼️')) {
      stillCount++;
      continue;
    }

    // Motion line
    if (line.startsWith('🎞️')) {
      currentScene.motion_raw = line.replace(/^🎞️\s*/, '').trim();
      continue;
    }

    // VO
    if (line.startsWith('🎙️')) {
      const vo = line.replace(/^🎙️\s*/, '').trim().replace(/^"/, '').replace(/"$/, '');
      currentScene.vo_text = vo;
      continue;
    }

    // Audio cue
    if (line.startsWith('🔊')) {
      currentScene.audio_cue = line.replace(/^🔊\s*/, '').trim();
      continue;
    }

    // Text overlays
    if (line.startsWith('📝')) {
      const ov = parseOverlayLine(line);
      currentScene.overlays.push(ov);
      continue;
    }
  }
  flush();

  // Resolve per-cut motions
  for (const scene of scenes) {
    if (scene.motion_raw) {
      scene.still_motions = parseMotionLine(scene.motion_raw, stillCount);
      delete scene.motion_raw;
    }
  }

  return scenes;
}

// CLI
if (process.argv[1].endsWith('parse-shotlist-v2.js')) {
  const path = process.argv[2];
  if (!path) { console.error('Usage: node parse-shotlist-v2.js <shotlist-v2.md>'); process.exit(1); }
  const scenes = parseShotlistV2(path);
  console.log(`Total scenes: ${scenes.length} (expect ~51)`);
  // Spot checks
  const s12 = scenes.find((s) => s.scene_n === 12);
  if (s12) console.log('S12 overlay:', JSON.stringify(s12.overlays));
  const s7 = scenes.find((s) => s.scene_n === 7);
  if (s7) console.log('S7 motions:', JSON.stringify(s7.still_motions));
}
