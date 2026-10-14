#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

import { Manifest } from '../schemas/manifest.v1.ts';

/**
 * `ss` CLI skeleton (P1.1). Only `validate` exists so far — loads a
 * manifest.json, parses it against the Manifest schema, and prints zod
 * issues with their paths. Later phases add more subcommands here.
 */

async function validate(manifestPath: string): Promise<number> {
  if (!manifestPath) {
    console.error('Usage: ss validate <manifest.json>');
    return 1;
  }

  const raw = JSON.parse(await readFile(manifestPath, 'utf8'));
  const result = Manifest.safeParse(raw);

  if (result.success) {
    console.log(`✓ ${manifestPath} is a valid manifest (${result.data.shots.length} shot(s))`);
    return 0;
  }

  console.error(`✗ ${manifestPath} is invalid:`);
  for (const issue of result.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  return 1;
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);

  switch (command) {
    case 'validate':
      process.exit(await validate(rest[0]));
      break;
    default:
      console.error(`Unknown command: ${command ?? '(none)'}\nAvailable: validate <manifest.json>`);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
});
