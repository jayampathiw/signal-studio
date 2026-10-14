#!/usr/bin/env node
// PreToolUse hook (P0.3): checks `.env` exists and the required keys from
// packages/config/schema.js are non-empty. Never blocks — always exits 0 —
// this is a heads-up for the person at the keyboard, not a gate.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const envPath = path.join(repoRoot, '.env');

function warn(message) {
  console.error(`[env-check] ${message}`);
}

if (!existsSync(envPath)) {
  warn('.env not found — copy .env.example → .env and fill in values.');
  process.exit(0);
}

const { schema } = await import(path.join(repoRoot, 'packages/config/schema.js'));

const envText = readFileSync(envPath, 'utf8');
const set = new Set();
for (const line of envText.split('\n')) {
  const match = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
  if (!match) continue;
  // Strip inline `# comment` the same way packages/config/schema.js's
  // callers are warned to (CLAUDE.md's "naive grep|cut" gotcha) — a value
  // that's only a comment counts as empty, not set.
  const value = match[2]
    .split('#')[0]
    .trim()
    .replace(/^["']|["']$/g, '');
  if (value) set.add(match[1]);
}

const missing = schema.required.filter((key) => !set.has(key));
if (missing.length > 0) {
  warn(`missing/empty required env var(s) in .env: ${missing.join(', ')}`);
}

process.exit(0);
