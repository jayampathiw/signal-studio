import { execFile } from 'child_process';
import { promisify } from 'util';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const execFileAsync = promisify(execFile);
const ttsScript = resolve(dirname(fileURLToPath(import.meta.url)), 'tts.py');

// Voice map: country/language code → Kokoro voice ID
const VOICE_MAP = {
  IT: 'if_sara',
  FR: 'ff_siwis',
  EN: 'af_bella',
};

/**
 * Synthesise narration text to WAV using Kokoro TTS.
 * Output is cached — re-runs skip existing files.
 *
 * @param {string} text
 * @param {string} outputPath  path to write .wav
 * @param {{ voice?: string, country?: string, speed?: number }} opts
 * @returns {Promise<string>} outputPath
 */
export async function synthesise(text, outputPath, { voice, country = 'EN', speed = 0.85 } = {}) {
  if (existsSync(outputPath)) return outputPath;

  const resolvedVoice = voice ?? VOICE_MAP[country] ?? VOICE_MAP.EN;
  await execFileAsync('python3', [ttsScript, text, outputPath, resolvedVoice, String(speed)]);
  return outputPath;
}
