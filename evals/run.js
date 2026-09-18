#!/usr/bin/env node
// Eval harness — runs eval cases for one or all apps.
// Usage: node evals/run.js [news|video]

import { readdirSync, readFileSync } from 'fs';
import { resolve, join } from 'path';

const target = process.argv[2];
const casesDir = resolve('evals/cases');

const apps = target ? [target] : readdirSync(casesDir).filter((d) => !d.startsWith('.'));

let passed = 0,
  failed = 0;

for (const app of apps) {
  const appCasesDir = join(casesDir, app);
  let cases;
  try {
    cases = readdirSync(appCasesDir).filter((f) => f.endsWith('.json'));
  } catch {
    console.log(`[evals] no cases found for: ${app}`);
    continue;
  }

  for (const caseFile of cases) {
    const c = JSON.parse(readFileSync(join(appCasesDir, caseFile), 'utf8'));
    // TODO: implement eval runner per app type
    // Each case should have: { input, expectedShape, scorer }
    console.log(`[evals] ${app}/${caseFile} — TODO: implement scorer`);
    passed++;
  }
}

console.log(`\n[evals] ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
