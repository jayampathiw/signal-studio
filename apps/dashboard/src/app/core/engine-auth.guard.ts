import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { EngineApiService } from './engine-api.service';
import { EngineAuthService } from './engine-auth.service';

/**
 * P5.1 — the /engine/* console's own guard, separate from `authGuard`
 * (the legacy news/video project's session check). A valid engine session
 * isn't enough by itself: it also has to resolve to a real org via
 * `GET /me` (backed by `user_orgs` — see `combined-auth.ts`'s header) or
 * the account isn't provisioned for the console yet, distinct from "not
 * logged in at all".
 */
export const engineAuthGuard: CanActivateFn = async () => {
  const auth = inject(EngineAuthService);
  const api = inject(EngineApiService);
  const router = inject(Router);

  const session = await auth.getSession();
  if (!session) return router.createUrlTree(['/engine/login']);

  try {
    await api.me();
    return true;
  } catch {
    await auth.signOut();
    return router.createUrlTree(['/engine/login']);
  }
};
