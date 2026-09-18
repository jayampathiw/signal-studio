import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { env } from '@huggingface/transformers';
import { KokoroTTS } from 'kokoro-js';
import type { GenerateOptions } from 'kokoro-js';

// kokoro-js doesn't export its `VOICES` map publicly, only the `voice` field's
// type on GenerateOptions — reconstruct the runtime whitelist from Kokoro's
// own `voices` getter on an instance instead of hard-coding the voice list.
type VoiceId = NonNullable<GenerateOptions['voice']>;

import { Pack } from '../src/manifest.ts';

const execFileAsync = promisify(execFile);

// Cache the Kokoro model weights under ~/.cache/kokoro-js instead of inside
// node_modules (transformers.js's default) so re-installs don't re-download.
env.cacheDir = path.join(os.homedir(), '.cache', 'kokoro-js') + path.sep;

const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const LOUDNORM = 'loudnorm=I=-16:TP=-1.5:LRA=11';

function hashOf(text: string) {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

async function ffprobeDuration(file: string): Promise<number> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    file,
  ]);
  return parseFloat(stdout.trim());
}

async function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: npm run tts <pack-dir>');
    process.exit(1);
  }

  const packPath = path.join(dir, 'pack.json');
  const raw = JSON.parse(await readFile(packPath, 'utf8'));
  const parsed = Pack.parse(raw);

  const voDir = path.join(dir, 'vo');
  await mkdir(voDir, { recursive: true });

  console.log(`Loading ${MODEL_ID} (cache: ${env.cacheDir})...`);
  const tts = await KokoroTTS.from_pretrained(MODEL_ID, { dtype: 'q8', device: 'cpu' });

  if (!(parsed.audio.voice_id in tts.voices)) {
    console.error(
      `Unknown voice_id "${parsed.audio.voice_id}" — must be one of: ${Object.keys(tts.voices).join(', ')}`,
    );
    process.exit(1);
  }
  const voiceId = parsed.audio.voice_id as VoiceId;

  const warnings: string[] = [];

  for (let i = 0; i < parsed.shots.length; i++) {
    const shot = parsed.shots[i];
    const speed = parsed.audio.voice_speed;
    const hash = hashOf(`${shot.voiceover_text}::${voiceId}::${speed}`);
    const hashFile = path.join(voDir, `${shot.id}.hash`);
    const rawFile = path.join(voDir, `${shot.id}_vo.wav`);
    const normFile = path.join(voDir, `${shot.id}_vo_n.wav`);

    let cached = false;
    try {
      const prevHash = await readFile(hashFile, 'utf8');
      if (prevHash === hash) {
        await readFile(normFile);
        cached = true;
      }
    } catch {
      cached = false;
    }

    if (cached) {
      console.log(`  ${shot.id}: skipped (unchanged)`);
    } else {
      console.log(`  ${shot.id}: generating (voice=${voiceId}, speed=${speed})...`);
      const audio = await tts.generate(shot.voiceover_text, { voice: voiceId, speed });
      await audio.save(rawFile);
      await execFileAsync('ffmpeg', [
        '-y',
        '-i',
        rawFile,
        '-af',
        LOUDNORM,
        '-ar',
        '48000',
        normFile,
      ]);
      await writeFile(hashFile, hash);
    }

    const durationS = await ffprobeDuration(normFile);
    shot.voiceover_file = path.relative(dir, normFile);
    shot.voiceover_duration_s = durationS;

    // Merge back into the original raw object so unrelated top-level keys
    // (e.g. the pilot's `_placeholder`/`_note` scaffolding fields) survive —
    // zod's `parsed` object has already dropped anything not in the schema.
    raw.shots[i] = {
      ...raw.shots[i],
      voiceover_file: shot.voiceover_file,
      voiceover_duration_s: durationS,
    };

    if (shot.duration_s !== undefined) {
      const budget = shot.duration_s / speed - shot.overlay_in_s - 0.3;
      if (durationS > budget) {
        warnings.push(
          `${shot.id}: VO ${durationS.toFixed(2)}s exceeds budget ${budget.toFixed(2)}s (clip ${shot.duration_s}s / speed ${speed} − overlay_in ${shot.overlay_in_s}s − 0.3s)`,
        );
      }
    } else {
      warnings.push(
        `${shot.id}: budget check skipped — clip not prepped yet (run \`npm run prep\` first)`,
      );
    }
  }

  await writeFile(packPath, JSON.stringify(raw, null, 2) + '\n');

  console.log(`\nWrote ${parsed.shots.length} VO file(s) into ${voDir}`);
  if (warnings.length) {
    console.log('\nWarnings:');
    for (const w of warnings) console.log(`  - ${w}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
});
