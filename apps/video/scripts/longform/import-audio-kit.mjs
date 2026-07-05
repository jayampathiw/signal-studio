import { parseArgs } from 'util';
import { readdirSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { uploadToR2 } from '@signal-studio/media/storage';
import { env } from '@signal-studio/config';

const { values } = parseArgs({
  options: { check: { type: 'boolean', default: false } },
  strict: false,
});

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../');
const KIT_DIR = resolve(REPO_ROOT, 'content/audio-kit');
const MANIFEST_PATH = resolve(KIT_DIR, 'manifest.json');

// Canonical key list — must match what audio_plan and map-audio-cues.js reference
const CANONICAL = {
  // Music beds
  somber:     { kind: 'bed', ext: 'mp3', desc: 'Somber/dramatic orchestral bed — Act 1 lineage' },
  tension:    { kind: 'bed', ext: 'mp3', desc: 'Building tension bed — Acts 2-3 match' },
  drone:      { kind: 'bed', ext: 'mp3', desc: 'Low drone/minimal bed — Act 4 shootout' },
  release:    { kind: 'bed', ext: 'mp3', desc: 'Emotional release bed — Act 5 climax' },
  reflective: { kind: 'bed', ext: 'mp3', desc: 'Reflective/hopeful bed — Act 5 outro' },
  // Ambience
  stadium_hum: { kind: 'sfx', ext: 'mp3', desc: 'Continuous low stadium crowd hum/ambience loop' },
  // SFX one-shots
  drum_hit:       { kind: 'sfx', ext: 'mp3', desc: 'Single heavy low-freq drum hit (smash cuts)' },
  musical_hit:    { kind: 'sfx', ext: 'mp3', desc: 'Sharp musical impact (goal moments)' },
  ref_whistle:    { kind: 'sfx', ext: 'mp3', desc: 'Referee whistle blast' },
  crowd_roar:     { kind: 'sfx', ext: 'mp3', desc: 'Crowd eruption roar (celebration)' },
  celebration_cut: { kind: 'sfx', ext: 'mp3', desc: 'Crowd roar cut to silence abruptly (S28)' },
  hum_cut_silence: { kind: 'sfx', ext: 'mp3', desc: 'Hum cuts to dead silence (S02 ending)' },
  heartbeat:      { kind: 'sfx', ext: 'mp3', desc: 'Single heartbeat thud (S37 suspense walk)' },
  crowd_quiet:    { kind: 'sfx', ext: 'mp3', desc: 'Hushed held-breath crowd murmur' },
  ball_thud:      { kind: 'sfx', ext: 'mp3', desc: 'Ball hitting woodwork or turf thud' },
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
  const files = existsSync(KIT_DIR) ? readdirSync(KIT_DIR).filter((f) => f.endsWith('.mp3') || f.endsWith('.wav')) : [];

  const manifest = existsSync(MANIFEST_PATH)
    ? JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'))
    : {};

  const missingFiles = [];
  const errors = [];

  for (const [key, spec] of Object.entries(CANONICAL)) {
    const fileName = `${key}.${spec.ext}`;
    const filePath = resolve(KIT_DIR, fileName);

    if (!files.includes(fileName)) {
      missingFiles.push({ key, fileName, desc: spec.desc });
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
    console.warn(`\n⚠  Missing files (download to ${KIT_DIR}):`);
    for (const { key, fileName, desc } of missingFiles) {
      console.warn(`  ${fileName.padEnd(24)} — ${desc}`);
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
