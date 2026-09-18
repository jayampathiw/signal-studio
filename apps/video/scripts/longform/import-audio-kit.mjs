import { execSync } from 'child_process';
import { writeFileSync, existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseArgs } from 'util';

import { env } from '@signal-studio/config';
import { uploadToR2 } from '@signal-studio/media/storage';

const { values } = parseArgs({
  options: {
    check: { type: 'boolean', default: false },
    dir: { type: 'string' },
  },
  strict: false,
});

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../');
// audio-kit moved to the signal-studio-workspace repo (P0.4) — pass --dir or
// set AUDIO_KIT_DIR to a local checkout of
// projects/underdog-archive/audio-kit there. Falls back to the old in-repo
// path for anyone who hasn't migrated.
const KIT_DIR = resolve(
  values.dir ?? process.env.AUDIO_KIT_DIR ?? resolve(REPO_ROOT, 'content/audio-kit'),
);
const MANIFEST_PATH = resolve(KIT_DIR, 'manifest.json');

// Local files live in one subfolder per `kind` — beds/ for continuous music
// beds, sfx/ for one-shots + the stadium ambience loop. R2 key layout is
// unchanged (still flat `audio-kit/{file}.mp3`) — this only reorganizes the
// local download folder for readability.
const KIND_DIR = { bed: 'beds', sfx: 'sfx' };

// Canonical key list — must match what audio_plan and map-audio-cues.js reference
const CANONICAL = {
  // Music beds
  somber: { kind: 'bed', ext: 'mp3', desc: 'Somber/dramatic orchestral bed — Act 1 lineage' },
  tension: { kind: 'bed', ext: 'mp3', desc: 'Building tension bed — Acts 2-3 match' },
  drone: { kind: 'bed', ext: 'mp3', desc: 'Low drone/minimal bed — Act 4 shootout' },
  release: { kind: 'bed', ext: 'mp3', desc: 'Emotional release bed — Act 5 climax' },
  reflective: { kind: 'bed', ext: 'mp3', desc: 'Reflective/hopeful bed — Act 5 outro' },
  piano_sad_solo: {
    kind: 'bed',
    ext: 'mp3',
    desc: 'Solo piano, sad/somber — reversal/injustice beats (Silenced S2)',
  },
  tragic_loss: { kind: 'bed', ext: 'mp3', desc: 'Gutting, specific loss — heavier than somber' },
  epic_dramatic: {
    kind: 'bed',
    ext: 'mp3',
    desc: 'Big, bombastic dramatic orchestral — bigger than tension/release',
  },
  ethereal_mystery: {
    kind: 'bed',
    ext: 'mp3',
    desc: 'Ambient/mysterious atmosphere — distinct from drone/reflective',
  },
  // Ambience
  stadium_hum: { kind: 'sfx', ext: 'mp3', desc: 'Continuous low stadium crowd hum/ambience loop' },
  // SFX one-shots
  drum_hit: { kind: 'sfx', ext: 'mp3', desc: 'Single heavy low-freq drum hit (smash cuts)' },
  musical_hit: { kind: 'sfx', ext: 'mp3', desc: 'Sharp musical impact (goal moments)' },
  ref_whistle: { kind: 'sfx', ext: 'mp3', desc: 'Referee whistle blast' },
  crowd_roar: { kind: 'sfx', ext: 'mp3', desc: 'Crowd eruption roar (celebration)' },
  celebration_cut: { kind: 'sfx', ext: 'mp3', desc: 'Crowd roar cut to silence abruptly (S28)' },
  hum_cut_silence: { kind: 'sfx', ext: 'mp3', desc: 'Hum cuts to dead silence (S02 ending)' },
  heartbeat: { kind: 'sfx', ext: 'mp3', desc: 'Single heartbeat thud (S37 suspense walk)' },
  crowd_quiet: { kind: 'sfx', ext: 'mp3', desc: 'Hushed held-breath crowd murmur' },
  ball_thud: { kind: 'sfx', ext: 'mp3', desc: 'Ball hitting woodwork or turf thud' },
  crowd_clap: { kind: 'sfx', ext: 'mp3', desc: 'Short audience clapping burst (< 15s)' },
  crowd_applause: { kind: 'sfx', ext: 'mp3', desc: 'Sustained applause/ovation (< 30s)' },
  crowd_cheer: {
    kind: 'sfx',
    ext: 'mp3',
    desc: 'Sustained crowd cheer — lighter energy than crowd_roar',
  },
  stadium_crowd_energy: {
    kind: 'sfx',
    ext: 'mp3',
    desc: 'Energetic live stadium crowd texture, longer than stadium_hum',
  },
};

