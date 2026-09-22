/**
 * Minimal `--flag value` / `--flag=value` / `--boolean-flag` parser — the
 * CLI's flag surface is small and fixed, so a dependency (yargs/commander)
 * wasn't worth adding for it. `--flag` with no following value (or one that
 * starts with `--`) is treated as boolean `true`.
 */
export function parseFlags(argv: string[]): Record<string, string | boolean> {
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    if (eq !== -1) {
      flags[arg.slice(2, eq)] = arg.slice(eq + 1);
      continue;
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = true;
    }
  }
  return flags;
}

export function requireFlag(flags: Record<string, string | boolean>, name: string): string {
  const value = flags[name];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Missing required flag: --${name}`);
  }
  return value;
}
