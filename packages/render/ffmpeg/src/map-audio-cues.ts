// P3.1 — moved from apps/video/src/longform/map-audio-cues.js, retyped
// (behavior-preserving mechanical port). Maps 🔊 raw audio-cue text to SFX
// kit keys. Add new rules here when the kit manifest grows.

export type SfxEvent = { key: string; hold_sec?: number | null };

const RULES: Array<{ pattern: RegExp; key?: string | null; hold_sec?: number; noop?: boolean }> = [
  { pattern: /heartbeat|heart beat/i, key: 'heartbeat' },
  { pattern: /whistle/i, key: 'ref_whistle' },
  { pattern: /drum hit|drum strike|bass drum/i, key: 'drum_hit' },
  { pattern: /musical hit|sharp hit/i, key: 'musical_hit' },
  // Glove-smack saves have no dedicated kit asset — ball_thud (a physical
  // impact/thud one-shot) is the closest existing sound.
  { pattern: /glove.?smack/i, key: 'ball_thud' },
  { pattern: /crowd roar|crowd erupts/i, key: 'crowd_roar' },
  { pattern: /crowd (swell|energy|noise rising)|stadium energy/i, key: 'stadium_crowd_energy' },
  { pattern: /crowd inhale/i, key: 'crowd_quiet' },
  // Crowd groan/jeer has no matching kit asset — the underlying music bed
  // carries the beat instead of a mismatched SFX.
  { pattern: /crowd groan|crowd jeer/i, noop: true },
  // "let it ring out" — not a new trigger. Must come before applause/
  // cheer/clap rules below, or a ring-out line re-fires a fresh one-shot on
  // top of the sound resolving.
  { pattern: /ring out|ringing out/i, noop: true },
  { pattern: /^none$|let (the )?(card|swell) (land|resolve)/i, noop: true },
  { pattern: /applause|ovation/i, key: 'crowd_applause' },
  { pattern: /clap|clapping/i, key: 'crowd_clap' },
  { pattern: /crowd cheer|cheering(?! roar)/i, key: 'crowd_cheer' },
  { pattern: /celebration.*cut|cut.*celebration/i, key: 'celebration_cut' },
  { pattern: /hum.*cut.*silence|silence.*hum|hum cuts/i, key: 'hum_cut_silence' },
  { pattern: /stadium hum|rising hum|hum/i, key: 'stadium_hum' },
  {
    pattern: /silence.*hold|hold.*silence|two.?second silence|2.?second silence/i,
    key: null,
    hold_sec: 2,
  },
  { pattern: /silence/i, key: null },
];

export function mapAudioCue(rawCue?: string | null): { sfx: SfxEvent[]; unmatched: string[] } {
  if (!rawCue) return { sfx: [], unmatched: [] };

  const sfx: SfxEvent[] = [];
  const unmatched: string[] = [];

  for (const rule of RULES) {
    if (rule.pattern.test(rawCue)) {
      if (rule.noop) {
        // Matched, but deliberately produces nothing.
      } else if (rule.key === null) {
        sfx.push({ key: 'silence', hold_sec: rule.hold_sec ?? null });
      } else if (rule.key) {
        sfx.push({ key: rule.key });
      }
      return { sfx, unmatched };
    }
  }

  unmatched.push(rawCue);
  return { sfx: [], unmatched };
}

export function mapAllCues<
  T extends { scene_n: number; audio_cue?: string | null; sfx?: SfxEvent[] },
>(scenes: T[]): Array<{ scene_n: number; cue: string }> {
  const allUnmatched: Array<{ scene_n: number; cue: string }> = [];
  for (const scene of scenes) {
    if (!scene.audio_cue) continue;
    const { sfx, unmatched } = mapAudioCue(scene.audio_cue);
    scene.sfx = sfx;
    allUnmatched.push(...unmatched.map((u) => ({ scene_n: scene.scene_n, cue: u })));
  }
  return allUnmatched;
}
