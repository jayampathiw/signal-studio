import { Component, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ArticleWithMetrics, PostMetric, SupabaseService } from '../core/supabase.service';

const INTERVAL_TAGS: Array<PostMetric['interval_tag']> = ['+1h', '+24h', '+7d'];

const FLAG: Record<string, string> = { FR: '🇫🇷', IT: '🇮🇹', AU: '🇦🇺', SE: '🇸🇪' };

@Component({
  selector: 'app-metrics',
  standalone: true,
  imports: [DatePipe, RouterLink],
  template: `
    <!-- ── Navbar ── -->
    <nav class="ink-navbar" style="display:flex;align-items:center;justify-content:space-between;padding:0 16px;height:52px;">
      <div style="display:flex;align-items:center;gap:10px;">
        <span class="sig sig-trending" style="width:9px;height:9px;"></span>
        <span style="font-family:'Playfair Display',serif;font-weight:900;font-size:18px;letter-spacing:.06em;color:var(--ink-text);">SIGNAL</span>
        <span style="font-size:10px;color:var(--ink-text-3);letter-spacing:.12em;text-transform:uppercase;">Metrics</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <a routerLink="/articles" style="font-size:11px;font-weight:600;color:var(--ink-text-2);text-decoration:none;padding:4px 10px;border-radius:4px;border:1px solid var(--ink-border);">← Articles</a>
      </div>
    </nav>

    <div style="max-width:960px;margin:0 auto;padding:20px 12px 64px;">

      <!-- Header -->
      <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:20px;">
        <h1 style="font-family:'Playfair Display',serif;font-size:20px;font-weight:900;color:var(--ink-text);margin:0;">Post Metrics</h1>
        <span style="font-size:11px;font-family:'JetBrains Mono',monospace;color:var(--ink-text-3);">{{ articles().length }} posts</span>
        <button class="btn-ink" style="margin-left:auto;height:30px;font-size:12px;padding:0 12px;" (click)="load()" [disabled]="loading()">Refresh</button>
      </div>

      <!-- Loading -->
      @if (loading()) {
        <div style="display:flex;flex-direction:column;align-items:center;gap:16px;padding:80px 20px;color:var(--ink-text-3);">
          <span class="loading loading-spinner" style="color:var(--ink-brand);width:28px;height:28px;"></span>
          <p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;">Loading metrics…</p>
        </div>
      }

      <!-- Error -->
      @if (loadError()) {
        <div style="padding:20px;background:rgba(255,54,54,.08);border:1px solid rgba(255,54,54,.2);border-radius:8px;color:var(--ink-breaking);font-size:13px;">
          {{ loadError() }}
        </div>
      }

      <!-- Legend -->
      @if (!loading() && !loadError() && articles().length > 0) {
        <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:12px;font-size:11px;color:var(--ink-text-3);">
          <span>❤ reactions</span>
          <span>💬 comments</span>
          <span>↗ shares</span>
          <span>👁 impressions</span>
          <span style="color:var(--ink-text-2);">— = not yet captured</span>
        </div>
      }

      <!-- Table -->
      @if (!loading() && !loadError()) {

        @if (articles().length === 0) {
          <div style="display:flex;flex-direction:column;align-items:center;gap:12px;padding:80px 20px;color:var(--ink-text-3);">
            <div style="font-size:32px;opacity:.3;">◎</div>
            <p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;">No posted articles with metrics yet</p>
            <p style="font-size:12px;color:var(--ink-text-3);max-width:360px;text-align:center;">Apply migration 008 and let the hourly scraper run, or trigger it manually.</p>
          </div>
        } @else {

          <!-- Desktop column headers -->
          <div class="hidden sm:grid" style="grid-template-columns:1fr 90px 1fr 1fr 1fr;gap:0;padding:8px 16px;background:var(--ink-raised);border-radius:6px;margin-bottom:6px;">
            <span style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-text-3);">Article</span>
            <span style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-text-3);">Posted</span>
            @for (tag of intervalTags; track tag) {
              <span style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-text-3);text-align:center;">{{ tag }}</span>
            }
          </div>

          <div style="display:flex;flex-direction:column;gap:4px;">
            @for (article of articles(); track article.id) {
              <div style="background:var(--ink-surface);border:1px solid var(--ink-border);border-radius:8px;padding:12px 16px;transition:background .15s;"
                   onmouseenter="this.style.background='var(--ink-raised)'" onmouseleave="this.style.background='var(--ink-surface)'">

                <!-- Mobile layout -->
                <div class="sm:hidden">
                  <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
                    <span style="font-size:13px;">{{ flag(article.country) }}</span>
                    <span style="font-size:11px;font-weight:600;color:var(--ink-text-2);">{{ article.source }}</span>
                    <span style="font-size:10px;font-family:'JetBrains Mono',monospace;color:var(--ink-text-3);margin-left:auto;">{{ article.posted_at | date:'dd MMM HH:mm' }}</span>
                  </div>
                  <p style="font-size:12px;font-weight:500;color:var(--ink-text);margin:0 0 10px;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">{{ article.title }}</p>
                  <div style="display:flex;gap:6px;flex-wrap:wrap;">
                    @for (tag of intervalTags; track tag) {
                      <div style="flex:1;min-width:80px;background:var(--ink-raised);border-radius:6px;padding:6px 8px;text-align:center;">
                        <div style="font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-text-3);margin-bottom:4px;">{{ tag }}</div>
                        <div style="font-size:11px;color:var(--ink-text-2);">{{ metricSummary(article, tag) }}</div>
                      </div>
                    }
                  </div>
                </div>

                <!-- Desktop layout -->
                <div class="hidden sm:grid" style="grid-template-columns:1fr 90px 1fr 1fr 1fr;gap:0;align-items:center;">
                  <div style="padding-right:12px;">
                    <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
                      <span>{{ flag(article.country) }}</span>
                      <span style="font-size:11px;color:var(--ink-text-2);">{{ article.source }}</span>
                    </div>
                    <p style="font-size:12px;font-weight:500;color:var(--ink-text);margin:0;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">{{ article.title }}</p>
                  </div>
                  <span style="font-size:10px;font-family:'JetBrains Mono',monospace;color:var(--ink-text-3);">{{ article.posted_at | date:'dd MMM' }}<br>{{ article.posted_at | date:'HH:mm' }}</span>
                  @for (tag of intervalTags; track tag) {
                    <div style="text-align:center;padding:0 4px;">
                      <div [style]="metricCellStyle(article, tag)" style="font-size:11px;font-family:'JetBrains Mono',monospace;line-height:1.6;">
                        {{ metricSummary(article, tag) }}
                      </div>
                      @if (getSnapshot(article, tag); as snap) {
                        <div style="font-size:10px;color:var(--ink-text-3);margin-top:2px;">👁 {{ snap.impressions ?? '—' }}</div>
                      }
                    </div>
                  }
                </div>

              </div>
            }
          </div>
        }
      }

    </div>
  `,
})
export class MetricsComponent implements OnInit {
  articles  = signal<ArticleWithMetrics[]>([]);
  loading   = signal(true);
  loadError = signal<string | null>(null);

