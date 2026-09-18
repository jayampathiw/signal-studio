#!/usr/bin/env node
// Bootstrap script — validates env, checks npm workspace linking, reports status.
// Run after cloning: node scripts/bootstrap.js

import { existsSync } from 'fs';
import { resolve } from 'path';

const checks = [];

function check(label, pass, hint = '') {
  checks.push({ label, pass, hint });
}

// .env
check('.env exists', existsSync(resolve('.env')), 'Run: cp .env.example .env and fill in values');

// node_modules
check('npm install done', existsSync(resolve('node_modules')), 'Run: npm install');

// Key workspace packages linked
const packages = [
  'ai',
  'render/core',
  'render/ffmpeg',
  'media',
  'database',
  'publishers',
  'config',
  'types',
];
for (const pkg of packages) {
  check(
    `packages/${pkg} linked`,
    existsSync(
      resolve('node_modules/@signal-studio', pkg.replace('/', '-').replace('render-', 'render-')),
    ),
    `Run: npm install (workspace linking)`,
  );
}

const allPass = checks.every((c) => c.pass);

console.log('\n━━━ signal-studio bootstrap check ━━━\n');
for (const { label, pass, hint } of checks) {
  const icon = pass ? '✅' : '❌';
  console.log(`  ${icon}  ${label}`);
  if (!pass && hint) console.log(`       → ${hint}`);
}
console.log();
console.log(
  allPass
    ? '  All checks passed. Ready to develop.'
    : '  Fix the issues above before running pipelines.',
);
console.log();
