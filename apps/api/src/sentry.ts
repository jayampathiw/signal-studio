import * as Sentry from '@sentry/node';

/**
 * P4.3 — real Sentry SDK, gated behind `SENTRY_DSN`. `undefined` (not a
 * no-op function) when unset, same "genuinely inactive, not a silently-
 * discarding stand-in" convention `deps.ts`'s own `pingHealthcheck` already
 * established for Healthchecks.io — a deployment with no Sentry project
 * yet behaves exactly as before this pass.
 */
export type ReportError = (err: unknown, context?: Record<string, unknown>) => void;

export function createErrorReporter(dsn: string | undefined): ReportError | undefined {
  if (!dsn) return undefined;
  Sentry.init({ dsn });
  return (err, context) => {
    Sentry.captureException(err, context ? { extra: context } : undefined);
  };
}
