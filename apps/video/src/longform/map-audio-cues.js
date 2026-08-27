// Maps 🔊 raw audio cue text to SFX kit keys.
// Add new rules here when the kit manifest grows.

const RULES = [
  { pattern: /heartbeat|heart beat/i, key: 'heartbeat' },
  { pattern: /whistle/i, key: 'ref_whistle' },
  { pattern: /drum hit|drum strike|bass drum/i, key: 'drum_hit' },
  { pattern: /musical hit|sharp hit/i, key: 'musical_hit' },
  // Glove-smack saves have no dedicated kit asset — ball_thud (a physical
  // impact/thud one-shot) is the closest existing sound, reused here rather
  // than sourcing a new asset (Pixabay's public API has no audio endpoint).
  { pattern: /glove.?smack/i, key: 'ball_thud' },
  { pattern: /crowd roar|crowd erupts/i, key: 'crowd_roar' },
  // Sustained crowd energy/swell/inhale phrasing — no punctual one-shot,
  // maps to the longer energetic ambience texture instead of a hit.
  { pattern: /crowd (swell|energy|noise rising)|stadium energy/i, key: 'stadium_crowd_energy' },
  { pattern: /crowd inhale/i, key: 'crowd_quiet' },
  // Crowd groan/jeer (a negative reaction) has no matching kit asset either
  // tonally (crowd_roar/crowd_cheer are both positive) — treated as a noop;
  // the underlying music bed carries the beat instead of a mismatched SFX.
  { pattern: /crowd groan|crowd jeer/i, noop: true },
  // "let it ring out" / natural decay of whatever's already playing — not a
  // new trigger. Must come before the applause/cheer/clap rules below, or a
  // ring-out line re-fires a fresh one-shot on top of the sound resolving.
  { pattern: /ring out|ringing out/i, noop: true },
  // "none" / "let the card land" / "let the swell resolve" — explicit no-new-SFX
  // directives (the scene relies on the music bed alone); noop, not unmatched.
  { pattern: /^none$|let (the )?(card|swell) (land|resolve)/i, noop: true },
  { pattern: /applause|ovation/i, key: 'crowd_applause' },
  { pattern: /clap|clapping/i, key: 'crowd_clap' },
  { pattern: /crowd cheer|cheering(?! roar)/i, key: 'crowd_cheer' },
  { pattern: /celebration.*cut|cut.*celebration/i, key: 'celebration_cut' },
  { pattern: /hum.*cut.*silence|silence.*hum|hum cuts/i, key: 'hum_cut_silence' },
  { pattern: /stadium hum|rising hum|hum/i, key: 'stadium_hum' },
  { pattern: /silence.*hold|hold.*silence|two.?second silence|2.?second silence/i, key: null, hold_sec: 2 },
  { pattern: /silence/i, key: null },
];

export function mapAudioCue(rawCue) {
  if (!rawCue) return { sfx: [], unmatched: [] };

  const sfx = [];
  const unmatched = [];

  for (const rule of RULES) {
    if (rule.pattern.test(rawCue)) {
      if (rule.noop) {
        // Matched, but deliberately produces nothing — e.g. "let it ring
        // out" describes the tail of an already-playing sound, not a new
        // one-shot to trigger.
      } else if (rule.key === null) {
        sfx.push({ key: 'silence', hold_sec: rule.hold_sec ?? null });
      } else {
        sfx.push({ key: rule.key });
      }
      return { sfx, unmatched };
    }
  }

  unmatched.push(rawCue);
  return { sfx: [], unmatched };
}

export function mapAllCues(scenes) {
  const allUnmatched = [];
  for (const scene of scenes) {
    if (!scene.audio_cue) continue;
    const { sfx, unmatched } = mapAudioCue(scene.audio_cue);
    scene.sfx = sfx;
    allUnmatched.push(...unmatched.map((u) => ({ scene_n: scene.scene_n, cue: u })));
  }
  return allUnmatched;
}

// CLI
if (process.argv[1].endsWith('map-audio-cues.js')) {
  const tests = [
    { scene_n: 37, audio_cue: 'Heartbeat rhythm builds under the VO' },
    { scene_n: 38, audio_cue: 'Hold for 2-second silence after the miss' },
    { scene_n: 7, audio_cue: 'A low, heavy drum hit on the cut.' },
    { scene_n: 99, audio_cue: 'Some unknown FX description here' },
  ];
  const unmatched = mapAllCues(tests);
  for (const t of tests) {
    console.log(`S${t.scene_n}:`, JSON.stringify(t.sfx));
  }
  if (unmatched.length) console.log('Unmatched:', unmatched);
  else console.log('All cues matched.');
}
