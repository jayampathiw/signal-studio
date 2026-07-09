import { Injectable, NgZone } from '@angular/core';
import { createClient, SupabaseClient, User, Session } from '@supabase/supabase-js';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Article {
  id: string;
  title: string;
  source: string;
  url: string;
  summary: string | null;
  country: string;
  status: 'pending' | 'approved' | 'rejected' | 'posted' | 'failed' | 'blocked' | 'manual_review';
  criticality: 'breaking' | 'alert' | 'trending' | 'standard';
  priority_score: number;
  published_at: string | null;
  posted_at: string | null;
  created_at: string;
  ai_caption: { intro: string; question: string; cta: string } | null;
  fb_post_id: string | null;
  seo_title: string | null;
  seo_description: string | null;
  image_prompt: string | null;
  formatted_image_prompt: string | null;
  image_headline: string | null;
  seed_comment: string | null;
  seed_comment_template_id: string | null;
  story_category: string | null;
  boost_eligible: boolean;
  content_signals: {
    binary_frame?: boolean;
    poll_fit_score?: number;
    protagonist_named?: string | null;
    best_format?: 'post' | 'carousel' | 'reel';
    fr_it_stake_first_sentence?: boolean;
    pillar_hint?: string | null;
    identity_mode?: 'ORGOGLIO' | 'RESILIENZA' | 'DIBATTITO' | 'PATRIMONIO' | 'FIERTÉ' | 'RÉSISTANCE' | 'DÉBAT' | 'PATRIMOINE' | null;
  } | null;
  source_type?: 'news' | 'historical';
  historical_topic_id?: string | null;
  cluster_id: number | null;
  cluster_size: number;
  pillar: string | null;
  publish_score: number | null;
  editorial_score: number | null;
  generated_image_url: string | null;
  tags?: string[];
  hashtags?: string[];
  recommended_format?: 'image' | 'video' | 'poll' | 'carousel' | null;
  post_format?: 'image' | 'video' | 'poll' | 'carousel' | null;
  editor_notes?: string | null;
  reel_path: string | null;
  reel_duration: number | null;
}

export interface AnalyzedArticle {
  title: string;
  url: string;
  summary: string;
  source: string;
  criticality: 'breaking' | 'alert' | 'trending' | 'standard';
  priority_score: number;
  policy_flags: string[];
  suggested_angle: string | null;
  tags: string[];
  pillar: string | null;
}

export interface PostMetric {
  id: number;
  article_id: string;
  fb_post_id: string;
  snapshot_at: string;
  interval_tag: '+1h' | '+24h' | '+7d';
  impressions: number | null;
  engaged_users: number | null;
  reactions_total: number | null;
  reactions_like: number | null;
  reactions_love: number | null;
  reactions_anger: number | null;
  reactions_haha: number | null;
  reactions_wow: number | null;
  reactions_sad: number | null;
  comments: number | null;
  shares: number | null;
  clicks: number | null;
}

export interface ArticleWithMetrics extends Article {
  post_metrics: PostMetric[];
}

export interface ArticleFilters {
  country?: string;
  status?: string;
  criticality?: string;
  sortBy?: 'created_at' | 'priority_score' | 'published_at';
  sortDir?: 'asc' | 'desc';
}

export interface ArticleStats {
  pending: number;
  approved: number;
  rejected: number;
  posted: number;
  failed: number;
  blocked: number;
  manual_review: number;
  total: number;
}

export interface OnThisDayEvent {
  year: number;
  title: string;
  summary: string;
  image_prompt: string;
  image_url: string | null;
}

export interface OnThisDayPost {
  id: string;
  country: string;
  post_date: string;
  title: string;
  events: OnThisDayEvent[];
  ai_caption: { intro: string; question: string; cta: string } | null;
  hashtags: string[];
  status: 'pending' | 'posted' | 'failed';
  fb_post_id: string | null;
  posted_at: string | null;
  created_at: string;
}

// ── Longform ──────────────────────────────────────────────────────────────────

export type LongformStatus =
  | 'brief' | 'storyboard' | 'scripting' | 'awaiting_script_approval'
  | 'seeding' | 'awaiting_refs' | 'awaiting_stills'
  | 'rendering' | 'rendered' | 'awaiting_final_approval'
  | 'publishing' | 'posted' | 'failed' | 'blocked';

