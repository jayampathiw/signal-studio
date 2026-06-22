import { createClient } from '@supabase/supabase-js';
import { env } from '@signal-studio/config';

let _client = null;
let _serviceClient = null;

export function getClient() {
  if (!_client) {
    _client = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
  }
  return _client;
}

// Service role client bypasses RLS — use only in server-side pipeline code, never in dashboard.
export function getServiceClient() {
  if (!_serviceClient) {
    _serviceClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  }
  return _serviceClient;
}
