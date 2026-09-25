import type { Logger } from '../logger.ts';

/**
 * P4.3 — `ss digest --org <id>`: a daily summary of failed/awaiting/
 * delivered job counts, plus GitHub Actions minutes used this billing
 * cycle when a token with the real `user` scope is available (the plan's
 * own bullet). Sent to Telegram and/or email — **both wired, gated
 * independently behind their own env vars**, matching this pass's earlier
 * "wired but inactive until real credentials exist" convention
 * (Healthchecks.io ping, Sentry). Never fails the whole digest because one
 * channel's credentials are missing or its send failed — each channel is
 * attempted and logged independently; the counts themselves are always
 * logged too, so the digest's own real content is never silently lost
 * even with zero channels configured.
 *
 * **GitHub Actions minutes — real endpoint, verified live, not guessed**:
 * `GET /users/{username}/settings/billing/actions` — there is no per-repo
 * Actions-minutes endpoint, only user/org/enterprise-level ones. An initial
 * web search suggested `/users/{username}/billing/actions` (no `settings/`
 * segment); checking it for real via `gh api` showed that's a genuinely
 * wrong path (404 even authenticated), while this one returns a real 403
 * "Resource not accessible by personal access token" whose own
 * `documentation_url` confirms it's the correct endpoint — just needs a
 * classic PAT with the `user` scope, which `GITHUB_PAT` (scoped for
 * `workflow_dispatch`) may not have. Best-effort: a failure here just
 * omits that one line from the digest, logged as a warning, not fatal.
 */

export type DigestCounts = { failed: number; awaitingReview: number; delivered: number };

export function formatDigest(counts: DigestCounts, actionsMinutesUsed: number | null): string {
  const lines = [
    'signal-studio daily digest',
    `  failed: ${counts.failed}`,
    `  awaiting review: ${counts.awaitingReview}`,
    `  delivered: ${counts.delivered}`,
  ];
  if (actionsMinutesUsed !== null) {
    lines.push(`  GitHub Actions minutes used (this cycle): ${actionsMinutesUsed}`);
  }
  return lines.join('\n');
}

export type DigestOptions = { orgId: string };

export type DigestDeps = {
  countsByStatus: (orgId: string) => Promise<DigestCounts>;
  // Omitted (not no-op'd) when GITHUB_PAT/GITHUB_REPO_OWNER aren't set to
  // construct a real call — see this file's own header for the endpoint.
  getActionsMinutesUsed?: () => Promise<number>;
  // Each omitted (not no-op'd) when its own channel's credentials aren't
  // configured — `deps.ts`'s real wiring, not this file, decides that.
  sendTelegram?: (text: string) => Promise<void>;
  sendEmail?: (subject: string, text: string) => Promise<void>;
};

export async function digestCommand(
  opts: DigestOptions,
  deps: DigestDeps,
  logger: Logger,
): Promise<void> {
  const counts = await deps.countsByStatus(opts.orgId);

  let actionsMinutesUsed: number | null = null;
  if (deps.getActionsMinutesUsed) {
    try {
      actionsMinutesUsed = await deps.getActionsMinutesUsed();
    } catch (err) {
      logger.warn('digest: could not fetch GitHub Actions minutes used, omitting from digest', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const text = formatDigest(counts, actionsMinutesUsed);
  logger.info('digest computed', { ...counts, actionsMinutesUsed });

  let sent = false;
  if (deps.sendTelegram) {
    try {
      await deps.sendTelegram(text);
      sent = true;
      logger.info('digest sent via Telegram');
    } catch (err) {
      logger.error('digest: Telegram send failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  if (deps.sendEmail) {
    try {
      await deps.sendEmail('signal-studio daily digest', text);
      sent = true;
      logger.info('digest sent via email');
    } catch (err) {
      logger.error('digest: email send failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  if (!sent) {
    logger.info(
      'digest: no delivery channel configured (TELEGRAM_BOT_TOKEN/SMTP_* unset) — logged only',
    );
  }
}
