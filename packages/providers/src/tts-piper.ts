import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import type { TtsProvider, TtsResultT } from './contracts.ts';

const execFileAsync = promisify(execFile);

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
 * P3.4 — Piper TTS, wrapping the existing `packages/media/tts_piper.py`
 * subprocess (used today by `tts.js`'s `es-MX` regional-accent path, when
 * Kokoro doesn't have the right accent). `TtsProvider.synthesise`'s `voice`
 * arg is treated as the Piper `.onnx` model path directly — Piper's own
 * "voice" concept *is* its model file, unlike Kokoro's named-voice-inside-
 * one-model scheme, so there's no separate voice/model split to design here.
 * Piper's `speed` isn't a runtime synthesis parameter (`PiperVoice.synthesize`
 * takes no rate argument in the version `tts_piper.py` calls) — **ignored,
 * flagged rather than silently accepted as if honored**; a caller wanting
 * speed control would need `length_scale` support added to `tts_piper.py`
 * itself, out of this provider's scope.
 */
export function createPiperProvider(opts?: { scriptPath?: string; outDir?: string }): TtsProvider {
  const scriptPath =
    opts?.scriptPath ?? path.resolve(import.meta.dirname, '../../media/tts_piper.py');
  const outDir = opts?.outDir ?? path.join(os.tmpdir(), 'signal-studio-tts-piper');

  return {
    async synthesise({ text, voice: modelPath, speed }): Promise<TtsResultT> {
      void speed; // see header comment — Piper here has no runtime rate control
      await mkdir(outDir, { recursive: true });
      const hash = createHash('sha256').update(`${text}::${modelPath}`).digest('hex').slice(0, 16);
      const wavPath = path.join(outDir, `${hash}.wav`);

      await execFileAsync('python3', [scriptPath, text, wavPath, modelPath]);

      const durationSec = await ffprobeDuration(wavPath);
      return { wavPath, durationSec };
    },
  };
}
