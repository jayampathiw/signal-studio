#!/usr/bin/env node
// P3's T-G gate ("ci.yml includes the ffmpeg golden suite; Remotion golden
// suite in nightly.yml"). **Deliberately not a re-render-from-source
// check** — the real source assets each golden/*/reference.mp4 was
// originally rendered from (shotlists, real VO .wav, real stills, real
// case.json configs) live only in the private `signal-studio-workspace`
// repo and the sibling `main` git worktree's `content/` dir, neither of
// which GitHub Actions checking out `refactor` has access to (confirmed:
// `git ls-files` on `refactor` finds none of them, and `.gitignore` excludes
// the binaries even where the paths are tracked). Re-rendering in CI would
// need new source-asset distribution infra (committing media to this repo,
// or syncing it to R2) — out of scope for this pass; see the plan entry
// this closes for the explicit scope call.
//
// What this *does* check, against the real already-rendered reference.mp4
// each golden.json's `r2Url` points at (uploaded 2026-09-19, public, no
// credentials needed): downloads it fresh and re-runs the exact same
// measure()/compare() pipeline check.mjs uses for a local file. This is a
// regression test for the golden *tooling* (measure.mjs's ffprobe/ffmpeg
// parsing, phash.mjs, check.mjs's tolerances) and for the uploaded
// reference's integrity — not for template/compile() logic, since nothing
// is re-rendered from source. A real compile()/render() regression would
// only show up here if someone also re-ran render-reference.mjs and
// re-uploaded a changed reference.mp4, which is a separate, deliberate step.
import { createWriteStream } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

import { compare } from './check.mjs';
import { measure } from './measure.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');

// The public r2.dev URLs are rate-limited and drop long downloads now and
// then (`TypeError: terminated`, three CI runs on 2026-10-28) — retried
// rather than failing an unrelated PR.
async function downloadTo(url, destPath, attempts = 4) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5 * 60_000) });
      if (!res.ok) throw new Error(`download failed: ${url} -> HTTP ${res.status}`);
      await pipeline(res.body, createWriteStream(destPath));
      return;
    } catch (err) {
      if (attempt >= attempts) throw err;
      console.error(`download attempt ${attempt} failed (${err.message}); retrying`);
      await new Promise((r) => setTimeout(r, attempt * 5_000));
    }
  }
}

async function verifyOne(template, tmpDir) {
  const goldenPath = path.join(REPO_ROOT, 'golden', template, 'golden.json');
  const golden = JSON.parse(await readFile(goldenPath, 'utf8'));
  if (!golden.r2Url) throw new Error(`${template}: golden.json has no r2Url to verify against`);

  const mp4Path = path.join(tmpDir, `${template}.mp4`);
  await downloadTo(golden.r2Url, mp4Path);

  const actual = await measure(mp4Path);
  const { rows, pass } = compare(actual, golden);
  console.log(`\n=== ${template} ===`);
  for (const r of rows) {
    console.log(
      `${r.pass ? '✓' : '✗'} ${r.metric.padEnd(16)} golden=${r.golden}  actual=${r.actual}`,
    );
  }
  return pass;
}

async function main() {
  const templates = process.argv.slice(2);
  if (templates.length === 0) {
    console.error('Usage: node scripts/golden/verify-references.mjs <template...>');
    process.exit(2);
  }

  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'golden-verify-'));
  try {
    let allPass = true;
    for (const template of templates) {
      const pass = await verifyOne(template, tmpDir);
      allPass = allPass && pass;
    }
    if (!allPass) {
      console.error('\nFAIL: one or more golden references no longer match their golden.json');
      process.exit(1);
    }
    console.log('\nPASS: all golden references match their golden.json');
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
});
