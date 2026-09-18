import { execFile } from 'child_process';
import { writeFileSync, readFileSync, existsSync, rmSync } from 'fs';
import { dirname, join, basename } from 'path';
import { promisify } from 'util';

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

  await execFileAsync('whisper', [
    audioPath,
    '--model',
    'tiny',
    '--output_format',
    'srt',
    '--word_timestamps',
    'True',
    '--output_dir',
    srtPath
      .replace(/\.srt$/, '')
      .split('/')
      .slice(0, -1)
      .join('/'),
  ]);

  return srtPath;
}

/**
 * Extract word-level timestamps from an audio file using Whisper's JSON output
 * (`segments[].words[].{word,start,end}`) — needed to lock Tier 2 word-sync
 * accents to the instant a word is actually spoken, not a script estimate.
 * Output is cached as flattened JSON — re-runs skip existing files.
 *
 * @param {string} audioPath   WAV file
 * @param {string} jsonPath    path to write/read the flattened word-timestamp JSON
 * @param {string} [initialPrompt] — biases Whisper's decoder toward specific
 *   vocabulary (character/place names etc.) via `--initial_prompt`. Whisper's
 *   tiny/base models otherwise badly mis-transcribe uncommon proper nouns —
 *   e.g. "Mostafa Shobeir" came out as "most of a sober" without this; passing
 *   the expected name(s) as a prompt fixed it outright (verified empirically).
 * @returns {Promise<Array<{word: string, start: number, end: number}>>}
 */
export async function generateWordTimestamps(audioPath, jsonPath, initialPrompt) {
  if (existsSync(jsonPath)) {
    return JSON.parse(readFileSync(jsonPath, 'utf-8'));
  }

  const outDir = dirname(jsonPath);
  const args = [
    audioPath,
    '--model',
    'tiny',
    '--output_format',
    'json',
    '--word_timestamps',
    'True',
    '--output_dir',
    outDir,
  ];
  if (initialPrompt) args.push('--initial_prompt', initialPrompt);
  await execFileAsync('whisper', args);

  // Whisper names its output after audioPath's basename, not jsonPath —
  // locate it, flatten to a single word array, then normalize to jsonPath.
  const whisperOut = join(outDir, `${basename(audioPath).replace(/\.[^.]+$/, '')}.json`);
  const raw = JSON.parse(readFileSync(whisperOut, 'utf-8'));
  const words = (raw.segments ?? [])
    .flatMap((seg) => seg.words ?? [])
    .map((w) => ({
      word: w.word.trim(),
      start: w.start,
      end: w.end,
    }));

  writeFileSync(jsonPath, JSON.stringify(words, null, 2));
  if (whisperOut !== jsonPath) {
    try {
      rmSync(whisperOut);
    } catch {
      /* best-effort cleanup of whisper's raw file */
    }
  }
  return words;
}
