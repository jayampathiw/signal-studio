import { Component, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { Article, ArticleStats, SupabaseService } from '../core/supabase.service';
import { ArticleDetailComponent } from './article-detail-dialog.component';
import {
  bestSlotForArticle, bestSlotIntent, slotIntent,
  slotIntentLabel, slotToIST, type SlotIntent,
} from '../core/slot-matcher';

const COUNTRIES = ['FR', 'IT', 'AU', 'SE'];
const CRITICALITIES = ['breaking', 'alert', 'trending', 'standard'];

const TAG_DISPLAY_ORDER = ['off_target', 'patriotic', 'health', 'justice', 'prices', 'region', 'sport', 'social'];
const TAG_CHIPS_PER_ROW = 3;

const COUNTRY_NAMES: Record<string, string> = { FR: 'France', IT: 'Italy', AU: 'Australia', SE: 'Sweden' };

@Component({
  selector: 'app-article-list',
  standalone: true,
  imports: [DatePipe, ArticleDetailComponent, RouterLink],
  template: `
    <!-- ── Navbar ── -->
    <nav class="ink-navbar" style="display:flex;align-items:center;justify-content:space-between;padding:0 16px;height:52px;">
      <div style="display:flex;align-items:center;gap:10px;">
        <span class="sig sig-breaking" style="width:9px;height:9px;"></span>
        <span style="font-family:'Playfair Display',serif;font-weight:900;font-size:18px;letter-spacing:.06em;color:var(--ink-text);">SIGNAL</span>
        <span class="hidden sm:inline" style="font-size:10px;color:var(--ink-text-3);letter-spacing:.12em;text-transform:uppercase;">Console</span>
        <a routerLink="/metrics" style="font-size:11px;font-weight:600;color:var(--ink-brand);text-decoration:none;padding:3px 8px;border-radius:4px;background:var(--ink-brand-glow);letter-spacing:.05em;">Metrics</a>
        <a routerLink="/upload" style="font-size:11px;font-weight:600;color:var(--ink-standard);text-decoration:none;padding:3px 8px;border-radius:4px;background:rgba(0,204,112,.1);letter-spacing:.05em;">⬆ Upload</a>
        <a routerLink="/reels" style="font-size:11px;font-weight:600;color:var(--ink-text-2);text-decoration:none;padding:3px 8px;border-radius:4px;background:var(--ink-raised);letter-spacing:.05em;">▶ Reels</a>
        <a routerLink="/on-this-day" style="font-size:11px;font-weight:600;color:#b47828;text-decoration:none;padding:3px 8px;border-radius:4px;background:rgba(180,120,40,0.12);letter-spacing:.05em;">📅 On This Day</a>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <span class="hidden sm:inline" style="font-size:11px;color:var(--ink-text-3);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{{ userEmail() }}</span>
        <button class="btn-theme" (click)="toggleTheme()" [title]="isDark() ? 'Switch to light mode' : 'Switch to dark mode'">
          {{ isDark() ? '☀' : '🌙' }}
        </button>
        <button class="btn-ink" style="height:30px;font-size:12px;padding:0 12px;" (click)="signOut()">Sign out</button>
      </div>
    </nav>

    <!-- ── Country strip ── -->
    <div class="country-strip">
      <button class="country-pill" [class.active]="filterCountry() === ''" (click)="setCountry('')">
        🌍 <span>All</span>
      </button>
      @for (c of countries; track c) {
        <button [class]="countryPillClass(c)" (click)="setCountry(c)">
          {{ countryFlag(c) }} <span>{{ countryName(c) }}</span>
        </button>
      }
    </div>

    <!-- ── Country accent wrapper ── -->
    <div [class]="countryAccentClass()" style="min-height:calc(100vh - 92px);">
      <div style="max-width:900px;margin:0 auto;padding:16px 12px 64px;">

        <!-- ── Stats row ── -->
        @if (stats()) {
          <div class="scrollbar-none" style="display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;margin-bottom:16px;">
            <button class="stat-card" [class.active]="filterStatus() === ''" (click)="filterByStatus('')">
              <div style="font-size:26px;font-weight:700;line-height:1;color:var(--ink-text);">{{ stats()!.total }}</div>
              <div style="font-size:10px;letter-spacing:.07em;text-transform:uppercase;color:var(--ink-text-2);margin-top:5px;">Total</div>
            </button>
            <button class="stat-card" [class.active]="filterStatus() === 'pending'" (click)="filterByStatus('pending')">
              <div style="font-size:26px;font-weight:700;line-height:1;color:var(--ink-alert);">{{ stats()!.pending }}</div>
              <div style="font-size:10px;letter-spacing:.07em;text-transform:uppercase;color:var(--ink-text-2);margin-top:5px;">Pending</div>
            </button>
            <button class="stat-card" [class.active]="filterStatus() === 'posted'" (click)="filterByStatus('posted')">
              <div style="font-size:26px;font-weight:700;line-height:1;color:var(--ink-trending);">{{ stats()!.posted }}</div>
              <div style="font-size:10px;letter-spacing:.07em;text-transform:uppercase;color:var(--ink-text-2);margin-top:5px;">Posted</div>
            </button>
            <button class="stat-card" [class.active]="filterStatus() === 'blocked'" (click)="filterByStatus('blocked')">
              <div style="font-size:26px;font-weight:700;line-height:1;color:var(--ink-breaking);">{{ stats()!.blocked ?? 0 }}</div>
              <div style="font-size:10px;letter-spacing:.07em;text-transform:uppercase;color:var(--ink-text-2);margin-top:5px;">Blocked</div>
            </button>
            <button class="stat-card" [class.active]="filterStatus() === 'failed'" (click)="filterByStatus('failed')">
              <div style="font-size:26px;font-weight:700;line-height:1;color:var(--ink-text-2);">{{ stats()!.failed }}</div>
              <div style="font-size:10px;letter-spacing:.07em;text-transform:uppercase;color:var(--ink-text-2);margin-top:5px;">Failed</div>
            </button>
            <button class="stat-card" [class.active]="filterStatus() === 'manual_review'" (click)="filterByStatus('manual_review')">
              <div style="font-size:26px;font-weight:700;line-height:1;color:var(--ink-standard);">{{ stats()!.manual_review ?? 0 }}</div>
              <div style="font-size:10px;letter-spacing:.07em;text-transform:uppercase;color:var(--ink-text-2);margin-top:5px;">Review</div>
            </button>
          </div>
        }

        <!-- ── Top articles picker ── -->
        @if (filterCountry()) {
          <div style="margin-bottom:14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <button class="btn-brand" style="height:34px;font-size:12px;padding:0 14px;gap:6px;" (click)="toggleTopPicks()">
              🏆 {{ topPicksOnly() ? 'Showing' : 'Show' }} top articles for {{ countryName(filterCountry()) }}
            </button>
            @if (topPicksOnly()) {
              <span style="font-size:11px;font-family:'JetBrains Mono',monospace;color:var(--ink-text-3);">top {{ topPicksCount }} by score</span>
              <button class="ink-badge" style="cursor:pointer;opacity:.6;" (click)="toggleTopPicks()">✕ Clear</button>
            }
          </div>
        }

        <!-- ── Filter bar ── -->
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;align-items:center;">
          <div style="position:relative;flex:1;min-width:160px;">
            <svg style="position:absolute;left:10px;top:50%;transform:translateY(-50%);width:13px;height:13px;color:var(--ink-text-3);pointer-events:none;flex-shrink:0;" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/>
            </svg>
            <input type="text" class="ink-input" style="padding-left:32px;" placeholder="Search articles…"
              [value]="filterSearch()" (input)="filterSearch.set($any($event.target).value); resetPage()" />
          </div>
          <select class="ink-select" style="min-width:105px;" [value]="filterCriticality()" (change)="filterCriticality.set($any($event.target).value); resetPage()">
            <option value="">All Levels</option>
            @for (c of criticalities; track c) { <option [value]="c">{{ c }}</option> }
          </select>
          <select class="ink-select" style="min-width:120px;" [value]="filterCategory()" (change)="filterCategory.set($any($event.target).value); resetPage()">
            <option value="">All Categories</option>
            <option value="Politique">Politique</option>
            <option value="Société">Société</option>
            <option value="Sport">Sport</option>
            <option value="Culture">Culture</option>
            <option value="International">International</option>
            <option value="Santé">Santé</option>
            <option value="Environnement">Environnement</option>
          </select>
          <select class="ink-select" style="min-width:120px;" [value]="filterSource()" (change)="filterSource.set($any($event.target).value); resetPage()">
            <option value="">All Sources</option>
            <option value="news">📰 News</option>
            <option value="historical">🏛️ Historical</option>
          </select>
          <button class="btn-ink" style="height:36px;gap:5px;flex-shrink:0;" (click)="load()">
            <svg style="width:13px;height:13px;flex-shrink:0;" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clip-rule="evenodd"/>
            </svg>
            <span class="hidden sm:inline">Refresh</span>
          </button>
        </div>

        <!-- ── Tag chips ── -->
        <div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center;margin-bottom:8px;">
          <span style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-text-3);flex-shrink:0;">Tags:</span>
          @for (tag of availableTags; track tag.value) {
            <button [class]="tagChipClass(tag.value)" (click)="toggleTagFilter(tag.value)">{{ tag.label }}</button>
          }
          @if (filterTags().length > 0) {
            <button class="ink-badge" style="cursor:pointer;opacity:.55;" (click)="filterTags.set([]); resetPage()">✕ Clear</button>
          }
        </div>

        <!-- Sort + count row -->
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;flex-wrap:wrap;">
          <span style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-text-3);">Sort:</span>
          <button
            style="padding:3px 8px;border-radius:4px;cursor:pointer;border:none;font-size:11px;font-family:'Outfit',sans-serif;font-weight:500;transition:all .15s;"
            [style.background]="sortField()==='publish_score' ? 'rgba(99,102,241,.15)' : 'transparent'"
            [style.color]="sortField()==='publish_score' ? 'var(--ink-brand)' : 'var(--ink-text-2)'"
            (click)="setSort('publish_score')"
          >Score {{ sortIcon('publish_score') }}</button>
          <button
            style="padding:3px 8px;border-radius:4px;cursor:pointer;border:none;font-size:11px;font-family:'Outfit',sans-serif;font-weight:500;transition:all .15s;"
            [style.background]="sortField()==='created_at' ? 'rgba(99,102,241,.15)' : 'transparent'"
            [style.color]="sortField()==='created_at' ? 'var(--ink-brand)' : 'var(--ink-text-2)'"
            (click)="setSort('created_at')"
          >Date {{ sortIcon('created_at') }}</button>
          <span style="font-size:11px;font-family:'JetBrains Mono',monospace;color:var(--ink-text-3);">{{ totalItems() }} article{{ totalItems() !== 1 ? 's' : '' }}</span>
        </div>

        <!-- ── Batch bar ── -->
        @if (selectedIds().length > 0) {
          <div class="batch-bar">
            <span style="font-size:13px;font-weight:600;color:var(--ink-brand);">{{ selectedIds().length }} selected</span>
            <button class="btn-brand" style="gap:5px;" [disabled]="generating()" (click)="generateSelected()">
              @if (generating()) { <span class="loading loading-spinner loading-xs"></span> }
              ✦ Generate
            </button>
            <button class="btn-brand" style="gap:5px;" [disabled]="posting()" (click)="batchPostToFacebook()">
              @if (posting()) { <span class="loading loading-spinner loading-xs"></span> }
              📤 Post to Facebook
            </button>
            <button class="btn-brand" style="background:var(--ink-trending);" (click)="markSelectedPosted()">✓ Mark Posted</button>
            <button class="btn-reject" (click)="deleteSelected()">Delete</button>
            <button class="btn-ink" style="margin-left:auto;" (click)="selectedIds.set([])">✕ Clear</button>
          </div>
        }

        <!-- ── Loading ── -->
        @if (loading()) {
          <div style="display:flex;flex-direction:column;align-items:center;gap:16px;padding:80px 20px;color:var(--ink-text-3);">
            <span class="loading loading-spinner" style="color:var(--ink-brand);width:28px;height:28px;"></span>
            <p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;">Loading signals…</p>
          </div>
        }

        <!-- ── Article list ── -->
        @if (!loading()) {

          @if (pagedArticles().length === 0) {
            <div class="empty-state">
              <div style="font-size:36px;letter-spacing:.2em;opacity:.3;">◎</div>
              <p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;">No signals match the current filters</p>
            </div>
          } @else {
            <div>

              <!-- Desktop column header -->
              <div class="hidden sm:flex ink-surface" style="align-items:center;gap:12px;padding:8px 16px;background:var(--ink-raised);margin-bottom:8px;">
                <div style="width:24px;flex-shrink:0;" (click)="$event.stopPropagation()">
                  <input type="checkbox" class="checkbox checkbox-xs" [checked]="allPageSelected()" (change)="toggleAll()" />
                </div>
                <button style="width:52px;flex-shrink:0;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-text-3);text-align:right;background:none;border:none;cursor:pointer;padding:0;font-family:'Outfit',sans-serif;" (click)="setSort('publish_score')">
                  Score {{ sortIcon('publish_score') }}
                </button>
                <span style="flex:1;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-text-3);">Article</span>
                <button style="width:80px;flex-shrink:0;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-text-3);text-align:right;background:none;border:none;cursor:pointer;padding:0;font-family:'Outfit',sans-serif;" (click)="setSort('created_at')">
                  Date {{ sortIcon('created_at') }}
                </button>
                <span style="width:56px;flex-shrink:0;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-text-3);text-align:right;">Act.</span>
              </div>

              <div style="display:flex;flex-direction:column;gap:6px;">
                @for (article of pagedArticles(); track article.id) {
                  <div
                    class="article-row"
                    [id]="'article-' + article.id"
                    [class.selected]="isSelected(article.id)"
                    [style.border-left-color]="critColor(article.criticality)"
                    [style.background-color]="criticalityTintBg(article)"
                    [style.opacity]="rowOpacity(article)"
                    (click)="openDetail(article)"
                  >
                    <!-- Checkbox -->
                    <div style="flex-shrink:0;width:24px;padding-top:1px;" (click)="$event.stopPropagation()">
                      <input type="checkbox" class="checkbox checkbox-sm" [checked]="isSelected(article.id)" (change)="toggleSelect(article.id)" />
                    </div>

                    <!-- Score col (desktop) -->
                    <div class="hidden sm:flex" style="width:52px;flex-shrink:0;flex-direction:column;align-items:flex-end;gap:4px;">
                      <span style="font-size:13px;font-family:'JetBrains Mono',monospace;font-weight:700;color:var(--ink-text);">
                        {{ article.publish_score?.toFixed(0) ?? '—' }}
                      </span>
                      @if (article.ai_caption) {
                        <span class="ink-badge ib-ai" style="font-size:9px;">AI ✓</span>
                      }
                    </div>

                    <!-- Content -->
                    <div style="flex:1;min-width:0;">
                      <!-- Mobile badges -->
                      <div class="flex sm:hidden" style="align-items:center;gap:4px;flex-wrap:wrap;margin-bottom:4px;">
                        <span class="ink-badge" style="background:var(--ink-raised);color:var(--ink-text-2);">{{ countryFlag(article.country) }} {{ article.country }}</span>
                        <span [class]="'ink-badge ' + statusBadgeClass(article.status)">{{ article.status }}</span>
                      </div>
                      <p style="font-size:13px;font-weight:500;line-height:1.45;color:var(--ink-text);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">{{ article.title }}</p>
                      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:5px;font-size:11px;color:var(--ink-text-2);">
                        <span>{{ article.source }}</span>
                        <span style="color:var(--ink-text-3);">·</span>
                        <span>{{ countryFlag(article.country) }} {{ article.country }}</span>
                        <span class="hidden sm:inline" style="color:var(--ink-text-3);">·</span>
                        <span [class]="'ink-badge ' + criticalityBadgeClass(article.criticality)" style="font-size:9px;text-transform:uppercase;letter-spacing:.05em;" [title]="'Criticality: ' + article.criticality">{{ criticalityLabel(article.criticality) }}</span>
                        @if (article.source_type === 'historical') {
                          <span class="ink-badge" style="font-size:9px;background:rgba(180,120,40,0.15);color:#b47828;letter-spacing:.05em;" title="Historical / anniversary story">🏛️ {{ article.country === 'IT' ? 'STORIA' : 'HISTOIRE' }}</span>
                        }
                        <span [class]="'hidden sm:inline ink-badge ' + statusBadgeClass(article.status)">{{ article.status }}</span>
                        @if (article.status === 'pending' && articleBestSlot(article)) {
                          <span [class]="'ink-badge ' + intentBadgeClass(articleSlotIntent(article))" style="font-size:9px;" [title]="'Best slot for this article based on identity mode + criticality'">{{ articleSlotLabel(article) }}</span>
                        }
                        <span style="margin-left:auto;font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--ink-text-3);">{{ article.created_at | date:'dd MMM' }}</span>
                      </div>
                      @if (visibleTags(article).length > 0) {
                        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:5px;">
                          @for (tag of visibleTags(article); track tag) {
                            <span [class]="'ink-badge ' + tagBadgeClass(tag)">{{ tagLabel(tag) }}</span>
                          }
                          @if (extraTagCount(article) > 0) {
                            <span class="ink-badge" style="background:var(--ink-raised);color:var(--ink-text-2);">+{{ extraTagCount(article) }}</span>
                          }
                        </div>
                      }
                      @if ((article.cluster_size ?? 1) >= 3) {
                        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px;">
                          <span class="ink-badge ib-alert" title="{{ article.cluster_size }} sources covering this story">🔗 ×{{ article.cluster_size }}</span>
                        </div>
                      }
                    </div>

                    <!-- Actions -->
                    <div style="flex-shrink:0;display:flex;flex-direction:column;gap:4px;" (click)="$event.stopPropagation()">
                      <button class="btn-ghost-icon" title="Generate AI content" [disabled]="generating()" (click)="generateOne(article)">✦</button>
                      <button class="btn-ghost-icon danger" title="Delete" (click)="deleteOne(article)">✕</button>
                    </div>
                  </div>
                }
              </div>
            </div>

            <!-- Pagination -->
            @if (totalItems() > pageSize) {
              <div style="display:flex;align-items:center;justify-content:center;gap:16px;padding-top:16px;">
                <button class="btn-ink" style="height:32px;padding:0 12px;font-size:12px;" [disabled]="currentPage() === 0" (click)="prevPage()">← Prev</button>
                <span style="font-size:12px;font-family:'JetBrains Mono',monospace;color:var(--ink-text-2);">{{ pageStart() }}–{{ pageEnd() }} / {{ totalItems() }}</span>
                <button class="btn-ink" style="height:32px;padding:0 12px;font-size:12px;" [disabled]="currentPage() >= totalPages() - 1" (click)="nextPage()">Next →</button>
              </div>
            }
          }
        }

      </div>
    </div>

    <!-- ── Detail overlay ── -->
    @if (selectedArticle()) {
      <div style="position:fixed;inset:0;z-index:50;" class="animate-fade-in">
        <div style="position:absolute;inset:0;background:rgba(0,0,0,.7);backdrop-filter:blur(8px);" (click)="selectedArticle.set(null)"></div>
        <div class="detail-panel" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:min(700px,calc(100vw - 24px));max-height:90vh;border-radius:12px;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.06);display:flex;flex-direction:column;">
          <app-article-detail
            [article]="selectedArticle()!"
            (closePanel)="selectedArticle.set(null)"
            (articleUpdated)="onArticleUpdated($event)"
          ></app-article-detail>
        </div>
      </div>
    }

    <!-- ── Toast ── -->
    @if (toast()) {
      <div class="ink-toast">
        <div [class]="'toast-msg ' + (toast()!.ok ? 'toast-ok' : 'toast-err')">
          {{ toast()!.ok ? '✓' : '✗' }} {{ toast()!.msg }}
        </div>
      </div>
    }
  `,
})
export class ArticleListComponent implements OnInit, OnDestroy {
  private _allArticles = signal<Article[]>([]);
  loading     = signal(true);
  generating  = signal(false);
  posting     = signal(false);
  isDark      = signal(true);
  stats       = signal<ArticleStats | null>(null);
  userEmail   = signal('');
  selectedArticle = signal<Article | null>(null);
  toast       = signal<{ msg: string; ok: boolean } | null>(null);

  filterSearch      = signal('');
  filterCountry     = signal('');
  filterStatus      = signal('');
  filterCriticality = signal('');
  filterTags        = signal<string[]>([]);
  filterCategory    = signal('');
  filterSource      = signal('');
  topPicksOnly      = signal(false);
  readonly topPicksCount = 8;
  sortField  = signal('publish_score');
  sortDir    = signal<'asc' | 'desc'>('desc');
  currentPage = signal(0);
  selectedIds = signal<string[]>([]);

  readonly pageSize = 25;
  countries    = COUNTRIES;
  criticalities = CRITICALITIES;

  readonly availableTags = [
    { value: 'off_target', label: '⛔ Off-target' },
    { value: 'patriotic',  label: '🏆 Patriotic' },
    { value: 'health',     label: '⚠️ Health' },
    { value: 'justice',    label: '⚖️ Justice' },
    { value: 'prices',     label: '💰 Prices' },
    { value: 'region',     label: '🌍 Region' },
    { value: 'sport',      label: '⚽ Sport' },
    { value: 'social',     label: '👥 Social' },
  ];

  filteredSorted = computed(() => {
    let items = [...this._allArticles()];
    const q = this.filterSearch().toLowerCase();
    if (q) items = items.filter(a => a.title.toLowerCase().includes(q) || a.source.toLowerCase().includes(q) || a.id.toLowerCase().includes(q));
    const country = this.filterCountry();
    const status  = this.filterStatus();
    const crit    = this.filterCriticality();
    if (country) items = items.filter(a => a.country === country);
    if (status)  items = items.filter(a => a.status === status);
    if (crit)    items = items.filter(a => a.criticality === crit);
    const tags = this.filterTags();
    if (tags.length > 0) {
      items = items.filter(a => tags.some(tag => a.tags?.includes(tag)));
    }
    const category = this.filterCategory();
    if (category) items = items.filter(a => a.story_category === category);
    const source = this.filterSource();
    if (source) items = items.filter(a => (a.source_type ?? 'news') === source);
    const topOnly = this.topPicksOnly();
    if (topOnly) items = items.filter(a => a.status === 'pending');

    const field = this.sortField();
    const dir = this.sortDir() === 'asc' ? 1 : -1;
    const numericFields = ['priority_score', 'editorial_score', 'publish_score'];
    items.sort((a, b) => {
      const av = numericFields.includes(field) ? ((a as any)[field] ?? 0) : String((a as any)[field] ?? '');
      const bv = numericFields.includes(field) ? ((b as any)[field] ?? 0) : String((b as any)[field] ?? '');
      return av < bv ? -dir : av > bv ? dir : 0;
    });
    // "Top articles" narrows the table to the highest-scored pending articles only.
    if (topOnly) items = items.slice(0, this.topPicksCount);
    return items;
  });

  totalItems  = computed(() => this.filteredSorted().length);
  totalPages  = computed(() => Math.max(1, Math.ceil(this.totalItems() / this.pageSize)));
  pageStart   = computed(() => this.currentPage() * this.pageSize + 1);
  pageEnd     = computed(() => Math.min((this.currentPage() + 1) * this.pageSize, this.totalItems()));

  pagedArticles = computed(() => {
    const start = this.currentPage() * this.pageSize;
    return this.filteredSorted().slice(start, start + this.pageSize);
  });

  allPageSelected = computed(() =>
    this.pagedArticles().length > 0 &&
    this.pagedArticles().every(a => this.selectedIds().includes(a.id))
  );

  private toastTimer: any;

  constructor(private supabase: SupabaseService, private router: Router) {}

  ngOnInit() {
    const theme = localStorage.getItem('theme') ?? 'dark';
    this.isDark.set(theme === 'dark');
    document.documentElement.setAttribute('data-theme', theme);
    this.supabase.user$.subscribe(user => this.userEmail.set(user?.email ?? ''));
    this.load();
  }

  ngOnDestroy() {
    clearTimeout(this.toastTimer);
  }

  toggleTheme() {
    const next = this.isDark() ? 'light' : 'dark';
    this.isDark.set(!this.isDark());
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
  }

  setCountry(country: string) {
    this.filterCountry.set(country);
    this.topPicksOnly.set(false);
    this.resetPage();
  }

  toggleTopPicks() {
    this.topPicksOnly.update(v => !v);
    this.filterStatus.set('pending');
    this.sortField.set('publish_score');
    this.sortDir.set('desc');
    this.resetPage();
  }

  countryAccentClass(): string {
    const map: Record<string, string> = { FR: 'ca-fr', IT: 'ca-it', AU: 'ca-au', SE: 'ca-se' };
    return map[this.filterCountry()] ?? '';
  }

  countryPillClass(country: string): string {
    const base = `country-pill cp-${country.toLowerCase()}`;
    return this.filterCountry() === country ? `${base} active` : base;
  }

  countryName(c: string): string {
    return COUNTRY_NAMES[c] ?? c;
  }

  showToast(msg: string, ok = true) {
    clearTimeout(this.toastTimer);
    this.toast.set({ msg, ok });
    this.toastTimer = setTimeout(() => this.toast.set(null), 3000);
  }

  async load() {
    this.loading.set(true);
    this.selectedIds.set([]);
    try {
      const [articles, statsData] = await Promise.all([
        this.supabase.getArticles({ sortBy: 'created_at', sortDir: 'desc' }),
        this.supabase.getStats(),
      ]);
      this._allArticles.set(articles);
      this.stats.set(statsData);
      this.currentPage.set(0);
    } catch (err: any) {
      this.showToast(`Load failed: ${err.message}`, false);
    } finally {
      this.loading.set(false);
    }
  }

  resetPage() { this.currentPage.set(0); }

  toggleTagFilter(tag: string) {
    const cur = this.filterTags();
    this.filterTags.set(cur.includes(tag) ? cur.filter(t => t !== tag) : [...cur, tag]);
    this.resetPage();
  }

  tagChipClass(tag: string): string {
    const active = this.filterTags().includes(tag);
    if (!active) return 'ink-badge tag-chip';
    return `ink-badge ${this.tagBadgeClass(tag)} tag-chip`;
  }

  filterByStatus(status: string) {
    this.filterStatus.set(status);
    this.resetPage();
  }

  setSort(field: string) {
    if (this.sortField() === field) {
      this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortField.set(field);
      this.sortDir.set('desc');
    }
    this.currentPage.set(0);
  }

  sortIcon(field: string): string {
    if (this.sortField() !== field) return '↕';
    return this.sortDir() === 'asc' ? '↑' : '↓';
  }

  prevPage() { if (this.currentPage() > 0) this.currentPage.update(p => p - 1); }
  nextPage() { if (this.currentPage() < this.totalPages() - 1) this.currentPage.update(p => p + 1); }

  isSelected(id: string): boolean { return this.selectedIds().includes(id); }

  toggleSelect(id: string) {
    const cur = this.selectedIds();
    this.selectedIds.set(cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]);
  }

  toggleAll() {
    const pageIds = this.pagedArticles().map(a => a.id);
    if (this.allPageSelected()) {
      this.selectedIds.set(this.selectedIds().filter(id => !pageIds.includes(id)));
    } else {
      this.selectedIds.set([...new Set([...this.selectedIds(), ...pageIds])]);
    }
  }

  openDetail(article: Article) { this.selectedArticle.set(article); }

  onArticleUpdated(updated: Article) {
    this._allArticles.update(arr => arr.map(a => a.id === updated.id ? updated : a));
    if (this.selectedArticle()?.id === updated.id) this.selectedArticle.set(updated);
    this.supabase.getStats().then(s => this.stats.set(s)).catch(() => {});
  }

  async generateOne(article: Article) {
    this.generating.set(true);
    try {
      const result = await this.supabase.generateCaptions([article.id]);
      if (result.processed === 0) {
        const errMsg = result.errors?.[0]?.error ?? 'Generation failed';
        this.showToast(errMsg, false);
      } else {
        this.showToast('Content generated');
        await this.load();
      }
    } catch (err: any) {
      this.showToast(err.message, false);
    } finally {
      this.generating.set(false);
    }
  }

  async generateSelected() {
    const ids = this.selectedIds();
    if (!ids.length) return;
    this.generating.set(true);
    try {
      const result = await this.supabase.generateCaptions(ids);
      if (result.processed === 0) {
        const errMsg = result.errors?.[0]?.error ?? 'Generation failed';
        this.showToast(errMsg, false);
      } else {
        this.showToast(`Generated ${result.processed} / ${ids.length} articles`);
        await this.load();
      }
    } catch (err: any) {
      this.showToast(err.message, false);
    } finally {
      this.generating.set(false);
    }
  }

  async deleteOne(article: Article) {
    if (!confirm(`Delete "${article.title}"?\n\nThis cannot be undone.`)) return;
    try {
      await this.supabase.deleteArticle(article.id);
      this.showToast('Article deleted');
      await this.load();
    } catch (err: any) {
      this.showToast(err.message, false);
    }
  }

  async batchPostToFacebook() {
    const ids = this.selectedIds().filter(id => {
      const article = this._allArticles().find(a => a.id === id);
      return article?.status === 'pending' && article?.ai_caption != null;
    });
    if (!ids.length) {
      this.showToast('Select pending articles with generated captions', false);
      return;
    }
    this.posting.set(true);
    try {
      const result = await this.supabase.postToFacebook(ids);
      const succeeded = result.results.filter(r => r.success).length;
      const failed = result.results.filter(r => !r.success).length;
      if (succeeded > 0) {
        this.showToast(`Posted ${succeeded} article${succeeded !== 1 ? 's' : ''} to Facebook${failed > 0 ? ` (${failed} failed)` : ''}`);
        await this.load();
      } else {
        const firstErr = result.results[0]?.error ?? 'All posts failed';
        this.showToast(firstErr, false);
      }
    } catch (err: any) {
      this.showToast(err.message, false);
    } finally {
      this.posting.set(false);
    }
  }

  async markSelectedPosted() {
    const ids = this.selectedIds();
    if (!ids.length) return;
    try {
      await this.supabase.updateArticlesStatus(ids, 'posted');
      this.showToast(`${ids.length} article${ids.length !== 1 ? 's' : ''} marked as posted`);
      await this.load();
    } catch (err: any) {
      this.showToast(err.message, false);
    }
  }

  async deleteSelected() {
    const ids = this.selectedIds();
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} articles?\n\nThis cannot be undone.`)) return;
    try {
      await this.supabase.deleteArticles(ids);
      this.showToast(`Deleted ${ids.length} articles`);
      await this.load();
    } catch (err: any) {
      this.showToast(err.message, false);
    }
  }

  async signOut() {
    await this.supabase.signOut();
    this.router.navigate(['/login']);
  }

  criticalityTintBg(article: Article): string {
    if (article.source_type === 'historical') return 'rgba(180, 120, 40, 0.07)';
    return ({
      breaking: 'rgba(255, 54, 54, 0.08)',
      alert:    'rgba(255, 140, 0, 0.08)',
      trending: 'rgba(30, 122, 255, 0.06)',
      standard: '',
    } as any)[article.criticality] ?? '';
  }

  rowOpacity(article: Article): string {
    return article.tags?.includes('off_target') ? '0.55' : '1';
  }

  visibleTags(article: Article): string[] {
    const tags = article.tags ?? [];
    const ranked = TAG_DISPLAY_ORDER.filter(t => tags.includes(t));
    return ranked.slice(0, TAG_CHIPS_PER_ROW);
  }

  extraTagCount(article: Article): number {
    const tags = article.tags ?? [];
    const known = TAG_DISPLAY_ORDER.filter(t => tags.includes(t)).length;
    const visible = Math.min(known, TAG_CHIPS_PER_ROW);
    return Math.max(0, known - visible);
  }

  critColor(level: string): string {
    return ({ breaking: '#ff3636', alert: '#ff8c00', trending: '#1e7aff', standard: '#00cc70' } as any)[level] ?? '#1a2440';
  }

  criticalityBadgeClass(level: string): string {
    return ({ breaking: 'ib-breaking', alert: 'ib-alert', trending: 'ib-trending', standard: 'ib-standard' } as any)[level] ?? '';
  }

  criticalityLabel(level: string): string {
    return ({ breaking: '🔴 Breaking', alert: '🟠 Alert', trending: '🔵 Trending', standard: '🟢 Standard' } as any)[level] ?? level;
  }

  statusBadgeClass(status: string): string {
    return ({ pending: 'ib-pending', approved: 'ib-approved', rejected: 'ib-rejected', posted: 'ib-posted', failed: 'ib-failed', blocked: 'ib-breaking', manual_review: 'ib-alert' } as any)[status] ?? '';
  }

  countryFlag(country: string): string {
    return ({ FR: '🇫🇷', IT: '🇮🇹', AU: '🇦🇺', SE: '🇸🇪' } as any)[country] ?? '🌍';
  }

  tagBadgeClass(tag: string): string {
    return ({
      off_target: 'ib-breaking',
      patriotic:  'ib-standard',
      health:     'ib-alert',
      justice:    'ib-brand',
      prices:     'ib-trending',
      region:     'ib-ai',
      sport:      'ib-trending',
      social:     'ib-pending',
    } as any)[tag] ?? '';
  }

  tagLabel(tag: string): string {
    return ({
      off_target: '⛔ Off-target',
      patriotic:  '🏆 Patriotic',
      health:     '⚠️ Health',
      justice:    '⚖️ Justice',
      prices:     '💰 Prices',
      region:     '🌍 Region',
      sport:      '⚽ Sport',
      social:     '👥 Social',
    } as any)[tag] ?? tag;
  }

  articleBestSlot(article: Article): string | null {
    return bestSlotForArticle(article);
  }

  articleSlotIntent(article: Article): SlotIntent {
    return bestSlotIntent(article);
  }

  articleSlotLabel(article: Article): string {
    const slot = bestSlotForArticle(article);
    if (!slot) return '';
    const intentKey = bestSlotIntent(article);
    const lang = article.country === 'IT' ? 'it' : article.country === 'FR' ? 'fr' : 'en';
    return `→ ${slot} / ${slotToIST(slot)} IST ${slotIntentLabel(intentKey, lang)}`;
  }

  readonly slotToIST = slotToIST;

  intentBadgeClass(intent: SlotIntent): string {
    return ({ morning: 'ib-alert', midday: 'ib-trending', evening: 'ib-ai' } as any)[intent] ?? '';
  }

  identityModeChip(article: Article): string | null {
    const mode = article.content_signals?.identity_mode;
    return mode ?? null;
  }
}
