import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { synthesise as pythonSynthesise } from '@signal-studio/media/tts';

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
 * P2.4 — python (subprocess) implementation of TtsProvider, wrapping the
 * existing `packages/media/tts.js` → `tts.py` (real Kokoro python package,
 * distinct from tts-kokoro-js's in-process JS/ONNX runtime — this is the
 * pairing the plan calls for a real A/B comparison against). Same
 * content-addressed output path, since the contract doesn't pass one —
 * `synthesise()` itself already skips regenerating an existing file
 * (`existsSync` check in tts.js), so no separate cache check is needed here.
 */
export function createKokoroPyProvider(opts?: { outDir?: string }): TtsProvider {
  const outDir = opts?.outDir ?? path.join(os.tmpdir(), 'signal-studio-tts-kokoro-py');

  return {
    async synthesise({ text, voice, speed }): Promise<TtsResultT> {
      await mkdir(outDir, { recursive: true });
      const hash = createHash('sha256')
        .update(`${text}::${voice}::${speed}`)
        .digest('hex')
        .slice(0, 16);
      const wavPath = path.join(outDir, `${hash}.wav`);

      await pythonSynthesise(text, wavPath, { voice, speed });

      const durationSec = await ffprobeDuration(wavPath);
      return { wavPath, durationSec };
    },
  };
}
