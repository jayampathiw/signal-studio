import { execFile } from 'child_process';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Concatenate MP4 clips into a single file using FFmpeg concat demuxer.
 *
 * @param {string[]} clipPaths
 * @param {string}   outputPath
 * @returns {Promise<string>}
 */
export async function concatClips(clipPaths, outputPath) {
  const listPath = join(dirname(outputPath), '_concat_list.txt');
  const listContent = clipPaths.map((p) => `file '${p}'`).join('\n');
  writeFileSync(listPath, listContent);

  await execFileAsync('ffmpeg', [
    '-y',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    listPath,
    '-c',
    'copy',
    outputPath,
  ]);
  return outputPath;
}
