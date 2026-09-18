import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

import { Pack } from '../src/manifest.ts';

function section(lines: Array<string | undefined | false>): string {
  return lines.filter((l): l is string => Boolean(l)).join('\n');
}

async function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: npm run captions <pack-dir>');
    process.exit(1);
  }

  const raw = JSON.parse(await readFile(path.join(dir, 'pack.json'), 'utf8'));
  const pack = Pack.parse(raw);
  const disclosure = pack.disclosure ? pack.end_card.disclosure : undefined;

  const blocks = [
    '=== Facebook ===',
    section([
      pack.captions.facebook,
      '',
      pack.captions.facebook_question,
      '',
      pack.captions.hashtags_facebook.join(' ') || undefined,
      disclosure,
    ]),
    '',
    '=== Instagram ===',
    section([
      pack.captions.instagram,
      '',
      pack.captions.hashtags_instagram.join(' ') || undefined,
      disclosure,
    ]),
    '',
    '=== YouTube Shorts ===',
    section([pack.captions.youtube_shorts_title]),
  ];

  const outDir = path.join(dir, 'out');
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, 'captions.txt');
  await writeFile(outPath, blocks.join('\n') + '\n');

  console.log(`✓ wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
});
