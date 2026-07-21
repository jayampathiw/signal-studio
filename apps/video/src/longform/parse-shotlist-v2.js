import { readFileSync } from 'fs';

const ACT_FROM_HEADER = {
  'COLD OPEN': 0,
  'ACT 1': 1, 'ACT 2': 2, 'ACT 3': 3, 'ACT 4': 4, 'ACT 5': 5,
  'OUTRO': 6,
};

export function tcToSec(tc) {
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
  if (s.includes('static') || s.includes('no zoom') || s.includes('no-zoom')) return 'static';
  if (s.includes('smash')) return 'smash';
  if (s.includes('parallax') || s.includes('2.5d')) return 'parallax';
  if (s.includes('micro') || s.includes('1.06')) return 'micro_push';
  if (s.includes('pull')) return 'pull';
  if (s.includes('pan')) return s.includes('rl') || s.includes('right') ? 'pan_rl' : 'pan_lr';
  if (s.includes('hold')) return 'hold';
  if (s.includes('push')) return 'push';
  return 'push';
}

// Shared tail-parsing for the two-tier "TIER N at H:MM: **TEXT** — <description>. <marker>" format.
// Extracts duration via a trailing marker regex, then (tier 1 only) an "amber "WORD"" clause,
// leaving whatever free text remains as the placement zone description.
function parseTierTail(raw, durationRe) {
  const atM = raw.match(/at\s+(\d+:\d+):/i);
  const textM = raw.match(/\*\*(.+?)\*\*/);
  // Only look for the "— <placement>" separator AFTER the closing **, so an
  // em-dash inside the card text itself (e.g. "**ARGENTINA vs EGYPT — ROUND OF 16**")
  // isn't mistaken for the separator.
  const afterText = textM ? raw.slice(textM.index + textM[0].length) : raw;
  const tailM = afterText.match(/—\s*(.+)$/);

  let zone = null;
  let amber_word = null;
  let duration_sec = null;

  if (tailM) {
    let tail = tailM[1].trim();

    const durM = tail.match(durationRe);
    if (durM) {
      duration_sec = Number(durM[1]);
      tail = tail.slice(0, durM.index).trim();
    }

    const amberM = tail.match(/amber\s+(?:on\s+)?"([^"]+)"/i);
    if (amberM) {
      amber_word = amberM[1];
      tail = (tail.slice(0, amberM.index) + tail.slice(amberM.index + amberM[0].length)).trim();
    }

    zone = tail.replace(/^[,.\s]+|[,.\s]+$/g, '') || null;
  }

  return {
    text: textM ? textM[1] : raw,
    amber_word,
    zone,
    duration_sec,
    at_sec: atM ? tcToSec(atM[1]) : null,
  };
}

// New Tier 1 format: "TIER 1 at 0:32: **CARD TEXT** — amber "WORD", <placement>. 4s."
// `format: 'tiered'` is the discriminator motion.js uses to route into the new
// hero-card/caption-accent renderer — legacy v1/v2 overlays never set this field,
// so existing project-29 data keeps rendering through the untouched legacy path.
function parseTier1Line(raw) {
  const parsed = parseTierTail(raw, /(\d+(?:\.\d+)?)s\.?\s*$/);
  return { format: 'tiered', tier: 1, size: 'large', ...parsed };
}

// New Tier 2 format: "TIER 2 at 0:44: **WORD(S)** — <placement>. holds ~1.4s."
function parseTier2Line(raw) {
  const parsed = parseTierTail(raw, /holds?\s*~?(\d+(?:\.\d+)?)s\.?\s*$/i);
  return { format: 'tiered', tier: 2, size: 'small', ...parsed };
}

