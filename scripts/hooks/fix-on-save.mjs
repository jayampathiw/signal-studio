#!/usr/bin/env node
// PostToolUse hook (P0.3): runs `eslint --fix` + `prettier --write` on the
// file a Write/Edit just touched. Reads the file path from the PostToolUse
// stdin JSON (same convention as apps/video/scripts/safe-language-lint.mjs).
// Never blocks the tool call — a formatting failure is reported but doesn't
// fail the hook.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const LINTABLE = /\.(js|mjs|cjs|jsx|ts|tsx)$/;
const FORMATTABLE = /\.(js|mjs|cjs|jsx|ts|tsx|json|md|yml|yaml|css|html)$/;

function readFilePath() {
  try {
    const raw = readFileSync('/dev/stdin', 'utf8');
    const hookData = JSON.parse(raw);
    return hookData?.tool_input?.file_path ?? '';
  } catch {
    return '';
  }
}

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const filePath = readFilePath();

if (!filePath || !existsSync(filePath)) process.exit(0);

const rel = path.relative(repoRoot, filePath);
if (rel.startsWith('..') || rel.includes('node_modules')) process.exit(0);

if (FORMATTABLE.test(rel)) {
  try {
    execFileSync('pnpm', ['exec', 'prettier', '--write', rel], { cwd: repoRoot, stdio: 'pipe' });
  } catch (err) {
    console.error(`[fix-on-save] prettier failed on ${rel}: ${err.message}`);
  }
}

if (LINTABLE.test(rel)) {
  try {
    execFileSync('pnpm', ['exec', 'eslint', '--fix', rel], { cwd: repoRoot, stdio: 'pipe' });
  } catch (err) {
    // eslint --fix exits non-zero when unfixable errors remain — that's
    // useful signal, surface it, but never block the tool call over it.
    console.error(`[fix-on-save] eslint found issues in ${rel}:\n${err.stdout ?? err.message}`);
  }
}

process.exit(0);
