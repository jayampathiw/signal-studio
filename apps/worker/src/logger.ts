import pino from 'pino';

/**
 * P2.5/P4.3 — `--log-level` + JSON-logs support for the `ss` CLI, real
 * pino under the hood for JSON mode (P4.3's own bullet: "pino JSON →
 * stdout"). Text mode (the default, for a human at a terminal) is
 * unchanged from P2.5 — plain `console.error` (stderr), matching CLAUDE.md's
 * "No console.log in production paths — console.error for errors".
 *
 * **JSON mode is a deliberate, scoped exception to that same rule**: real
 * pino writes NDJSON to **stdout**, not stderr, because that's what a
 * container's log collector (`docker logs`, P4.2's own deployment) expects
 * from a service's structured logs — CLAUDE.md's console rule targets
 * stray debug prints in application code, not the one sanctioned
 * structured-logging path this file exists to be. `run-job.yml`'s CI logs
 * and `ss worker`'s real production logging both use `--json` for exactly
 * this reason.
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
  const level = opts.level ?? 'info';

  if (opts.json) {
    const p = pino({ level });
    // pino's own call order is `(mergingObject, msg)` — the reverse of
    // this file's `(message, meta)` — wrapped here so every real call
    // site across `apps/worker` (dozens of them) needed no change.
    return {
      debug: (message, meta) => p.debug(meta ?? {}, message),
      info: (message, meta) => p.info(meta ?? {}, message),
      warn: (message, meta) => p.warn(meta ?? {}, message),
      error: (message, meta) => p.error(meta ?? {}, message),
    };
  }

  const threshold = LOG_LEVELS.indexOf(level);
  function write(lvl: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (LOG_LEVELS.indexOf(lvl) < threshold) return;
    console.error(`[${lvl}] ${message}${meta ? ' ' + JSON.stringify(meta) : ''}`);
  }
  return {
    debug: (message, meta) => write('debug', message, meta),
    info: (message, meta) => write('info', message, meta),
    warn: (message, meta) => write('warn', message, meta),
    error: (message, meta) => write('error', message, meta),
  };
}
