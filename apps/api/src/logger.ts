import pino from 'pino';

/**
 * P4.3 — `apps/api` had no structured logger at all before this pass (just
 * one `console.error` startup banner in `index.ts`). Same shape and same
 * real-pino-to-stdout reasoning as `apps/worker/src/logger.ts`'s own header
 * — kept as its own small file rather than a shared package, matching this
 * repo's existing per-app-owns-its-small-utilities convention (neither app
 * depends on the other).
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
