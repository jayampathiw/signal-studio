import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

// Runs `tsc --noEmit` against every package that opts in with its own
// tsconfig.json — there's no single project-references root spanning the
// whole monorepo (dashboard's tsconfig.json itself is references-only with
// no `composite`, so its leaf configs are checked directly instead). Add a
// path here when a package gets a tsconfig.json.
//
// NOT included yet: packages/render/remotion/tsconfig.json — this is the
// first time anything has run `tsc` on it, and it surfaced pre-existing type
// debt (missing `@remotion/bundler` dependency, untyped `@signal-studio/*`
// JS imports, one implicit-any param) that predates P0.2 and is out of this
// task's scope to fix blind. Tracked in docs/PROJECT-STATUS.md; add it back
// once that debt is paid down.
const TS_PROJECTS = [
  'apps/dashboard/tsconfig.app.json',
  'apps/dashboard/tsconfig.spec.json',
  'projects/assemblex-factory/pilot/tsconfig.json',
];

const root = path.resolve(import.meta.dirname, '..');
let hadFailure = false;

for (const rel of TS_PROJECTS) {
  const tsconfigPath = path.join(root, rel);
  if (!existsSync(tsconfigPath)) {
    console.error(`Skipping ${rel} (not found)`);
    continue;
  }

  console.log(`\n> tsc --noEmit -p ${rel}`);
  try {
    execFileSync('tsc', ['--noEmit', '-p', rel], { cwd: root, stdio: 'inherit', shell: true });
  } catch {
    hadFailure = true;
  }
}

if (hadFailure) process.exit(1);
