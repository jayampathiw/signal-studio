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

export interface ContentItem {
  id: number;
  channel_key: string;
  niche: string;
  style: 'factual' | 'cinematic' | 'listicle' | 'silent';
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
  status: 'pending' | 'rendering' | 'rendered' | 'publishing' | 'posted' | 'failed' | 'blocked';
  target_platforms: string[];
  fb_status: string | null; fb_post_id: string | null; fb_posted_at: string | null; fb_error: string | null;
  ig_status: string | null; ig_post_id: string | null; ig_posted_at: string | null; ig_error: string | null;
  yt_status: string | null; yt_video_id: string | null; yt_posted_at: string | null; yt_error: string | null;
  tt_status: string | null; tt_video_id: string | null; tt_posted_at: string | null; tt_error: string | null;
  created_at: string;
  updated_at: string;
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
}
