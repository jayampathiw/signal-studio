import { createHash, randomBytes } from 'node:crypto';

import type { SupabaseClient } from '@supabase/supabase-js';

export type ApiKeyRow = {
  id: string;
  org_id: string;
  name: string;
  key_hash: string;
  created_at: string;
  revoked_at: string | null;
};

export function hashApiKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

export class ApiKeysRepo {
  private client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  // Returns the raw key exactly once — only its hash is ever persisted
  // (see 20260922090000_api_keys.sql's own header). Caller must show/copy it
  // immediately; there's no way to recover it later.
  async create(orgId: string, name: string): Promise<{ row: ApiKeyRow; rawKey: string }> {
    const rawKey = `sk_${randomBytes(24).toString('hex')}`;
    const { data, error } = await this.client
      .from('api_keys')
      .insert({ org_id: orgId, name, key_hash: hashApiKey(rawKey) })
      .select()
      .single();
    if (error) throw new Error(`ApiKeysRepo.create: ${error.message}`);
    return { row: data as ApiKeyRow, rawKey };
  }

  // Used by the API-key auth middleware — looks up by hash, not the raw
  // key, and only ever returns a non-revoked row.
  async findByHash(keyHash: string): Promise<ApiKeyRow | null> {
    const { data, error } = await this.client
      .from('api_keys')
      .select()
      .eq('key_hash', keyHash)
      .is('revoked_at', null)
      .maybeSingle();
    if (error) throw new Error(`ApiKeysRepo.findByHash: ${error.message}`);
    return data as ApiKeyRow | null;
  }

  async revoke(id: string): Promise<void> {
    const { error } = await this.client
      .from('api_keys')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(`ApiKeysRepo.revoke: ${error.message}`);
  }
}
