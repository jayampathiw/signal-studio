import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

import type { CaptionsProvider, WordTimingT } from './contracts.ts';

const execFileAsync = promisify(execFile);

/**
 * P3.4 — `captions-faster-whisper`, replacing `packages/media/subtitles.js`'s
 * unpinned `whisper` CLI call (the plan's own words: "pinned; replaces the
 * unpinned `whisper` CLI call"). Wraps a new
 * `packages/media/captions_faster_whisper.py` (`faster-whisper`'s python
 * library, not a CLI — faster-whisper has none) rather than the `openai-
 * whisper` package `subtitles.js` shells out to; same `tiny` model both
 * sides use, for a fair parity comparison (see `captions-faster-
 * whisper.test.ts`'s real ±50ms check against the old CLI path).
 */
export function createFasterWhisperCaptionsProvider(opts?: {
  scriptPath?: string;
}): CaptionsProvider {
  const scriptPath =
    opts?.scriptPath ?? path.resolve(import.meta.dirname, '../../media/captions_faster_whisper.py');

  return {
    async wordTimings({ wavPath, hintText }): Promise<WordTimingT[]> {
      const args = [scriptPath, wavPath];
      if (hintText) args.push(hintText);
      const { stdout } = await execFileAsync('python3', args, { maxBuffer: 10 * 1024 * 1024 });
      return JSON.parse(stdout) as WordTimingT[];
    },
  };
}
