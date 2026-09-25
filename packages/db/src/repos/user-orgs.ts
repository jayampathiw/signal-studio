import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * P5.1 — maps a Supabase Auth user id (the dashboard's login identity) to
 * exactly one org. `apps/api`'s Supabase-token auth middleware reads this
 * with the service-role client (bypassing RLS) after verifying the token
 * against `/auth/v1/user`, since the API itself decides org scope — it
 * never trusts a client-supplied org id.
 */
export class UserOrgsRepo {
  private client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  async getOrgIdForUser(userId: string): Promise<string | null> {
    const { data, error } = await this.client
      .from('user_orgs')
      .select('org_id')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new Error(`UserOrgsRepo.getOrgIdForUser: ${error.message}`);
    return (data as { org_id: string } | null)?.org_id ?? null;
  }

  async assign(userId: string, orgId: string): Promise<void> {
    const { error } = await this.client
      .from('user_orgs')
      .upsert({ user_id: userId, org_id: orgId }, { onConflict: 'user_id' });
    if (error) throw new Error(`UserOrgsRepo.assign: ${error.message}`);
  }
}