function ffprobe(filePath) {
  try {
    const out = execSync(
      `ffprobe -v error -show_entries format=duration,size -show_entries stream=sample_rate,channels -of json "${filePath}"`,
      { encoding: 'utf-8' },
    );
    const j = JSON.parse(out);
    return {
      duration: Number(j.format?.duration ?? 0),
      sample_rate: Number(j.streams?.[0]?.sample_rate ?? 0),
      channels: Number(j.streams?.[0]?.channels ?? 0),
    };
  } catch (e) {
    return { error: e.message };
  }
}

async function checkMode() {
  if (!existsSync(MANIFEST_PATH)) {
    console.error('No manifest.json found. Run without --check first.');
    process.exit(1);
  }
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
  const keys = Object.keys(manifest);
  console.log(`Checking ${keys.length} kit entries against R2…\n`);
  let ok = 0;
  for (const [key, entry] of Object.entries(manifest)) {
    try {
      const res = await fetch(entry.url, { method: 'HEAD' });
      if (res.ok) {
        console.log(`  ✓ ${key} (${entry.duration?.toFixed(1) ?? '?'}s)`);
        ok++;
      } else {
        console.error(`  ✗ ${key}: HTTP ${res.status} — ${entry.url}`);
      }
    } catch (e) {
      console.error(`  ✗ ${key}: ${e.message}`);
    }
  }
  console.log(`\n${ok}/${keys.length} OK`);
  if (ok < keys.length) process.exit(1);
}

async function importMode() {
  const manifest = existsSync(MANIFEST_PATH)
    ? JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'))
    : {};

  const missingFiles = [];
  const errors = [];

  for (const [key, spec] of Object.entries(CANONICAL)) {
    const fileName = `${key}.${spec.ext}`;
    const subDir = resolve(KIT_DIR, KIND_DIR[spec.kind]);
    const filePath = resolve(subDir, fileName);

    if (!existsSync(filePath)) {
      missingFiles.push({ key, fileName, desc: spec.desc, dir: KIND_DIR[spec.kind] });
      continue;
    }

    console.log(`Probing ${fileName}…`);
    const probe = ffprobe(filePath);
    if (probe.error) {
      errors.push(`${key}: ffprobe failed — ${probe.error}`);
      continue;
    }

    const r2Key = `audio-kit/${fileName}`;
    const url = await uploadToR2(filePath, { key: r2Key });

    manifest[key] = {
      url,
      kind: spec.kind,
      duration: probe.duration,
      sample_rate: probe.sample_rate,
      channels: probe.channels,
      desc: spec.desc,
    };
    console.log(`  → ${url} (${probe.duration.toFixed(1)}s)`);
  }

  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log(`\nManifest written: ${MANIFEST_PATH}`);
  console.log(`  Uploaded: ${Object.keys(manifest).length}`);

  if (missingFiles.length) {
    console.warn(`\n⚠  Missing files:`);
    for (const { fileName, desc, dir } of missingFiles) {
      console.warn(`  ${(dir + '/' + fileName).padEnd(28)} — ${desc}`);
    }
  }
  if (errors.length) {
    for (const e of errors) console.error(`  ERROR: ${e}`);
    process.exit(1);
  }
}

if (values.check) {
  await checkMode();
} else {
  await importMode();
}