function parseOverlayLine(line) {
  // 🔤 word-sync accent (Tier 2) — always the new format, no legacy variant exists.
  if (line.startsWith('🔤')) {
    const raw = line.replace(/^🔤\s*/, '').trim();
    return parseTier2Line(raw);
  }

  // v2 format: "📝 CARD TEXT — Bebas Neue, amber "WORD", white rest, large, right third. 3s. Drops at 2:07"
  // v1 format: "📝 Editor overlay at 2:07: "16 years" (small, cream)"
  // new format: "📝 TIER 1 at 0:32: **CARD TEXT** — amber "WORD", <placement>. 4s."
  // Returns { tier, text, amber_word, size, zone, duration_sec, at_sec }
  const raw = line.replace(/^📝\s*/, '').trim();

  if (/^TIER\s*1\b/i.test(raw)) {
    return parseTier1Line(raw);
  }

  // Detect v2 format by "Bebas Neue" or "— Bebas" separator
  const v2sep = raw.indexOf(' — Bebas');
  if (v2sep !== -1) {
    const cardText = raw.slice(0, v2sep).trim();
    const meta = raw.slice(v2sep + 2);

    // Amber word(s): amber "WORD" or amber on "WORD PHRASE"
    const amberM = meta.match(/amber(?:\s+on)?\s+"([^"]+)"/i);
    // Duration: Ns
    const durM = meta.match(/(\d+)s[\s.]/);
    // Drop timecode: at M:SS
    const atM = meta.match(/at\s+(\d+:\d+)/i);
    // Zone: right third / left third / bottom third / centered / over ... / editor
    const zoneM = meta.match(/(right third|left third|bottom third|centered|over [^,\.]+|editor [^,\.]+)/i);
    // Size
    const sizeM = meta.match(/\b(large|small)\b/i);

    return {
      tier:         1,
      text:         cardText,
      amber_word:   amberM ? amberM[1] : null,
      size:         sizeM ? sizeM[1].toLowerCase() : 'large',
      zone:         zoneM ? zoneM[1].toLowerCase().trim() : null,
      duration_sec: durM ? Number(durM[1]) : null,
      at_sec:       atM ? tcToSec(atM[1]) : null,
    };
  }

  // v1 fallback
  const timeMatch = line.match(/at\s+(\d+:\d+)/);
  const textMatch = line.match(/"([^"]+)"/);
  return {
    tier:         1,
    text:         textMatch ? textMatch[1] : raw,
    amber_word:   null,
    size:         'small',
    zone:         null,
    duration_sec: null,
    at_sec:       timeMatch ? tcToSec(timeMatch[1]) : null,
  };
}

export function parseShotlistV2(filePath) {
  const text = readFileSync(filePath, 'utf-8');
  return parseShotlistText(text);
}

export function parseShotlistText(text) {
  const lines = text.split('\n');

  const scenes = [];
  let currentScene = null;
  let currentAct = null;
  let stillCount = 0;
  let targetDurationSec = null;
  let title = null;

  const flush = () => {
    if (currentScene) scenes.push(currentScene);
    currentScene = null;
    stillCount = 0;
  };

  for (const line of lines) {
    // Header metadata
    if (!title) {
      const titleM = line.match(/^\*\*TITLE:\*\*\s*(.*)/);
      if (titleM) { title = titleM[1].trim(); continue; }
    }
    if (targetDurationSec === null) {
      const durM = line.match(/\*\*TARGET_DURATION_SEC:\*\*\s*(\d+)/);
      if (durM) { targetDurationSec = Number(durM[1]); continue; }
    }

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

    // Still lines: 🖼️ STILL A: <prompt> or 🖼️ STILLS: <reuse note>
    if (line.startsWith('🖼️')) {
      stillCount++;
      const cutM = line.match(/🖼️\s+STILL\s+([A-D]):\s*(.*)/);
      if (cutM) {
        const prompt = cutM[2].trim();
        // [TOKEN] bracket refs
        const bracketRefs = [...prompt.matchAll(/\[([A-Z][A-Z0-9-]+)\]/g)].map((m) => m[1]);
        // @tag refs (TurboFlow Image Library)
        const atRefs = [...prompt.matchAll(/@([a-z][a-z0-9]+)\b/g)].map((m) => m[1]);
        const refKeys = [...new Set([...bracketRefs, ...atRefs])];
        // Negative space zone: "Right third negative space", "Left third negative space", "Bottom third negative space"
        const zoneM = prompt.match(/(right|left|bottom) third negative space/i);
        const negative_space = zoneM ? `${zoneM[1].toLowerCase()}_third` : null;
        if (!currentScene.stills) currentScene.stills = [];
        currentScene.stills.push({ cut: cutM[1], prompt, reference_keys: refKeys, negative_space });
      }
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

    // Text overlays — 📝 Tier 1 hero cards, 🔤 Tier 2 word-sync accents
    if (line.startsWith('📝') || line.startsWith('🔤')) {
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

  return { title, target_duration_sec: targetDurationSec, scenes };
}

// CLI
if (process.argv[1].endsWith('parse-shotlist-v2.js')) {
  const path = process.argv[2];
  if (!path) { console.error('Usage: node parse-shotlist-v2.js <shotlist-v2.md>'); process.exit(1); }
  const { title, target_duration_sec, scenes } = parseShotlistV2(path);
  console.log(`Title: ${title}`);
  console.log(`Duration: ${target_duration_sec}s`);
  console.log(`Total scenes: ${scenes.length} (expect ~51)`);
  const s12 = scenes.find((s) => s.scene_n === 12);
  if (s12) console.log('S12 overlay:', JSON.stringify(s12.overlays));
  const s7 = scenes.find((s) => s.scene_n === 7);
  if (s7) console.log('S7 stills:', JSON.stringify(s7.stills?.map(s => s.cut)));
}
