import { hashApiKey, type ApiKeysRepo, type UserOrgsRepo } from '@signal-studio/db/repos';
import type { Context, Next } from 'hono';

import type { AuthVariables } from './api-key.ts';

/**
 * P5.1 — every route the dashboard's new feature modules use needs to
 * accept *either* credential: an `api_keys` bearer token (CI/automation,
 * the only kind `/jobs` etc. accepted before this pass) or a real Supabase
 * Auth access token (the dashboard's own login, new this pass — see
 * `supabase-auth.ts`'s own header for why org resolution works this way
 * instead of a JWT `org_id` claim). Tries the API-key lookup first (a
 * single local hash + one DB read, no network call) before falling back to
 * the Supabase verification (a real HTTP round-trip) — cheaper credential
 * first, not because one is more "correct" than the other.
 */
export type CombinedAuthDeps = {
  apiKeysRepo: ApiKeysRepo;
  engineSupabaseUrl: string;
  engineSupabaseAnonKey: string;
  userOrgsRepo: UserOrgsRepo;
  fetchFn?: typeof fetch;
};

export function combinedAuth(deps: CombinedAuthDeps) {
  const fetchFn = deps.fetchFn ?? fetch;
  return async (c: Context<{ Variables: AuthVariables & { userId?: string } }>, next: Next) => {
    const header = c.req.header('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
    if (!token) return c.json({ error: 'Missing Authorization: Bearer <token>' }, 401);

    const apiKeyRow = await deps.apiKeysRepo.findByHash(hashApiKey(token));
    if (apiKeyRow) {
      c.set('orgId', apiKeyRow.org_id);
      await next();
      return;
    }

    const res = await fetchFn(`${deps.engineSupabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: deps.engineSupabaseAnonKey },
    });
    if (!res.ok) return c.json({ error: 'Invalid or expired credential' }, 401);
    const user = (await res.json()) as { id: string };

    const orgId = await deps.userOrgsRepo.getOrgIdForUser(user.id);
    if (!orgId) return c.json({ error: 'This account is not assigned to an org yet' }, 403);

    c.set('orgId', orgId);
    c.set('userId', user.id);
    await next();
  };
}