  readonly intervalTags = INTERVAL_TAGS;

  constructor(private supabase: SupabaseService) {}

  ngOnInit() { this.load(); }

  async load() {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const data = await this.supabase.getArticlesWithMetrics(60);
      this.articles.set(data);
    } catch (err: any) {
      this.loadError.set(err.message ?? 'Failed to load metrics');
    } finally {
      this.loading.set(false);
    }
  }

  flag(country: string) { return FLAG[country] ?? '🌍'; }

  getSnapshot(article: ArticleWithMetrics, tag: PostMetric['interval_tag']): PostMetric | null {
    return article.post_metrics?.find(m => m.interval_tag === tag) ?? null;
  }

  metricSummary(article: ArticleWithMetrics, tag: PostMetric['interval_tag']): string {
    const snap = this.getSnapshot(article, tag);
    if (!snap) return '—';
    const r = snap.reactions_total ?? '?';
    const c = snap.comments        ?? '?';
    const s = snap.shares          ?? '?';
    return `❤ ${r} · 💬 ${c} · ↗ ${s}`;
  }

  metricCellStyle(article: ArticleWithMetrics, tag: PostMetric['interval_tag']): string {
    const snap = this.getSnapshot(article, tag);
    if (!snap) return 'color:var(--ink-text-3)';
    const total = (snap.reactions_total ?? 0) + (snap.comments ?? 0) + (snap.shares ?? 0);
    if (total >= 100) return 'color:var(--ink-standard);font-weight:600';
    if (total >= 20)  return 'color:var(--ink-trending)';
    return 'color:var(--ink-text-2)';
  }
}
