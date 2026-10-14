#!/usr/bin/env node
// P0.1 — runs today's assembler script for a given template (the underlying
// command differs per template: assemble-case.mjs, assemble-local.mjs,
// assemble-short-rewrite.mjs, etc. take different flags), then copies its
// output to golden/<template>/reference.mp4 and writes golden.json next to it.
//
// Usage:
//   node scripts/golden/render-reference.mjs --template policy-file-16x9 \
//     --out /path/to/produced.mp4 \
//     --cmd node apps/video/scripts/policy-file/assemble-case.mjs --dir <dir>
//
// --cmd takes everything after it as the command + args to run (the
// underlying script's own invocation, verbatim) — this tool doesn't know how
// to build each template's arguments itself, since they're structurally
// different per template; it only standardizes "run it, then file the result
// under golden/<template>/".
import { execFile } from 'node:child_process';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { measure } from './measure.mjs';

const execFileAsync = promisify(execFile);
const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');

function parseArgs(argv) {
  const cmdIdx = argv.indexOf('--cmd');
  if (cmdIdx === -1) {
    console.error('--cmd <command> <args...> required (must be the last flag)');
    process.exit(2);
  }
  const before = argv.slice(0, cmdIdx);
  const cmd = argv.slice(cmdIdx + 1);

  const values = {};
  for (let i = 0; i < before.length; i += 2) {
    const key = before[i].replace(/^--/, '');
    values[key] = before[i + 1];
  }
  return { values, cmd };
}

async function main() {
  const { values, cmd } = parseArgs(process.argv.slice(2));
  if (!values.template || !values.out) {
    console.error(
      '--template <name> and --out <path the underlying script will produce> are required',
    );
    process.exit(2);
  }
  if (cmd.length === 0) {
    console.error('--cmd must be followed by a command to run');
    process.exit(2);
  }

  console.log(`[${values.template}] running: ${cmd.join(' ')}`);
  await execFileAsync(cmd[0], cmd.slice(1), { cwd: REPO_ROOT, maxBuffer: 1024 * 1024 * 64 });

  const destDir = path.join(REPO_ROOT, 'golden', values.template);
  await mkdir(destDir, { recursive: true });
  const destMp4 = path.join(destDir, 'reference.mp4');
  await copyFile(values.out, destMp4);
  console.log(`[${values.template}] copied ${values.out} -> ${destMp4}`);

  const golden = await measure(destMp4);
  const destJson = path.join(destDir, 'golden.json');
  await writeFile(destJson, JSON.stringify(golden, null, 2) + '\n');
  console.log(`[${values.template}] wrote ${destJson}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
});
