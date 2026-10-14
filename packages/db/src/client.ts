import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * The engine's own Supabase client — a distinct **dev** project from the
 * legacy `nnxtvbolhuvihlpwppbj` one apps/video (here) and apps/news (now in
 * signal-studio-workspace, P0.5) use (per P1.5,
 * prod stays untouched until P4). Reads ENGINE_SUPABASE_URL/
 * ENGINE_SUPABASE_SERVICE_ROLE_KEY rather than the existing SUPABASE_URL/
 * SUPABASE_SERVICE_ROLE_KEY to avoid any chance of a repo pointing at the
 * wrong database by accident.
 */
export function createEngineClient(): SupabaseClient {
  const url = process.env.ENGINE_SUPABASE_URL;
  const key = process.env.ENGINE_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'ENGINE_SUPABASE_URL and ENGINE_SUPABASE_SERVICE_ROLE_KEY must be set to use @signal-studio/db (dev Supabase project, not the legacy one).',
    );
  }
  return createClient(url, key);
}
