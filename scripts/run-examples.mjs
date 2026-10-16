#!/usr/bin/env node
// P3's T-L gate — "examples/{stills-kenburns,shorts-916,case-file,carousel}
// render with fakes in CI time (< 8 min total)". Runs `ss run-local --fake`
// against every real example fixture in examples/*, failing loudly (and
// fast) if any one errors or the whole batch blows the time budget.
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const TIME_BUDGET_MS = 8 * 60 * 1000;

async function main() {
  const examplesDir = path.join(ROOT, 'examples');
  const names = (await readdir(examplesDir, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  const start = Date.now();
  for (const name of names) {
    const dir = path.join(examplesDir, name);
    const outDir = await mkdtemp(path.join(os.tmpdir(), `run-examples-${name}-`));
    const t0 = Date.now();
    try {
      await execFileAsync(
        'node',
        [
          '--experimental-strip-types',
          path.join(ROOT, 'apps/worker/src/cli.ts'),
          'run-local',
          '--manifest',
          path.join(dir, 'manifest.json'),
          '--project',
          path.join(dir, 'project.json'),
          '--out',
          outDir,
          '--fake',
        ],
        { cwd: ROOT },
      );
      console.error(`PASS ${name} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    } catch (err) {
      console.error(`FAIL ${name}:\n${err.stderr ?? err.message}`);
      process.exitCode = 1;
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  }

  const elapsedMs = Date.now() - start;
  console.error(`\ntotal: ${(elapsedMs / 1000).toFixed(1)}s (budget: ${TIME_BUDGET_MS / 1000}s)`);
  if (elapsedMs > TIME_BUDGET_MS) {
    console.error('FAIL: exceeded the 8-minute budget');
    process.exitCode = 1;
  }
}

main();
