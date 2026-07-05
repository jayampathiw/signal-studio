// Maps 🔊 raw audio cue text to SFX kit keys.
// Add new rules here when the kit manifest grows.

const RULES = [
  { pattern: /heartbeat|heart beat/i, key: 'heartbeat' },
  { pattern: /whistle/i, key: 'ref_whistle' },
  { pattern: /drum hit|drum strike|bass drum/i, key: 'drum_hit' },
  { pattern: /musical hit|sharp hit/i, key: 'musical_hit' },
  { pattern: /crowd roar|crowd erupts/i, key: 'crowd_roar' },
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
      if (rule.key === null) {
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
