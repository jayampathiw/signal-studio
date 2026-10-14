import type { ProjectT } from '@signal-studio/core/schemas';
import type { SupabaseClient } from '@supabase/supabase-js';

export type ProjectRow = {
  id: string;
  org_id: string;
  slug: string;
  config: ProjectT;
  created_at: string;
  updated_at: string;
};

export class ProjectsRepo {
  private client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  async upsert(orgId: string, slug: string, config: ProjectT): Promise<ProjectRow> {
    const { data, error } = await this.client
      .from('projects')
      .upsert({ org_id: orgId, slug, config }, { onConflict: 'org_id,slug' })
      .select()
      .single();
    if (error) throw new Error(`ProjectsRepo.upsert: ${error.message}`);
    return data as ProjectRow;
  }

  async getBySlug(orgId: string, slug: string): Promise<ProjectRow | null> {
    const { data, error } = await this.client
      .from('projects')
      .select()
      .eq('org_id', orgId)
      .eq('slug', slug)
      .maybeSingle();
    if (error) throw new Error(`ProjectsRepo.getBySlug: ${error.message}`);
    return data as ProjectRow | null;
  }

  // P2.5 addition: `ss run-job` resolves a job's project by `JobRow.project_id`
  // (the DB foreign key), not by slug — this repo had no lookup for that
  // until run-job needed one.
  async getById(projectId: string): Promise<ProjectRow | null> {
    const { data, error } = await this.client
      .from('projects')
      .select()
      .eq('id', projectId)
      .maybeSingle();
    if (error) throw new Error(`ProjectsRepo.getById: ${error.message}`);
    return data as ProjectRow | null;
  }

  // P5.2 addition — the dashboard's own Projects list needs every project
  // for the caller's org; nothing before this needed "all of them", only
  // one at a time by slug or id.
  async listByOrg(orgId: string): Promise<ProjectRow[]> {
    const { data, error } = await this.client
      .from('projects')
      .select()
      .eq('org_id', orgId)
      .order('slug', { ascending: true });
    if (error) throw new Error(`ProjectsRepo.listByOrg: ${error.message}`);
    return data as ProjectRow[];
  }

  // P5.2 addition — the brand-kit editor's save action. `config` is the
  // caller's already-`Project.parse()`-validated replacement, not a patch —
  // partial jsonb merges invite a client silently dropping fields it
  // doesn't render yet, which this schema's `additionalProperties: false`
  // shape makes especially easy to get wrong.
  async updateConfig(orgId: string, slug: string, config: ProjectT): Promise<ProjectRow> {
    const { data, error } = await this.client
      .from('projects')
      .update({ config, updated_at: new Date().toISOString() })
      .eq('org_id', orgId)
      .eq('slug', slug)
      .select()
      .single();
    if (error) throw new Error(`ProjectsRepo.updateConfig: ${error.message}`);
    return data as ProjectRow;
  }
}
