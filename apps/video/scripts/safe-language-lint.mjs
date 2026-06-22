#!/usr/bin/env node
/**
 * Safe-language lint for Wild Capture image prompts.
 *
 * Scans stdin or a file argument for words/phrases that trigger image-gen
 * content moderation, and substitutes them with approved alternatives.
 *
 * Usage:
 *   node safe-language-lint.mjs < prompt.txt          # stdin
 *   node safe-language-lint.mjs path/to/scenes.md     # file
 *   echo "exposed roots and toe pads" | node safe-language-lint.mjs
 *
 * Exit codes:
 *   0 — no flagged words (or all substituted cleanly, --fix mode)
 *   1 — flagged words found (report mode, no substitution)
 *
 * Called by the Claude Code PostToolUse hook on Write/Edit of *.md files
 * containing image prompts. The hook reads the file path from stdin JSON.
 */

import { readFileSync } from 'fs';

const SUBSTITUTIONS = [
  { from: /\bexposed roots?\b/gi,    to: 'tangled root structures' },
  { from: /\bpredawn\b/gi,           to: 'cool morning light' },
  { from: /\btoe pads?\b/gi,         to: 'small paws' },
  { from: /\bnose leather\b/gi,      to: 'muzzle detail' },
  { from: /\biris texture\b/gi,      to: 'eye catching light' },
];

function lint(text, fix = false) {
  const findings = [];
  let result = text;

  for (const { from, to } of SUBSTITUTIONS) {
    const matches = [...text.matchAll(from)];
    for (const m of matches) {
      findings.push({ flagged: m[0], approved: to, index: m.index });
    }
    if (fix) result = result.replace(from, to);
  }

  return { findings, fixed: fix ? result : text };
}

function main() {
  const args = process.argv.slice(2);
  const fix = args.includes('--fix');
  const filePath = args.find(a => !a.startsWith('--'));

  let input;
  if (filePath) {
    try {
      input = readFileSync(filePath, 'utf8');
    } catch {
      process.stderr.write(`safe-language-lint: cannot read file: ${filePath}\n`);
      process.exit(1);
    }
  } else {
    // Try to read hook stdin (JSON with tool use data) or raw text
    try {
      const raw = readFileSync('/dev/stdin', 'utf8');
      // Hook mode: stdin is a JSON payload from Claude Code PostToolUse
      try {
        const hookData = JSON.parse(raw);
        // Claude Code Write/Edit hook passes tool_input with file_path and content
        const content = hookData?.tool_input?.content || hookData?.tool_input?.new_string || raw;
        const fp = hookData?.tool_input?.file_path || '';
        // Only lint files that look like they contain image prompts
        if (fp && !fp.match(/\.(md|txt)$/) && !fp.includes('scenes') && !fp.includes('prompt')) {
          process.exit(0); // not a prompt file
        }
        input = content;
      } catch {
        input = raw; // not JSON, treat as raw text
      }
    } catch {
      process.exit(0); // no stdin, nothing to lint
    }
  }

  if (!input?.trim()) process.exit(0);

  const { findings, fixed } = lint(input, fix);

  if (findings.length === 0) {
    process.exit(0);
  }

  // Report findings
  process.stderr.write('\n⚠️  safe-language-lint: flagged words detected in image prompt\n');
  process.stderr.write('─'.repeat(60) + '\n');
  for (const { flagged, approved } of findings) {
    process.stderr.write(`  ✗  "${flagged}"  →  use "${approved}"\n`);
  }
  process.stderr.write('─'.repeat(60) + '\n');

  if (fix) {
    process.stdout.write(fixed);
    process.stderr.write('✅ Substitutions applied (--fix mode).\n\n');
    process.exit(0);
  } else {
    process.stderr.write('Run with --fix to auto-substitute, or correct manually.\n\n');
    process.exit(1);
  }
}

main();
