import type { SupabaseClient } from '@supabase/supabase-js';

export type Org = {
  id: string;
  slug: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export class OrgsRepo {
  private client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  async create(slug: string, name: string): Promise<Org> {
    const { data, error } = await this.client.from('orgs').insert({ slug, name }).select().single();
    if (error) throw new Error(`OrgsRepo.create: ${error.message}`);
    return data as Org;
  }

  async getBySlug(slug: string): Promise<Org | null> {
    const { data, error } = await this.client.from('orgs').select().eq('slug', slug).maybeSingle();
    if (error) throw new Error(`OrgsRepo.getBySlug: ${error.message}`);
    return data as Org | null;
  }
}
