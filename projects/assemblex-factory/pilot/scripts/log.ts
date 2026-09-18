import { existsSync } from 'node:fs';
import { readFile, writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Appends one row to production-log.csv (Flow generation attempts, credits,
 * reject reasons — refactor-plan.md §2.6). The exact header/columns are
 * reconstructed, not copied from the source *Implementation Plan* §7 (that
 * doc wasn't available — see P0.8-02's note in src/manifest.ts for the same
 * situation). Reconcile if/when the real doc surfaces.
 *
 * Usage:
 *   npm run log -- --post <post_id> --shot <shot_id> --attempt <n> \
 *     --credits <n> --accepted <true|false> [--reason <text>] [--clip <file>]
 */

const CSV_PATH = path.resolve(import.meta.dirname, '..', '..', 'production-log.csv');
const HEADER = 'date,week,post_id,shot_id,attempt,credits_used,accepted,reject_reason,clip_file';

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
      args[key] = value;
    }
  }
  return args;
}

function csvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function isoWeek(date: Date): string {
  const target = new Date(date.valueOf());
  const dayNr = (date.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const week =
    1 +
    Math.round(
      ((target.getTime() - firstThursday.getTime()) / 86400000 -
        3 +
        ((firstThursday.getDay() + 6) % 7)) /
        7,
    );
  return `${target.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const required = ['post', 'shot', 'attempt', 'credits', 'accepted'];
  const missing = required.filter((k) => !(k in args));
  if (missing.length) {
    console.error(`Missing required flag(s): ${missing.map((m) => `--${m}`).join(', ')}`);
    console.error(
      'Usage: npm run log -- --post <post_id> --shot <shot_id> --attempt <n> --credits <n> --accepted <true|false> [--reason <text>] [--clip <file>]',
    );
    process.exit(1);
  }

  const now = new Date();
  const row = [
    now.toISOString(),
    isoWeek(now),
    args.post,
    args.shot,
    args.attempt,
    args.credits,
    args.accepted,
    args.reason ?? '',
    args.clip ?? '',
  ]
    .map(csvField)
    .join(',');

  if (!existsSync(CSV_PATH)) {
    await writeFile(CSV_PATH, HEADER + '\n');
  } else {
    const firstLine = (await readFile(CSV_PATH, 'utf8')).split('\n')[0];
    if (firstLine !== HEADER) {
      console.error(`${CSV_PATH} has an unexpected header: "${firstLine}"`);
      console.error(`Expected: "${HEADER}"`);
      process.exit(1);
    }
  }

  await appendFile(CSV_PATH, row + '\n');
  console.log(`✓ appended to ${CSV_PATH}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
});
