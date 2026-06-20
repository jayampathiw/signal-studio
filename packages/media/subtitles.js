import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, existsSync } from 'fs';

const execFileAsync = promisify(execFile);

/**
 * Generate an SRT subtitle file from an audio file using Whisper (tiny model).
 * Output is cached — re-runs skip existing files.
 *
 * @param {string} audioPath   WAV file
 * @param {string} srtPath     path to write .srt
 * @returns {Promise<string>}  srtPath
 */
export async function generateSubtitles(audioPath, srtPath) {
  if (existsSync(srtPath)) return srtPath;

  // TODO: migrate Whisper word-level timestamp generation from reels-pipeline
  // whisper audioPath --model tiny --output_format srt --word_timestamps True
  await execFileAsync('whisper', [
    audioPath,
    '--model', 'tiny',
    '--output_format', 'srt',
    '--word_timestamps', 'True',
    '--output_dir', srtPath.replace(/\.srt$/, '').split('/').slice(0, -1).join('/'),
  ]);

  return srtPath;
}
