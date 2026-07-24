import { execFile } from 'child_process';
import { promisify } from 'util';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const execFileAsync = promisify(execFile);
const mediaDir = dirname(fileURLToPath(import.meta.url));
const ttsScript = resolve(mediaDir, 'tts.py');
const piperScript = resolve(mediaDir, 'tts_piper.py');

// Voice map: country/language code → Kokoro voice ID, or { engine: 'piper', model } for Piper voices
const VOICE_MAP = {
  IT: 'if_sara',
  FR: 'ff_siwis',
  EN: 'af_bella',
  'es-MX': { engine: 'piper', model: 'piper-voices/es_MX-claude-high.onnx' },
};

/**
 * Synthesise narration text to WAV using Kokoro TTS (default) or Piper (for locales
 * that need a regional accent Kokoro doesn't have).
 * Output is cached — re-runs skip existing files.
 *
 * @param {string} text
 * @param {string} outputPath  path to write .wav
 * @param {{ voice?: string, country?: string, speed?: number }} opts
 * @returns {Promise<string>} outputPath
 */
export async function synthesise(text, outputPath, { voice, country = 'EN', speed = 0.85 } = {}) {
  if (existsSync(outputPath)) return outputPath;

  const resolved = voice ?? VOICE_MAP[country] ?? VOICE_MAP.EN;

  if (typeof resolved === 'object' && resolved.engine === 'piper') {
    const modelPath = resolve(mediaDir, resolved.model);
    await execFileAsync('python3', [piperScript, text, outputPath, modelPath]);
  } else {
    await execFileAsync('python3', [ttsScript, text, outputPath, resolved, String(speed)]);
  }
  return outputPath;
}
