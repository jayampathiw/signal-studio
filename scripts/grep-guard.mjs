import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

// P3.7 — a CI safety net for the 2026-09-28 deletion of the Wild Eye reel
// pipeline and the legacy news/video dashboard review UI: fails the build if
// any of those paths come back, or if any *code/config* file (not docs,
// where historical mentions are expected and fine) references the packages
// or brand names that went with them.

const root = path.resolve(import.meta.dirname, '..');

// Specific paths that must stay deleted. Re-appearing here means either a
// bad merge/rebase resurrected them, or someone's rebuilding the old
// pipeline instead of extending the engine — both worth a hard stop.
const BANNED_PATHS = [
  'apps/video',
  'packages/publishers',
  '.github/workflows/fetch-reels.yml',
  '.claude/skills/wild-eye-reel',
  '.claude/skills/wild-eye-brief',
  '.claude/skills/higgsfield-credit-guard',
  '.claude/agents/continuity-checker.md',
  '.claude/agents/image-quality-gate.md',
  '.claude/agents/performance-analyst.md',
  '.claude/agents/seo-writer.md',
  '.claude/commands/log-reel.md',
  '.claude/commands/new-11s-reel.md',
  '.claude/commands/new-21s-reel.md',
  '.claude/commands/new-portrait.md',
  '.claude/commands/new-wild-reel.md',
  '.claude/commands/wild-seo.md',
  '.claude/commands/wild-status.md',
  'apps/dashboard/src/app/articles',
  'apps/dashboard/src/app/reels',
  'apps/dashboard/src/app/on-this-day',
  'apps/dashboard/src/app/longform',
  'apps/dashboard/src/app/metrics',
  'apps/dashboard/src/app/upload',
  'apps/dashboard/src/app/auth/login.component.ts',
  'apps/dashboard/src/app/core/auth.guard.ts',
  'apps/dashboard/src/app/core/supabase.service.ts',
  'apps/dashboard/src/app/core/slot-matcher.ts',
  'supabase/functions/expand-brief',
  'supabase/functions/trigger-generation',
  'supabase/functions/trigger-longform',
  'supabase/functions/upload-still',
  'supabase/functions/import-shotlist',
  'supabase/functions/auto-match-still',
];

// Only real source/config files, never docs — CLAUDE.md and
// docs/refactor/refactor-plan.md both describe this deletion in detail on
// purpose, and would false-positive on every pattern below.
const SCAN_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.json', '.yml', '.yaml']);
const EXCLUDE_FILES = new Set(['pnpm-lock.yaml', 'package-lock.json']);

// Case-sensitive unless noted. Kept narrow (real paths/package names, not
// generic words) so a legitimate future match elsewhere can't collide.
const BANNED_PATTERNS = [
  { pattern: 'apps/video', flags: '' },
  { pattern: 'packages/publishers', flags: '' },
  { pattern: '@signal-studio/publishers', flags: '' },
  { pattern: 'wild-eye', flags: 'i' },
  { pattern: 'channel-slugs', flags: '' },
  { pattern: 'higgsfield-credit-guard', flags: '' },
];

let hadFailure = false;

for (const rel of BANNED_PATHS) {
  if (existsSync(path.join(root, rel))) {
    console.error(`grep-guard: banned path still exists: ${rel}`);
    hadFailure = true;
  }
}

const trackedFiles = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)
  .filter((f) => SCAN_EXTENSIONS.has(path.extname(f)))
  .filter((f) => !EXCLUDE_FILES.has(path.basename(f)))
  .filter((f) => !f.startsWith('docs/'));

// A line is treated as "just a comment" if, once trimmed, it starts with
// `//` or `*` (a JSDoc/block-comment continuation line). Deliberately
// tolerant of code-comment explanations like "the old apps/video/... did X,
// this does Y instead" — that's exactly the non-obvious-WHY documentation
// this repo's own conventions want kept, not something to force out. Real
// imports/paths/config always land on a non-comment line.
const COMMENT_LINE = /^\s*(\/\/|\*)/;

for (const file of trackedFiles) {
  let content;
  try {
    content = readFileSync(path.join(root, file), 'utf8');
  } catch {
    continue; // binary or unreadable — not a text match target anyway
  }

  const codeLines = content.split('\n').filter((line) => !COMMENT_LINE.test(line));

  for (const { pattern, flags } of BANNED_PATTERNS) {
    const re = new RegExp(pattern, flags);
    const hitLine = codeLines.find((line) => re.test(line));
    if (hitLine) {
      console.error(`grep-guard: "${pattern}" found in ${file}: ${hitLine.trim()}`);
      hadFailure = true;
    }
  }
}

if (hadFailure) {
  console.error(
    '\ngrep-guard failed — see docs/refactor/refactor-plan.md (P3.7) for what was deleted and why.',
  );
  process.exit(1);
}

console.log('grep-guard: clean');