export interface LongformProject {
  id: number;
  channel_key: string;
  title: string | null;
  description: string | null;
  status: LongformStatus;
  status_note: string | null;
  rendered_video_url: string | null;
  audio_plan: any | null;
  seo: { title: string; description: string; hashtags: string[] } | null;
  scenes: ContentItemScene[] | null;
  created_at: string;
  updated_at: string;
}

export interface ContentClip {
  id: number;
  project_id: number;
  scene_n: number;
  kind: 'clip' | 'still' | 'text_card' | 'editor_build';
  title: string | null;
  visual_prompt: string | null;
  vo_text: string | null;
  audio_cue: string | null;
  text_overlay: string | null;
  duration_sec: number | null;
  reference_keys: string[];
  clip_url: string | null;
  vo_url: string | null;
  status: string;
  fail_reason: string | null;
  created_at: string;
}

export interface AudioPlanSegment {
  act: number;
  from_sec: number;
  to_sec: number;
  track: string;
  gain_db: number;
}

export type StillStatus = 'pending' | 'generating' | 'generated' | 'validating' | 'passed' | 'failed' | 'blocked';
export type StillCut = 'A' | 'B' | 'C' | 'D';

export interface ContentStill {
  id: number;
  project_id: number;
  scene_n: number;
  cut: StillCut;
  act: number | null;
  prompt: string | null;
  motion: string;
  image_source: string;
  clip_url: string | null;
  status: StillStatus;
  retry_count: number;
  fail_reason: string | null;
  created_at: string;
  updated_at: string;
}

export const LONGFORM_CHANNEL_KEYS = ['football/documentary/EN'];

export interface GenConfig {
  imageModel?: string;
  videoModel?: string;
  imageRes?: string;
  videoRes?: string;
  aspectRatio?: string;
  duration?: number;
}

export interface ContentItemScene {
  scene_num: number;
  duration_sec?: number;
  scenario?: number;
  transition?: string;
  scene_status?: string;
  image_prompt?: string;
  video_prompt?: Record<string, any>;
  storyboard_url?: string | null;
  start_frame_url?: string | null;
  clip_url?: string | null;
  final_frame_url?: string | null;
  higgsfield_image_job?: string | null;
  higgsfield_video_job?: string | null;
  vision_check?: { status: string; score: number; attempts: number; issues: string[] } | null;
}

export interface ContentItem {
  id: number;
  channel_key: string;
  niche: string;
  style: 'factual' | 'cinematic' | 'listicle' | 'silent' | 'intimacy';
  language: string;
  source_type: string;
  source_clips: any[];
  source_query: string | null;
  title: string | null;
  description: string | null;
  narration_script: string | null;
  ai_caption: { intro: string; question: string; cta: string } | null;
  hashtags: string[];
  rendered_video_url: string | null;
  rendered_local_path: string | null;
  rendered_at: string | null;
  duration_sec: number | null;
  thumbnail_url: string | null;
  status: 'brief' | 'storyboard' | 'generating' | 'pending' | 'rendering' | 'rendered' | 'publishing' | 'posted' | 'failed' | 'blocked';
  status_note: string | null;
  target_platforms: string[];
  fb_status: string | null; fb_post_id: string | null; fb_posted_at: string | null; fb_error: string | null;
  ig_status: string | null; ig_post_id: string | null; ig_posted_at: string | null; ig_error: string | null;
  yt_status: string | null; yt_video_id: string | null; yt_posted_at: string | null; yt_error: string | null;
  tt_status: string | null; tt_video_id: string | null; tt_posted_at: string | null; tt_error: string | null;
  created_at: string;
  updated_at: string;
  // Wild Eye / video pipeline fields
  scenes: ContentItemScene[] | null;
  seo: { title: string; description: string; hashtags: string[] } | null;
  slot: string | null;
  format: '11s' | '21s' | 'portrait' | null;
  gen_config: GenConfig | null;
}

export interface ContentItemStats {
  total: number;
  pending: number;
  rendering: number;
  rendered: number;
  posting: number;
  posted: number;
  failed: number;
  blocked: number;
}

