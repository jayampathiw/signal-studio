import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { env as transformersEnv } from '@huggingface/transformers';
import { KokoroTTS } from 'kokoro-js';

import type { TtsProvider, TtsResultT } from './contracts.ts';

const execFileAsync = promisify(execFile);

// Cache model weights under ~/.cache/kokoro-js instead of inside node_modules
// (transformers.js's default) so re-installs don't re-download — same as the
// pilot bridge's tts.ts (P0.8-04).
transformersEnv.cacheDir = path.join(os.homedir(), '.cache', 'kokoro-js') + path.sep;

const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';

let ttsInstance: KokoroTTS | null = null;
async function getTts(): Promise<KokoroTTS> {
  ttsInstance ??= await KokoroTTS.from_pretrained(MODEL_ID, { dtype: 'q8', device: 'cpu' });
  return ttsInstance;
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

/**
 * P2.4 — in-process kokoro-js implementation of TtsProvider (from P0.8-04's
 * pilot script, generalised behind the fixed contract). Unlike the pilot
 * script, the contract's `synthesise()` doesn't take an output path, so
 * output is written to a content-addressed path under `os.tmpdir()` and
 * reused on a repeat call with the same text/voice/speed — same caching
 * intent as the pilot, just keyed differently since there's no per-project
 * `vo/` directory to write into here.
 *
 * @param opts.loudnorm When true (default), applies the pilot's mastering
 * target (`I=-16 TP=-1.5 LRA=11`) via ffmpeg after synthesis.
 */
export function createKokoroJsProvider(opts?: {
  loudnorm?: boolean;
  outDir?: string;
}): TtsProvider {
  const loudnorm = opts?.loudnorm ?? true;
  const outDir = opts?.outDir ?? path.join(os.tmpdir(), 'signal-studio-tts-kokoro-js');

  return {
    async synthesise({ text, voice, speed }): Promise<TtsResultT> {
      await mkdir(outDir, { recursive: true });
      const hash = createHash('sha256')
        .update(`${text}::${voice}::${speed}::${loudnorm}`)
        .digest('hex')
        .slice(0, 16);
      const wavPath = path.join(outDir, `${hash}.wav`);

      const alreadyCached = await readFile(wavPath).then(
        () => true,
        () => false,
      );
      if (!alreadyCached) {
        const tts = await getTts();
        if (!(voice in tts.voices)) {
          throw new Error(
            `tts-kokoro-js: unknown voice "${voice}" — must be one of: ${Object.keys(tts.voices).join(', ')}`,
          );
        }
        const audio = await tts.generate(text, { voice: voice as keyof typeof tts.voices, speed });
        if (loudnorm) {
          const rawPath = `${wavPath}.raw.wav`;
          await audio.save(rawPath);
          await execFileAsync('ffmpeg', [
            '-y',
            '-i',
            rawPath,
            '-af',
            'loudnorm=I=-16:TP=-1.5:LRA=11',
            '-ar',
            '48000',
            wavPath,
          ]);
        } else {
          await audio.save(wavPath);
        }
      }

      const durationSec = await ffprobeDuration(wavPath);
      return { wavPath, durationSec };
    },
  };
}
