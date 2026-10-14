// P3.1 — moved from apps/video/src/longform/parse-shotlist-v2.js, retyped
// (behavior-preserving mechanical port; every regex/parsing rule below is
// unchanged from the original). Parses a shotlist-v2.md file's emoji-tagged
// markdown into structured scenes — this is `stills-kenburns`'s own input
// authoring format, so the parser lives inside this template package (not
// packages/render/ffmpeg, which only knows Timeline, and not packages/core,
// which is template-agnostic).

import { readFileSync } from 'node:fs';

const ACT_FROM_HEADER: Record<string, number> = {
  'COLD OPEN': 0,
  'ACT 1': 1,
  'ACT 2': 2,
  'ACT 3': 3,
  'ACT 4': 4,
  'ACT 5': 5,
  OUTRO: 6,
};

export function tcToSec(tc: string): number {
  const [m, s] = tc.split(':').map(Number);
  return m * 60 + s;
}

export type ParsedMotion = { cut: string; motion: string };
export type ParsedStill = {
  cut: string;
  prompt: string;
  reference_keys: string[];
  negative_space: string | null;
};
export type ParsedOverlay = {
  format?: 'tiered';
  tier: 1 | 2;
  size?: 'large' | 'small';
  text: string;
  amber_word: string | null;
  zone: string | null;
  duration_sec: number | null;
  at_sec: number | null;
};
export type ParsedScene = {
  scene_n: number;
  act: number | null;
  from_tc: string;
  to_tc: string;
  duration_sec: number;
  grade: string | null;
  vo_text: string | null;
  audio_cue: string | null;
  overlays: ParsedOverlay[];
  still_motions: ParsedMotion[];
  stills: ParsedStill[];
  keep_video: boolean;
  kind: 'editor_build' | 'still';
  motion_raw?: string;
};
export type ParsedShotlist = {
  title: string | null;
  target_duration_sec: number | null;
  scenes: ParsedScene[];
};

function parseMotionLine(motionLine: string, cutCount: number): ParsedMotion[] {
  const motions: ParsedMotion[] = [];
  const line = motionLine.replace(/^🎞️\s*/, '').trim();

  const cutPattern =
    /\b([A-D]):\s*(SMASH|PUSH|PULL|PARALLAX|micro.?PUSH|Slow lateral pan|Hold|pan)\b/gi;
  const cutMatches = [...line.matchAll(cutPattern)];

  if (cutMatches.length >= 2) {
    for (const m of cutMatches) {
      motions.push({ cut: m[1].toUpperCase(), motion: normalizeMotion(m[2]) });
    }
    return motions;
  }

  const primary = normalizeMotion(line);
  for (let i = 0; i < (cutCount || 1); i++) {
    motions.push({ cut: String.fromCharCode(65 + i), motion: primary });
  }
  return motions;
}

function normalizeMotion(raw: string): string {
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

function parseTierTail(
  raw: string,
  durationRe: RegExp,
): {
  text: string;
  amber_word: string | null;
  zone: string | null;
  duration_sec: number | null;
  at_sec: number | null;
} {
  const atM = raw.match(/at\s+(\d+:\d+):/i);
  const textM = raw.match(/\*\*(.+?)\*\*/);
  const afterText = textM ? raw.slice(textM.index! + textM[0].length) : raw;
  const tailM = afterText.match(/—\s*(.+)$/);

  let zone: string | null = null;
  let amber_word: string | null = null;
  let duration_sec: number | null = null;

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
      tail = (tail.slice(0, amberM.index) + tail.slice(amberM.index! + amberM[0].length)).trim();
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

function parseTier1Line(raw: string): ParsedOverlay {
  const parsed = parseTierTail(raw, /(\d+(?:\.\d+)?)s\.?\s*$/);
  return { format: 'tiered', tier: 1, size: 'large', ...parsed };
}

function parseTier2Line(raw: string): ParsedOverlay {
  const parsed = parseTierTail(raw, /holds?\s*~?(\d+(?:\.\d+)?)s\.?\s*$/i);
  return { format: 'tiered', tier: 2, size: 'small', ...parsed };
}

function parseOverlayLine(line: string): ParsedOverlay {
  if (line.startsWith('🔤')) {
    const raw = line.replace(/^🔤\s*/, '').trim();
    return parseTier2Line(raw);
  }

  const raw = line.replace(/^📝\s*/, '').trim();

  if (/^TIER\s*1\b/i.test(raw)) {
    return parseTier1Line(raw);
  }

  const v2sep = raw.indexOf(' — Bebas');
  if (v2sep !== -1) {
    const cardText = raw.slice(0, v2sep).trim();
    const meta = raw.slice(v2sep + 2);

    const amberM = meta.match(/amber(?:\s+on)?\s+"([^"]+)"/i);
    const durM = meta.match(/(\d+)s[\s.]/);
    const atM = meta.match(/at\s+(\d+:\d+)/i);
    const zoneM = meta.match(
      /(right third|left third|bottom third|centered|over [^,.]+|editor [^,.]+)/i,
    );
    const sizeM = meta.match(/\b(large|small)\b/i);

    return {
      tier: 1,
      text: cardText,
      amber_word: amberM ? amberM[1] : null,
      size: (sizeM ? sizeM[1].toLowerCase() : 'large') as 'large' | 'small',
      zone: zoneM ? zoneM[1].toLowerCase().trim() : null,
      duration_sec: durM ? Number(durM[1]) : null,
      at_sec: atM ? tcToSec(atM[1]) : null,
    };
  }

  const timeMatch = line.match(/at\s+(\d+:\d+)/);
  const textMatch = line.match(/"([^"]+)"/);
  return {
    tier: 1,
    text: textMatch ? textMatch[1] : raw,
    amber_word: null,
    size: 'small',
    zone: null,
    duration_sec: null,
    at_sec: timeMatch ? tcToSec(timeMatch[1]) : null,
  };
}

export function parseShotlistV2(filePath: string): ParsedShotlist {
  const text = readFileSync(filePath, 'utf-8');
  return parseShotlistText(text);
}

export function parseShotlistText(text: string): ParsedShotlist {
  const lines = text.split('\n');

  const scenes: ParsedScene[] = [];
  let currentScene: ParsedScene | null = null;
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
      if (titleM) {
        title = titleM[1].trim();
        continue;
      }
    }
    if (targetDurationSec === null) {
      const durM = line.match(/\*\*TARGET_DURATION_SEC:\*\*\s*(\d+)/);
      if (durM) {
        targetDurationSec = Number(durM[1]);
        continue;
      }
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
        kind:
          line.includes('EDITOR GRAPHIC') || line.includes('EDITOR BUILD')
            ? 'editor_build'
            : 'still',
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
        const bracketRefs = [...prompt.matchAll(/\[([A-Z][A-Z0-9-]+)\]/g)].map((m) => m[1]);
        const atRefs = [...prompt.matchAll(/@([a-z][a-z0-9]+)\b/g)].map((m) => m[1]);
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
      const vo = line
        .replace(/^🎙️\s*/, '')
        .trim()
        .replace(/^"/, '')
        .replace(/"$/, '');
      currentScene.vo_text = vo;
      continue;
    }

    if (line.startsWith('🔊')) {
      currentScene.audio_cue = line.replace(/^🔊\s*/, '').trim();
      continue;
    }

    if (line.startsWith('📝') || line.startsWith('🔤')) {
      const ov = parseOverlayLine(line);
      currentScene.overlays.push(ov);
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