export interface RenderQueueStats {
  queued: number;
  processing: number;
}

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private client: SupabaseClient;
  private _user = new BehaviorSubject<User | null>(null);

  user$ = this._user.asObservable();

  constructor(private zone: NgZone) {
    this.client = createClient(environment.supabaseUrl, environment.supabaseAnonKey);
    this.client.auth.onAuthStateChange((_event, session) => {
      this.zone.run(() => this._user.next(session?.user ?? null));
    });
    this.client.auth.getSession().then(({ data }) => {
      this._user.next(data.session?.user ?? null);
    });
  }

  async getSession(): Promise<Session | null> {
    const { data } = await this.client.auth.getSession();
    return data.session;
  }

  async signIn(email: string, password: string) {
    return this.client.auth.signInWithPassword({ email, password });
  }

  async signOut() {
    return this.client.auth.signOut();
  }

  async getArticles(filters: ArticleFilters = {}): Promise<Article[]> {
    const sortBy = filters.sortBy ?? 'created_at';
    const ascending = filters.sortDir === 'asc';
    const batchSize = 1000;
    const allData: Article[] = [];
    let from = 0;

    while (true) {
      let query = this.client
        .from('articles')
        .select('*')
        .order(sortBy, { ascending })
        .range(from, from + batchSize - 1);

      if (filters.country) query = query.eq('country', filters.country);
      if (filters.status) query = query.eq('status', filters.status);
      if (filters.criticality) query = query.eq('criticality', filters.criticality);

      const { data, error } = await query;
      if (error) throw error;
      if (!data || data.length === 0) break;
      allData.push(...(data as Article[]));
      if (data.length < batchSize) break;
      from += batchSize;
    }

    return allData;
  }

  async getStats(): Promise<ArticleStats> {
    const statuses: Array<keyof ArticleStats> = ['pending', 'approved', 'rejected', 'posted', 'failed', 'blocked', 'manual_review'];
    const stats: ArticleStats = { pending: 0, approved: 0, rejected: 0, posted: 0, failed: 0, blocked: 0, manual_review: 0, total: 0 };
    await Promise.all(statuses.map(async (s) => {
      const { count } = await this.client
        .from('articles')
        .select('*', { count: 'exact', head: true })
        .eq('status', s);
      (stats[s] as number) = count ?? 0;
      stats.total += count ?? 0;
    }));
    return stats;
  }

  async updateArticleFields(id: string, fields: Partial<Article>) {
    const { error } = await this.client.from('articles').update(fields).eq('id', id);
    if (error) throw error;
  }

  async updateArticleStatus(id: string, status: Article['status']) {
    const { error } = await this.client.from('articles').update({ status }).eq('id', id);
    if (error) throw error;
  }

  async deleteArticle(id: string) {
    const { error } = await this.client.from('articles').delete().eq('id', id);
    if (error) throw error;
  }

  async deleteArticles(ids: string[]) {
    const { error } = await this.client.from('articles').delete().in('id', ids);
    if (error) throw error;
  }

  async updateArticlesStatus(ids: string[], status: Article['status']) {
    const { error } = await this.client.from('articles').update({ status }).in('id', ids);
    if (error) throw error;
  }

  async postToFacebook(articleIds: string[]): Promise<{
    results: { id: string; success: boolean; fb_post_id?: string; error?: string }[];
  }> {
    const session = await this.getSession();
    const token = session?.access_token ?? environment.supabaseAnonKey;
    const res = await fetch(`${environment.supabaseUrl}/functions/v1/post-to-facebook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': environment.supabaseAnonKey,
      },
      body: JSON.stringify({ article_ids: articleIds }),
    });
    if (!res.ok) throw new Error(`Post to Facebook error: ${await res.text()}`);
    return res.json();
  }

  async getArticlesWithMetrics(limit = 50): Promise<ArticleWithMetrics[]> {
    const { data, error } = await this.client
      .from('articles')
      .select('id, title, source, country, posted_at, fb_post_id, post_metrics(*)')
      .eq('status', 'posted')
      .not('fb_post_id', 'is', null)
      .order('posted_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map(a => ({ ...a, post_metrics: a.post_metrics ?? [] })) as unknown as ArticleWithMetrics[];
  }

  async generateImage(articleId: string): Promise<{ url: string }> {
    const session = await this.getSession();
    const token = session?.access_token ?? environment.supabaseAnonKey;
    const res = await fetch(`${environment.supabaseUrl}/functions/v1/generate-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': environment.supabaseAnonKey,
      },
      body: JSON.stringify({ article_id: articleId }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(body.error ?? `Image generation failed (${res.status})`);
    }
    return res.json();
  }

  async insertArticle(article: Partial<Article>): Promise<void> {
    const { error } = await this.client.from('articles').insert(article);
    if (error) throw error;
  }

  async getContentItems(): Promise<ContentItem[]> {
    const { data, error } = await this.client
      .from('content_items')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as ContentItem[];
  }

  async getContentItemStats(): Promise<ContentItemStats> {
    const statuses: Array<keyof Omit<ContentItemStats, 'total'>> = ['pending', 'rendering', 'rendered', 'posting', 'posted', 'failed', 'blocked'];
    const stats: ContentItemStats = { total: 0, pending: 0, rendering: 0, rendered: 0, posting: 0, posted: 0, failed: 0, blocked: 0 };
    await Promise.all(statuses.map(async s => {
      const { count } = await this.client.from('content_items').select('*', { count: 'exact', head: true }).eq('status', s);
      (stats[s] as number) = count ?? 0;
      stats.total += count ?? 0;
    }));
    return stats;
  }

  async updateContentItemStatus(id: number, status: ContentItem['status'], extra: Record<string, any> = {}): Promise<void> {
    const { error } = await this.client.from('content_items').update({ status, ...extra }).eq('id', id);
    if (error) throw error;
  }

  async deleteContentItem(id: number): Promise<void> {
    const { error } = await this.client.from('content_items').delete().eq('id', id);
    if (error) throw error;
  }

  async deleteContentItems(ids: number[]): Promise<void> {
    const { error } = await this.client.from('content_items').delete().in('id', ids);
    if (error) throw error;
  }

  async getRenderQueueStats(): Promise<RenderQueueStats> {
    const [q, p] = await Promise.all([
      this.client.from('render_queue').select('*', { count: 'exact', head: true }).eq('status', 'queued'),
      this.client.from('render_queue').select('*', { count: 'exact', head: true }).eq('status', 'processing'),
    ]);
    return { queued: q.count ?? 0, processing: p.count ?? 0 };
  }

  async triggerGeneration(contentItemId: number): Promise<{ dispatched: boolean; runUrl: string | null; channelSlug: string }> {
    const session = await this.getSession();
    const token = session?.access_token ?? environment.supabaseAnonKey;
    const res = await fetch(`${environment.supabaseUrl}/functions/v1/trigger-generation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': environment.supabaseAnonKey,
      },
      body: JSON.stringify({ content_item_id: contentItemId }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(body.error ?? `trigger-generation failed (${res.status})`);
    }
    return res.json();
  }

  async expandBrief(contentItemId: number): Promise<{ scenes: ContentItemScene[]; status: string }> {
    const session = await this.getSession();
    const token = session?.access_token ?? environment.supabaseAnonKey;
    const res = await fetch(`${environment.supabaseUrl}/functions/v1/expand-brief`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': environment.supabaseAnonKey,
      },
      body: JSON.stringify({ content_item_id: contentItemId }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(body.error ?? `expand-brief failed (${res.status})`);
    }
    return res.json();
  }

  async updateContentItemScenes(id: number, scenes: ContentItemScene[]): Promise<void> {
    const { error } = await this.client.from('content_items').update({ scenes }).eq('id', id);
    if (error) throw error;
  }

  async updateContentItemFields(id: number, fields: Record<string, any>): Promise<void> {
    const { error } = await this.client.from('content_items').update(fields).eq('id', id);
    if (error) throw error;
  }

  // Channel-level ("page") generation defaults. Precedence at generation time:
  // reel gen_config → channel_configs.config (this) → channels.js code default.
  async getChannelConfig(channelKey: string): Promise<GenConfig | null> {
    const { data, error } = await this.client
      .from('channel_configs').select('config').eq('channel_key', channelKey).maybeSingle();
    if (error) throw error;
    return (data?.config as GenConfig) ?? null;
  }

  async upsertChannelConfig(channelKey: string, config: GenConfig): Promise<void> {
    const { error } = await this.client
      .from('channel_configs')
      .upsert({ channel_key: channelKey, config, updated_at: new Date().toISOString() }, { onConflict: 'channel_key' });
    if (error) throw error;
  }

  async queueRender(channelKey: string): Promise<void> {
    const { error } = await this.client.from('render_queue').insert({ channel_key: channelKey });
    if (error) throw error;
  }

  async analyzeUpload(rawText: string, country: string): Promise<{ articles: AnalyzedArticle[] }> {
    const session = await this.getSession();
    const token = session?.access_token ?? environment.supabaseAnonKey;
    const res = await fetch(`${environment.supabaseUrl}/functions/v1/analyze-upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': environment.supabaseAnonKey,
      },
      body: JSON.stringify({ rawText, country }),
    });
    if (!res.ok) throw new Error(`Analysis failed: ${await res.text()}`);
    return res.json();
  }

  async generateCaptions(articleIds: string[]): Promise<{ processed: number; results: { id: string; seo_title: string }[]; errors?: { id: string; error: string }[] }> {
    const session = await this.getSession();
    const token = session?.access_token ?? environment.supabaseAnonKey;
    const url = `${environment.supabaseUrl}/functions/v1/generate-caption`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': environment.supabaseAnonKey,
      },
      body: JSON.stringify({ article_ids: articleIds }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Edge Function error: ${text}`);
    }
    return res.json();
  }

  async getOnThisDayPosts(country?: string): Promise<OnThisDayPost[]> {
    let q = this.client
      .from('on_this_day_posts')
      .select('*')
      .order('post_date', { ascending: false });
    if (country) q = q.eq('country', country);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as OnThisDayPost[];
  }

  async deleteOnThisDayPost(id: string): Promise<void> {
    const { error } = await this.client.from('on_this_day_posts').delete().eq('id', id);
    if (error) throw error;
  }

  async updateOnThisDayEvents(postId: string, events: OnThisDayEvent[]): Promise<void> {
    const { error } = await this.client
      .from('on_this_day_posts')
      .update({ events })
      .eq('id', postId);
    if (error) throw error;
  }

  async uploadOnThisDayEventImage(postId: string, eventIndex: number, dataUrl: string): Promise<string> {
    const base64 = dataUrl.split(',')[1];
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const path = `on-this-day/${postId}/event-${eventIndex + 1}.png`;
    const { error } = await this.client.storage
      .from('article-images')
      .upload(path, bytes, { contentType: 'image/png', upsert: true });
    if (error) throw error;
    return `${environment.supabaseUrl}/storage/v1/object/public/article-images/${path}`;
  }

  async queueOnThisDay(country: string, dates: string[]): Promise<{
    results: { date: string; success: boolean; post_id?: string; events_count?: number; skipped?: boolean; error?: string }[];
  }> {
    const session = await this.getSession();
    const token = session?.access_token ?? environment.supabaseAnonKey;
    const res = await fetch(`${environment.supabaseUrl}/functions/v1/queue-on-this-day`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': environment.supabaseAnonKey,
      },
      body: JSON.stringify({ country, dates }),
    });
    if (!res.ok) throw new Error(`Queue On This Day error: ${await res.text()}`);
    return res.json();
  }

  async postOnThisDay(postId: string): Promise<{ success: boolean; fb_post_id?: string; error?: string }> {
    const session = await this.getSession();
    const token = session?.access_token ?? environment.supabaseAnonKey;
    const res = await fetch(`${environment.supabaseUrl}/functions/v1/post-on-this-day`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': environment.supabaseAnonKey,
      },
      body: JSON.stringify({ post_id: postId }),
    });
    if (!res.ok) throw new Error(`Post On This Day error: ${await res.text()}`);
    return res.json();
  }

  // ── Longform ───────────────────────────────────────────────────────────────

  async getLongformProjects(): Promise<LongformProject[]> {
    const { data, error } = await this.client
      .from('content_items')
      .select('id, channel_key, title, description, status, status_note, rendered_video_url, audio_plan, seo, created_at, updated_at')
      .in('channel_key', LONGFORM_CHANNEL_KEYS)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as LongformProject[];
  }

  async getLongformByChannel(channelKey: string): Promise<LongformProject[]> {
    const { data, error } = await this.client
      .from('content_items')
      .select('id, channel_key, title, description, status, status_note, rendered_video_url, audio_plan, seo, created_at, updated_at')
      .eq('channel_key', channelKey)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as LongformProject[];
  }

  async updateLongformStatus(id: number, status: string): Promise<void> {
    const { error } = await this.client
      .from('content_items')
      .update({ status })
      .eq('id', id);
    if (error) throw error;
  }

  async createLongformProject(channelKey: string, title: string): Promise<LongformProject> {
    const { data, error } = await this.client
      .from('content_items')
      .insert({ channel_key: channelKey, title, status: 'brief' })
      .select('id, channel_key, title, description, status, status_note, rendered_video_url, audio_plan, seo, scenes, created_at, updated_at')
      .single();
    if (error) throw error;
    return data as LongformProject;
  }

  async getLongformProject(id: number): Promise<LongformProject | null> {
    const { data, error } = await this.client
      .from('content_items')
      .select('id, channel_key, title, description, status, status_note, rendered_video_url, audio_plan, seo, scenes, created_at, updated_at')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data as LongformProject | null;
  }

  async getContentStills(projectId: number): Promise<ContentStill[]> {
    const { data, error } = await this.client
      .from('content_stills')
      .select('*')
      .eq('project_id', projectId)
      .order('scene_n', { ascending: true })
      .order('cut', { ascending: true });
    if (error) throw error;
    return (data ?? []) as ContentStill[];
  }

  async getContentClips(projectId: number): Promise<ContentClip[]> {
    const { data, error } = await this.client
      .from('content_clips')
      .select('id, project_id, scene_n, kind, title, visual_prompt, vo_text, audio_cue, text_overlay, duration_sec, reference_keys, clip_url, vo_url, status, fail_reason, created_at')
      .eq('project_id', projectId)
      .order('scene_n', { ascending: true });
    if (error) throw error;
    return (data ?? []) as ContentClip[];
  }

  async updateAudioPlan(projectId: number, audioPlan: AudioPlanSegment[]): Promise<void> {
    const { error } = await this.client
      .from('content_items')
      .update({ audio_plan: audioPlan })
      .eq('id', projectId);
    if (error) throw error;
  }

  async presignStillUpload(projectId: number, sceneN: number, cut: string, filename: string, contentType?: string): Promise<{ upload_url: string; public_url: string; key: string }> {
    const session = await this.getSession();
    const token = session?.access_token ?? environment.supabaseAnonKey;
    const res = await fetch(`${environment.supabaseUrl}/functions/v1/upload-still`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': environment.supabaseAnonKey,
      },
      body: JSON.stringify({ action: 'presign', project_id: projectId, scene_n: sceneN, cut, filename, content_type: contentType }),
    });
    const body = await res.json().catch(() => ({ error: res.statusText }));
    if (!res.ok) throw new Error(body.error ?? `presign failed (${res.status})`);
    return body;
  }

  async confirmStillUpload(projectId: number, sceneN: number, cut: string, publicUrl: string): Promise<{ id: number; clip_url: string }> {
    const session = await this.getSession();
    const token = session?.access_token ?? environment.supabaseAnonKey;
    const res = await fetch(`${environment.supabaseUrl}/functions/v1/upload-still`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': environment.supabaseAnonKey,
      },
      body: JSON.stringify({ action: 'confirm', project_id: projectId, scene_n: sceneN, cut, public_url: publicUrl }),
    });
    const body = await res.json().catch(() => ({ error: res.statusText }));
    if (!res.ok) throw new Error(body.error ?? `confirm failed (${res.status})`);
    return body;
  }

  async triggerLongform(projectId: number, stage: string): Promise<{ dispatched: boolean; runUrl: string | null }> {
    const session = await this.getSession();
    const token = session?.access_token ?? environment.supabaseAnonKey;
    const res = await fetch(`${environment.supabaseUrl}/functions/v1/trigger-longform`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': environment.supabaseAnonKey,
      },
      body: JSON.stringify({ project_id: projectId, stage }),
    });
    const body = await res.json().catch(() => ({ error: res.statusText }));
    if (!res.ok) throw new Error(body.error ?? `trigger-longform failed (${res.status})`);
    return body;
  }

  async importShotlist(projectId: number, shotlistText: string): Promise<{
    ok: boolean; title: string | null; target_duration_sec: number | null;
    scenes_total: number; stills_inserted: number; stills_skipped: number; clips_upserted: number;
  }> {
    const session = await this.getSession();
    const token = session?.access_token ?? environment.supabaseAnonKey;
    const res = await fetch(`${environment.supabaseUrl}/functions/v1/import-shotlist`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': environment.supabaseAnonKey,
      },
      body: JSON.stringify({ project_id: projectId, shotlist_text: shotlistText }),
    });
    const body = await res.json().catch(() => ({ error: res.statusText }));
    if (!res.ok) throw new Error(body.error ?? `import-shotlist failed (${res.status})`);
    return body;
  }
}
