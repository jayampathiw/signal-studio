import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { Pack } from '../src/manifest.ts';

async function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: npm run validate <pack-dir>');
    process.exit(1);
  }

  const packPath = path.join(dir, 'pack.json');
  const raw = await readFile(packPath, 'utf8');
  const json = JSON.parse(raw);

  const result = Pack.safeParse(json);
  if (!result.success) {
    console.error(`✗ ${packPath} is invalid:`);
    for (const issue of result.error.issues) {
      const at = issue.path.length ? issue.path.join('.') : '(root)';
      console.error(`  - ${at}: ${issue.message}`);
    }
    process.exit(1);
  }

  console.log(`✓ ${packPath} is valid (${result.data.shots.length} shots)`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
