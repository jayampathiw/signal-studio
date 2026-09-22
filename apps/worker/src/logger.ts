/**
 * P2.5 — minimal `--log-level` + JSON-logs support for the `ss` CLI. Always
 * writes to stderr via `console.error` regardless of level (per CLAUDE.md:
 * "No console.log in production paths — console.error for errors"; this
 * is production code, not a CLI-progress script like the pilot bridge's
 * `projects/assemblex-factory/pilot/scripts/**`, which the repo's own
 * eslint config exempts for exactly that reason). Text mode is for a human
 * at a terminal; JSON mode (`--json`) is what `run-job.yml`'s CI logs use.
 */

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export type Logger = {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
};

export function createLogger(opts: { level?: LogLevel; json?: boolean } = {}): Logger {
  const threshold = LOG_LEVELS.indexOf(opts.level ?? 'info');

  function write(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (LOG_LEVELS.indexOf(level) < threshold) return;
    if (opts.json) {
      console.error(JSON.stringify({ ts: new Date().toISOString(), level, message, ...meta }));
    } else {
      console.error(`[${level}] ${message}${meta ? ' ' + JSON.stringify(meta) : ''}`);
    }
  }

  return {
    debug: (message, meta) => write('debug', message, meta),
    info: (message, meta) => write('info', message, meta),
    warn: (message, meta) => write('warn', message, meta),
    error: (message, meta) => write('error', message, meta),
  };
}
