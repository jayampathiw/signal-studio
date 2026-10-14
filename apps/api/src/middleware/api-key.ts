import { hashApiKey, type ApiKeysRepo } from '@signal-studio/db/repos';
import type { Context, Next } from 'hono';

export type AuthVariables = { orgId: string };

/**
 * P2.7 — API-key middleware: `Authorization: Bearer <key>` → hash → look up
 * in `api_keys` (never the raw key — see that table's migration header) →
 * `c.set('orgId', ...)` for every downstream handler. A missing/invalid/
 * revoked key gets a flat 401, deliberately not distinguishing "wrong key"
 * from "revoked key" in the response body (nothing a caller should be able
 * to probe for).
 */
export function apiKeyAuth(apiKeysRepo: ApiKeysRepo) {
  return async (c: Context<{ Variables: AuthVariables }>, next: Next) => {
    const header = c.req.header('authorization');
    const rawKey = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
    if (!rawKey) return c.json({ error: 'Missing Authorization: Bearer <key>' }, 401);

    const row = await apiKeysRepo.findByHash(hashApiKey(rawKey));
    if (!row) return c.json({ error: 'Invalid or revoked API key' }, 401);

    c.set('orgId', row.org_id);
    await next();
  };
}
