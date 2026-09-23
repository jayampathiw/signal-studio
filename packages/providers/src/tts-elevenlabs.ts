import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import type { TtsProvider, TtsResultT } from './contracts.ts';

const execFileAsync = promisify(execFile);
const ELEVENLABS_API = 'https://api.elevenlabs.io/v1';

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
 * P3.4 — ElevenLabs TTS (REST). **Not verified for real**: no
 * `ELEVENLABS_API_KEY` in this environment — flagged honestly, same
 * convention as `tts-kokoro-py`'s real-vs-unverified split. Code shape
 * mirrors `llm-anthropic.ts`: explicit-config factory, no `@signal-studio/
 * config` dependency, real fetch against the documented REST API (no SDK).
 *
 * `voice` is the project's ElevenLabs voice id (per `manifest.v1`'s comment
 * on `tts-elevenlabs` — "voice id from project"), not a display name.
 * `speed` maps to ElevenLabs' own `voice_settings.speed` (supported range
 * ~0.7–1.2 per their docs) — passed through as-is; a caller requesting an
 * out-of-range value gets ElevenLabs' own 4xx, not a local guard, since
 * their accepted range isn't fixed across all voices/models.
 */
export function createElevenLabsProvider(opts?: {
  apiKey?: string;
  modelId?: string;
  outDir?: string;
}): TtsProvider {
  const apiKey = opts?.apiKey ?? process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('createElevenLabsProvider: missing ELEVENLABS_API_KEY');
  const modelId = opts?.modelId ?? 'eleven_multilingual_v2';
  const outDir = opts?.outDir ?? path.join(os.tmpdir(), 'signal-studio-tts-elevenlabs');

  return {
    async synthesise({ text, voice, speed }): Promise<TtsResultT> {
      const res = await fetch(`${ELEVENLABS_API}/text-to-speech/${voice}`, {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text,
          model_id: modelId,
          voice_settings: { speed },
        }),
      });
      if (!res.ok) {
        throw new Error(`ElevenLabs TTS failed (${res.status}): ${await res.text()}`);
      }

      await mkdir(outDir, { recursive: true });
      const hash = createHash('sha256')
        .update(`${text}::${voice}::${speed}`)
        .digest('hex')
        .slice(0, 16);
      // ElevenLabs returns MP3, not WAV — the contract's `wavPath` field name
      // predates this provider and is a slight misnomer here; every existing
      // caller (assets/render pipeline) only ever passes this path to ffmpeg,
      // which reads container format from content, not the file extension.
      const audioPath = path.join(outDir, `${hash}.mp3`);
      await writeFile(audioPath, Buffer.from(await res.arrayBuffer()));

      const durationSec = await ffprobeDuration(audioPath);
      return { wavPath: audioPath, durationSec };
    },
  };
}
