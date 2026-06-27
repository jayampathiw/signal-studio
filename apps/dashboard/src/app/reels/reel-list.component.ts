import { Component, OnInit, signal, computed } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ContentItem, ContentItemScene, ContentItemStats, RenderQueueStats, SupabaseService } from '../core/supabase.service';
import { ReelDetailComponent } from './reel-detail-dialog.component';
import { ChannelConfigDialogComponent } from './channel-config-dialog.component';

const STYLE_COLORS: Record<string, string> = {
  factual:   'rgba(30,122,255,.15)',
  cinematic: 'rgba(120,80,220,.15)',
  listicle:  'rgba(255,140,0,.15)',
  silent:    'rgba(100,100,100,.15)',
};
const STYLE_TEXT: Record<string, string> = {
  factual:   '#1e7aff',
  cinematic: '#9060e0',
  listicle:  '#ff8c00',
  silent:    '#888',
};

const PAGES = [
  { key: 'Wild Capture',       icon: '👁️', label: 'Wild Capture',       channels: ['wildlife/intimacy/EN'],                              accent: '#00cc70' },
  { key: 'NaturePulse',        icon: '🌿', label: 'NaturePulse',         channels: ['wildlife/factual/EN', 'wildlife/listicle/EN'],        accent: '#2d9b5c' },
  { key: 'NatureFrame',        icon: '🎬', label: 'NatureFrame',         channels: ['wildlife/cinematic/EN', 'wildlife/silent/EN'],        accent: '#7c3aed' },
  { key: "France Aujourd'hui", icon: '🇫🇷', label: "France Aujourd'hui", channels: ['culture/silent/FR', 'culture/silent/FR-long'],        accent: '#0055a4' },
  { key: 'Vivere in Italia',   icon: '🇮🇹', label: 'Vivere in Italia',   channels: ['culture/silent/IT', 'culture/silent/IT-long'],       accent: '#009246' },
];

const CHANNEL_PILLS = [
  { key: 'wildlife/intimacy/EN',   label: 'Wild Eye',     icon: '👁️', accent: '#00cc70' },
  { key: 'wildlife/factual/EN',    label: 'NP Factual',   icon: '📰', accent: '#1e7aff' },
  { key: 'wildlife/listicle/EN',   label: 'NP Listicle',  icon: '📋', accent: '#ff8c00' },
  { key: 'wildlife/cinematic/EN',  label: 'NF Cinematic', icon: '🎬', accent: '#9060e0' },
  { key: 'wildlife/silent/EN',     label: 'NF Silent',    icon: '🔇', accent: '#64748b' },
  { key: 'culture/silent/FR',      label: 'FR Culture',   icon: '🇫🇷', accent: '#0055a4' },
  { key: 'culture/silent/FR-long', label: 'FR Long',      icon: '🇫🇷', accent: '#0055a4' },
  { key: 'culture/silent/IT',      label: 'IT Culture',   icon: '🇮🇹', accent: '#009246' },
  { key: 'culture/silent/IT-long', label: 'IT Long',      icon: '🇮🇹', accent: '#009246' },
];

const AVAILABLE_CHANNELS = [
  { key: 'wildlife/factual/EN',    page: 'NaturePulse',        sub: 'Wildlife · Factual'    },
  { key: 'wildlife/listicle/EN',   page: 'NaturePulse',        sub: 'Wildlife · Listicle'   },
  { key: 'wildlife/cinematic/EN',  page: 'NatureFrame',        sub: 'Wildlife · Cinematic'  },
  { key: 'wildlife/silent/EN',     page: 'NatureFrame',        sub: 'Wildlife · Silent'     },
  { key: 'culture/silent/FR',      page: "France Aujourd'hui", sub: 'Culture · Silent'      },
  { key: 'culture/silent/FR-long', page: "France Aujourd'hui", sub: 'Culture · Silent Long' },
  { key: 'culture/silent/IT',      page: 'Vivere in Italia',   sub: 'Culture · Silent'      },
  { key: 'culture/silent/IT-long', page: 'Vivere in Italia',   sub: 'Culture · Silent Long' },
];

@Component({
  selector: 'app-reel-list',
  standalone: true,
  imports: [DatePipe, DecimalPipe, RouterLink, ReelDetailComponent, ChannelConfigDialogComponent],
  template: `
    <!-- Navbar -->
    <nav class="ink-navbar" style="display:flex;align-items:center;justify-content:space-between;padding:0 16px;height:52px;">
      <div style="display:flex;align-items:center;gap:10px;">
        <span class="sig sig-breaking" style="width:9px;height:9px;"></span>
        <span style="font-family:'Playfair Display',serif;font-weight:900;font-size:18px;letter-spacing:.06em;color:var(--ink-text);">SIGNAL</span>
        <span class="hidden sm:inline" style="font-size:10px;color:var(--ink-text-3);letter-spacing:.12em;text-transform:uppercase;">Console</span>
        <a routerLink="/articles" style="font-size:11px;font-weight:600;color:var(--ink-text-2);text-decoration:none;padding:3px 8px;border-radius:4px;background:var(--ink-raised);letter-spacing:.05em;">Articles</a>
        <a routerLink="/reels" style="font-size:11px;font-weight:600;color:var(--ink-brand);text-decoration:none;padding:3px 8px;border-radius:4px;background:var(--ink-brand-glow);letter-spacing:.05em;">▶ Reels</a>
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

    <!-- Page strip (mirrors country-strip in articles) -->
    <div class="channel-strip" style="padding:8px 12px;border-bottom:1px solid var(--ink-border);background:var(--ink-navbar);position:sticky;top:0;z-index:10;backdrop-filter:blur(12px);">
      <button class="channel-pill" [class.active]="filterPage() === ''" (click)="setPage('')">
        🌿 All
        <span class="pill-count">{{ totalCount() }}</span>
      </button>
      @for (p of PAGES; track p.key) {
        <button class="channel-pill" [class.active]="filterPage() === p.key"
          [style.--pill-accent]="p.accent"
          (click)="setPage(p.key)">
          <span style="font-size:13px;line-height:1;flex-shrink:0;">{{ p.icon }}</span>
          {{ p.label }}
          @if (pageCounts()[p.key]) {
            <span class="pill-count">{{ pageCounts()[p.key] }}</span>
          }
        </button>
      }
      @if (filterPage()) {
        <button class="channel-pill" (click)="openChannelConfig()" title="Edit generation defaults for this page (channel_configs)">⚙ Defaults</button>
      }
    </div>

    @if (channelConfigKey()) {
      <app-channel-config-dialog
        [channelKey]="channelConfigKey()!"
        [channelLabel]="channelConfigLabel()"
        (close)="channelConfigKey.set(null)" />
    }

    <div [class]="pageAccentClass()" style="min-height:calc(100vh - 100px);">
      <div style="max-width:960px;margin:0 auto;padding:16px 12px 64px;">

        <!-- Stats row -->
        @if (stats()) {
          <div class="scrollbar-none" style="display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;margin-bottom:16px;">
            <button class="stat-card" [class.active]="filterStatus() === ''" (click)="filterByStatus('')">
              <div style="font-size:26px;font-weight:700;line-height:1;color:var(--ink-text);">{{ stats()!.total }}</div>
              <div style="font-size:10px;letter-spacing:.07em;text-transform:uppercase;color:var(--ink-text-2);margin-top:5px;">Total</div>
            </button>
            <button class="stat-card" [class.active]="filterStatus() === 'pending'" (click)="filterByStatus('pending')">
              <div style="font-size:26px;font-weight:700;line-height:1;color:var(--ink-text-2);">{{ stats()!.pending }}</div>
              <div style="font-size:10px;letter-spacing:.07em;text-transform:uppercase;color:var(--ink-text-2);margin-top:5px;">Pending</div>
            </button>
            <button class="stat-card" [class.active]="filterStatus() === 'rendered'" (click)="filterByStatus('rendered')">
              <div style="font-size:26px;font-weight:700;line-height:1;color:var(--ink-trending);">{{ stats()!.rendered }}</div>
              <div style="font-size:10px;letter-spacing:.07em;text-transform:uppercase;color:var(--ink-text-2);margin-top:5px;">Ready</div>
            </button>
            <button class="stat-card" [class.active]="filterStatus() === 'posted'" (click)="filterByStatus('posted')">
              <div style="font-size:26px;font-weight:700;line-height:1;color:var(--ink-standard);">{{ stats()!.posted }}</div>
              <div style="font-size:10px;letter-spacing:.07em;text-transform:uppercase;color:var(--ink-text-2);margin-top:5px;">Posted</div>
            </button>
            <button class="stat-card" [class.active]="filterStatus() === 'failed'" (click)="filterByStatus('failed')">
              <div style="font-size:26px;font-weight:700;line-height:1;color:var(--ink-breaking);">{{ stats()!.failed }}</div>
              <div style="font-size:10px;letter-spacing:.07em;text-transform:uppercase;color:var(--ink-text-2);margin-top:5px;">Failed</div>
            </button>
            @if ((renderQueueStats()?.queued ?? 0) + (renderQueueStats()?.processing ?? 0) > 0) {
              <button class="stat-card" style="cursor:default;border-color:var(--ink-alert);">
                <div style="font-size:26px;font-weight:700;line-height:1;color:var(--ink-alert);">{{ (renderQueueStats()?.queued ?? 0) + (renderQueueStats()?.processing ?? 0) }}</div>
                <div style="font-size:10px;letter-spacing:.07em;text-transform:uppercase;color:var(--ink-text-2);margin-top:5px;">In Queue</div>
              </button>
            }
          </div>
        }

        <!-- Filter bar -->
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;align-items:center;">
          <div style="position:relative;flex:1;min-width:140px;">
            <svg style="position:absolute;left:10px;top:50%;transform:translateY(-50%);width:13px;height:13px;color:var(--ink-text-3);pointer-events:none;" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/>
            </svg>
            <input type="text" class="ink-input" style="padding-left:32px;" placeholder="Search reels…"
              [value]="filterSearch()" (input)="filterSearch.set($any($event.target).value)" />
          </div>
          <select class="ink-select" style="min-width:110px;" [value]="filterNiche()" (change)="filterNiche.set($any($event.target).value)">
            <option value="">All Niches</option>
            @for (n of niches(); track n) { <option [value]="n">{{ n }}</option> }
          </select>
          <select class="ink-select" style="min-width:110px;" [value]="filterStyle()" (change)="filterStyle.set($any($event.target).value)">
            <option value="">All Styles</option>
            <option value="factual">Factual</option>
            <option value="cinematic">Cinematic</option>
            <option value="listicle">Listicle</option>
            <option value="silent">Silent</option>
          </select>
          <select class="ink-select" style="min-width:160px;" [value]="filterChannel()" (change)="filterChannel.set($any($event.target).value); currentPage.set(0)">
            <option value="">All Channels</option>
            @for (c of channels(); track c) { <option [value]="c">{{ c }}</option> }
          </select>
          <button class="btn-ink" style="height:36px;gap:5px;flex-shrink:0;" (click)="load()">
            <svg style="width:13px;height:13px;" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clip-rule="evenodd"/>
            </svg>
            <span class="hidden sm:inline">Refresh</span>
          </button>
          <button class="btn-brand" style="height:36px;gap:5px;flex-shrink:0;position:relative;" (click)="showQueueDialog.set(true)">
            <svg style="width:13px;height:13px;" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/>
            </svg>
            <span class="hidden sm:inline">New Reel</span>
            @if ((renderQueueStats()?.queued ?? 0) + (renderQueueStats()?.processing ?? 0) > 0) {
              <span style="position:absolute;top:-5px;right:-5px;background:var(--ink-alert);color:white;font-size:9px;font-weight:700;border-radius:50%;width:16px;height:16px;display:flex;align-items:center;justify-content:center;">{{ (renderQueueStats()?.queued ?? 0) + (renderQueueStats()?.processing ?? 0) }}</span>
            }
          </button>
        </div>

        <!-- Sort + count -->
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
          <span style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-text-3);">Sort:</span>
          <button style="padding:3px 8px;border-radius:4px;cursor:pointer;border:none;font-size:11px;font-family:'Outfit',sans-serif;font-weight:500;transition:all .15s;"
            [style.background]="sortField()==='created_at' ? 'rgba(99,102,241,.15)' : 'transparent'"
            [style.color]="sortField()==='created_at' ? 'var(--ink-brand)' : 'var(--ink-text-2)'"
            (click)="setSort('created_at')">Date {{ sortIcon('created_at') }}</button>
          <button style="padding:3px 8px;border-radius:4px;cursor:pointer;border:none;font-size:11px;font-family:'Outfit',sans-serif;font-weight:500;transition:all .15s;"
            [style.background]="sortField()==='duration_sec' ? 'rgba(99,102,241,.15)' : 'transparent'"
            [style.color]="sortField()==='duration_sec' ? 'var(--ink-brand)' : 'var(--ink-text-2)'"
            (click)="setSort('duration_sec')">Duration {{ sortIcon('duration_sec') }}</button>
          <span style="margin-left:auto;font-size:11px;font-family:'JetBrains Mono',monospace;color:var(--ink-text-3);">{{ filteredItems().length }} reel{{ filteredItems().length !== 1 ? 's' : '' }}</span>
        </div>

        <!-- Batch bar -->
        @if (selectedIds().length > 0) {
          <div class="batch-bar">
            <span style="font-size:13px;font-weight:600;color:var(--ink-brand);">{{ selectedIds().length }} selected</span>
            <button class="btn-brand" style="background:var(--ink-trending);" (click)="markSelectedPosted()">✓ Mark Posted</button>
            <button class="btn-reject" (click)="deleteSelected()">Delete</button>
            <button class="btn-ink" style="margin-left:auto;" (click)="selectedIds.set([])">✕ Clear</button>
          </div>
        }

        <!-- Loading -->
        @if (loading()) {
          <div style="display:flex;flex-direction:column;align-items:center;gap:16px;padding:80px 20px;color:var(--ink-text-3);">
            <span class="loading loading-spinner" style="color:var(--ink-brand);width:28px;height:28px;"></span>
            <p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;">Loading reels…</p>
          </div>
        }

        <!-- List -->
        @if (!loading()) {
          @if (filteredItems().length === 0) {
            <div class="empty-state">
              <div style="font-size:36px;letter-spacing:.2em;opacity:.3;">▶</div>
              <p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;">No reels match the current filters</p>
            </div>
          } @else {
            <!-- Column header (desktop) -->
            <div class="hidden sm:flex ink-surface" style="align-items:center;gap:12px;padding:8px 16px;background:var(--ink-raised);margin-bottom:8px;border-radius:6px;">
              <div style="width:24px;flex-shrink:0;">
                <input type="checkbox" class="checkbox checkbox-xs" [checked]="allSelected()" (change)="toggleAll()" />
              </div>
              <span style="width:110px;flex-shrink:0;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-text-3);">Channel</span>
              <span style="flex:1;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-text-3);">Title</span>
              <span style="width:50px;flex-shrink:0;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-text-3);text-align:right;">Dur.</span>
              <span style="width:80px;flex-shrink:0;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-text-3);text-align:center;">Status</span>
              <span style="width:64px;flex-shrink:0;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-text-3);text-align:center;">Platforms</span>
              <span style="width:70px;flex-shrink:0;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-text-3);text-align:right;">Date</span>
              <span style="width:56px;flex-shrink:0;"></span>
            </div>

            <div style="display:flex;flex-direction:column;gap:6px;">
              @for (item of pagedItems(); track item.id) {
                <div class="article-row" [class.selected]="isSelected(item.id)"
                     [style.border-left-color]="styleBorderColor(item.style)"
                     (click)="openDetail(item)">

                  <!-- Checkbox -->
                  <div style="flex-shrink:0;width:24px;" (click)="$event.stopPropagation()">
                    <input type="checkbox" class="checkbox checkbox-sm" [checked]="isSelected(item.id)" (change)="toggleSelect(item.id)" />
                  </div>

                  <!-- Channel badge (desktop) -->
                  <div class="hidden sm:flex" style="width:110px;flex-shrink:0;flex-direction:column;gap:3px;">
                    <span class="ink-badge" [style.background]="STYLE_COLORS[item.style]" [style.color]="STYLE_TEXT[item.style]" style="font-size:9px;text-transform:uppercase;letter-spacing:.06em;width:fit-content;">{{ item.style }}</span>
                    <span style="font-size:10px;color:var(--ink-text-3);font-family:'JetBrains Mono',monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" [title]="item.channel_key">{{ item.niche }}</span>
                  </div>

                  <!-- Content -->
                  <div style="flex:1;min-width:0;">
                    <!-- Mobile channel badge -->
                    <div class="flex sm:hidden" style="align-items:center;gap:4px;margin-bottom:4px;">
                      <span class="ink-badge" [style.background]="STYLE_COLORS[item.style]" [style.color]="STYLE_TEXT[item.style]" style="font-size:9px;text-transform:uppercase;">{{ item.style }}</span>
                      <span [class]="'ink-badge ' + statusBadgeClass(item.status)" style="font-size:9px;">{{ item.status }}</span>
                    </div>
                    <p style="font-size:13px;font-weight:500;line-height:1.4;color:var(--ink-text);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">
                      {{ item.title ?? item.channel_key }}
                    </p>
                    <div style="display:flex;align-items:center;gap:6px;margin-top:4px;font-size:11px;color:var(--ink-text-2);">
                      <span>{{ item.channel_key }}</span>
                      @if (item.source_type) {
                        <span style="color:var(--ink-text-3);">·</span>
                        <span>{{ item.source_type }}</span>
                      }
                    </div>
                  </div>

                  <!-- Duration (desktop) -->
                  <div class="hidden sm:block" style="width:50px;flex-shrink:0;text-align:right;">
                    <span style="font-size:12px;font-family:'JetBrains Mono',monospace;color:var(--ink-text-2);">
                      {{ item.duration_sec ? (item.duration_sec | number:'1.0-0') + 's' : '—' }}
                    </span>
                  </div>

                  <!-- Status (desktop) -->
                  <div class="hidden sm:flex" style="width:80px;flex-shrink:0;justify-content:center;">
                    <span [class]="'ink-badge ' + statusBadgeClass(item.status)" style="font-size:9px;text-transform:uppercase;letter-spacing:.05em;">{{ item.status }}</span>
                  </div>

                  <!-- Platform dots (desktop) -->
                  <div class="hidden sm:flex" style="width:64px;flex-shrink:0;justify-content:center;gap:5px;align-items:center;">
                    @for (p of [['FB', 'fb'], ['IG', 'ig'], ['YT', 'yt'], ['TT', 'tt']]; track p[0]) {
                      <span [title]="platformTitle(item, p[1])" [style.width]="'10px'" [style.height]="'10px'" [style.border-radius]="'50%'" [style.background]="platformDotColor(item, p[1])"></span>
                    }
                  </div>

                  <!-- Date (desktop) -->
                  <div class="hidden sm:block" style="width:70px;flex-shrink:0;text-align:right;">
                    <span style="font-size:11px;font-family:'JetBrains Mono',monospace;color:var(--ink-text-3);">{{ item.created_at | date:'dd MMM' }}</span>
                  </div>

                  <!-- Actions -->
                  <div style="flex-shrink:0;display:flex;flex-direction:column;gap:4px;" (click)="$event.stopPropagation()">
                    @if (item.status === 'rendered') {
                      <button class="btn-ghost-icon" style="color:var(--ink-trending);" title="Mark as posted" (click)="markPosted(item)">✓</button>
                    }
                    <button class="btn-ghost-icon danger" title="Delete" (click)="deleteOne(item)">✕</button>
                  </div>
                </div>
              }
            </div>

            <!-- Pagination -->
            @if (filteredItems().length > pageSize) {
              <div style="display:flex;align-items:center;justify-content:center;gap:16px;padding-top:16px;">
                <button class="btn-ink" style="height:32px;padding:0 12px;font-size:12px;" [disabled]="currentPage() === 0" (click)="prevPage()">← Prev</button>
                <span style="font-size:12px;font-family:'JetBrains Mono',monospace;color:var(--ink-text-2);">{{ pageStart() }}–{{ pageEnd() }} / {{ filteredItems().length }}</span>
                <button class="btn-ink" style="height:32px;padding:0 12px;font-size:12px;" [disabled]="currentPage() >= totalPages() - 1" (click)="nextPage()">Next →</button>
              </div>
            }
          }
        }
      </div>
    </div>

    <!-- Detail panel overlay -->
    @if (selectedItem()) {
      <div style="position:fixed;inset:0;z-index:50;" class="animate-fade-in">
        <div style="position:absolute;inset:0;background:rgba(0,0,0,.7);backdrop-filter:blur(8px);" (click)="selectedItem.set(null)"></div>
        <div class="detail-panel" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:min(700px,calc(100vw - 24px));max-height:90vh;border-radius:12px;overflow-y:auto;box-shadow:0 24px 64px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.06);">
          <app-reel-detail
            [item]="selectedItem()!"
            (closePanel)="selectedItem.set(null)"
            (itemUpdated)="onItemUpdated($event)"
            (itemDeleted)="onItemDeleted($event)"
          ></app-reel-detail>
        </div>
      </div>
    }

    <!-- Queue dialog -->
    @if (showQueueDialog()) {
      <div style="position:fixed;inset:0;z-index:50;" class="animate-fade-in">
        <div style="position:absolute;inset:0;background:rgba(0,0,0,.7);backdrop-filter:blur(8px);" (click)="showQueueDialog.set(false)"></div>
        <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--ink-surface);border:1px solid var(--ink-border);border-radius:12px;width:min(480px,calc(100vw - 32px));max-height:80vh;overflow-y:auto;z-index:10;display:flex;flex-direction:column;">
          <!-- Dialog header -->
          <div style="padding:14px 18px;border-bottom:1px solid var(--ink-border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
            <span style="font-size:14px;font-weight:700;color:var(--ink-text);">Queue New Reel</span>
            <button class="btn-ghost-icon" (click)="showQueueDialog.set(false)">✕</button>
          </div>
          <!-- Dialog body -->
          <div style="padding:16px 18px;overflow-y:auto;">
            <p style="font-size:12px;color:var(--ink-text-2);margin:0 0 14px;line-height:1.6;">
              Select a channel to queue a render job.
              Then run <code style="background:var(--ink-raised);padding:2px 6px;border-radius:3px;font-family:'JetBrains Mono',monospace;font-size:11px;">node src/scripts/process-queue.js</code> in the reels-pipeline terminal.
            </p>
            <div style="display:flex;flex-direction:column;gap:6px;">
              @for (ch of AVAILABLE_CHANNELS; track ch.key) {
                <button
                  style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--ink-raised);border:1px solid var(--ink-border);border-radius:8px;cursor:pointer;text-align:left;width:100%;transition:border-color .15s,background .15s;"
                  [disabled]="queueing()"
                  (click)="queueRender(ch.key); showQueueDialog.set(false)">
                  <div>
                    <div style="font-size:13px;font-weight:600;color:var(--ink-text);">{{ ch.page }}</div>
                    <div style="font-size:10px;color:var(--ink-text-3);margin-top:2px;font-family:'JetBrains Mono',monospace;">{{ ch.key }}</div>
                  </div>
                  <span class="ink-badge" style="font-size:9px;flex-shrink:0;margin-left:12px;">{{ ch.sub }}</span>
                </button>
              }
            </div>
          </div>
        </div>
      </div>
    }

    <!-- Toast -->
    @if (toast()) {
      <div class="ink-toast">
        <div [class]="'toast-msg ' + (toast()!.ok ? 'toast-ok' : 'toast-err')">
          {{ toast()!.ok ? '✓' : '✗' }} {{ toast()!.msg }}
        </div>
      </div>
    }
  `,
})
export class ReelListComponent implements OnInit {
  readonly STYLE_COLORS = STYLE_COLORS;
  readonly STYLE_TEXT = STYLE_TEXT;

  private _allItems = signal<ContentItem[]>([]);
  loading     = signal(true);
  isDark      = signal(true);
  stats       = signal<ContentItemStats | null>(null);
  userEmail   = signal('');
  selectedItem = signal<ContentItem | null>(null);
  toast        = signal<{ msg: string; ok: boolean } | null>(null);

  filterSearch   = signal('');
  filterNiche    = signal('');
  filterStyle    = signal('');
  filterStatus   = signal('');
  filterChannel  = signal('');
  sortField      = signal('created_at');
  sortDir        = signal<'asc' | 'desc'>('desc');
  currentPage    = signal(0);
  selectedIds    = signal<number[]>([]);
  showQueueDialog = signal(false);
  queueing        = signal(false);
  renderQueueStats = signal<RenderQueueStats | null>(null);

  readonly pageSize = 25;

  niches   = computed(() => [...new Set(this._allItems().map(i => i.niche))].sort());
  channels = computed(() => [...new Set(this._allItems().map(i => i.channel_key))].sort());
  totalCount    = computed(() => this._allItems().length);
  channelCounts = computed(() => {
    const counts: Record<string, number> = {};
    for (const item of this._allItems()) counts[item.channel_key] = (counts[item.channel_key] ?? 0) + 1;
    return counts;
  });
  readonly AVAILABLE_CHANNELS = AVAILABLE_CHANNELS;
  readonly CHANNEL_PILLS = CHANNEL_PILLS;
  readonly PAGES = PAGES;

  filterPage = signal('');

  pageCounts = computed(() => {
    const counts: Record<string, number> = {};
    for (const item of this._allItems()) {
      for (const page of PAGES) {
        if (page.channels.includes(item.channel_key)) {
          counts[page.key] = (counts[page.key] ?? 0) + 1;
        }
      }
    }
    return counts;
  });

  filteredItems = computed(() => {
    let items = [...this._allItems()];
    const q = this.filterSearch().toLowerCase();
    if (q) items = items.filter(i => (i.title ?? '').toLowerCase().includes(q) || i.channel_key.toLowerCase().includes(q));
    const page    = this.filterPage();
    const niche   = this.filterNiche();
    const style   = this.filterStyle();
    const status  = this.filterStatus();
    const channel = this.filterChannel();
    if (page) {
      const channels = PAGES.find(p => p.key === page)?.channels ?? [];
      items = items.filter(i => channels.includes(i.channel_key));
    }
    if (niche)   items = items.filter(i => i.niche === niche);
    if (style)   items = items.filter(i => i.style === style);
    if (status)  items = items.filter(i => i.status === status);
    if (channel) items = items.filter(i => i.channel_key === channel);
    const field = this.sortField();
    const dir = this.sortDir() === 'asc' ? 1 : -1;
    items.sort((a, b) => {
      const av = (a as any)[field] ?? '';
      const bv = (b as any)[field] ?? '';
      return av < bv ? -dir : av > bv ? dir : 0;
    });
    return items;
  });

  totalPages = computed(() => Math.max(1, Math.ceil(this.filteredItems().length / this.pageSize)));
  pageStart  = computed(() => this.currentPage() * this.pageSize + 1);
  pageEnd    = computed(() => Math.min((this.currentPage() + 1) * this.pageSize, this.filteredItems().length));

  pagedItems = computed(() => {
    const start = this.currentPage() * this.pageSize;
    return this.filteredItems().slice(start, start + this.pageSize);
  });

  allSelected = computed(() =>
    this.pagedItems().length > 0 && this.pagedItems().every(i => this.selectedIds().includes(i.id))
  );

  private toastTimer: any;

  constructor(private supabase: SupabaseService, private router: Router) {}

  ngOnInit() {
    const theme = localStorage.getItem('theme') ?? 'dark';
    this.isDark.set(theme === 'dark');
    document.documentElement.setAttribute('data-theme', theme);
    this.supabase.user$.subscribe(u => this.userEmail.set(u?.email ?? ''));
    this.load();
  }

  toggleTheme() {
    const next = this.isDark() ? 'light' : 'dark';
    this.isDark.set(!this.isDark());
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
  }

  async load() {
    this.loading.set(true);
    this.selectedIds.set([]);
    try {
      const [items, statsData, queueStats] = await Promise.all([
        this.supabase.getContentItems(),
        this.supabase.getContentItemStats(),
        this.supabase.getRenderQueueStats(),
      ]);
      this._allItems.set(items);
      this.stats.set(statsData);
      this.renderQueueStats.set(queueStats);
      this.currentPage.set(0);
    } catch (err: any) {
      this.showToast(`Load failed: ${err.message}`, false);
    } finally {
      this.loading.set(false);
    }
  }

  filterByStatus(status: string) {
    this.filterStatus.set(status);
    this.currentPage.set(0);
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

  isSelected(id: number): boolean { return this.selectedIds().includes(id); }

  toggleSelect(id: number) {
    const cur = this.selectedIds();
    this.selectedIds.set(cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]);
  }

  toggleAll() {
    const pageIds = this.pagedItems().map(i => i.id);
    if (this.allSelected()) {
      this.selectedIds.set(this.selectedIds().filter(id => !pageIds.includes(id)));
    } else {
      this.selectedIds.set([...new Set([...this.selectedIds(), ...pageIds])]);
    }
  }

  openDetail(item: ContentItem) { this.selectedItem.set(item); }

  setPage(key: string) {
    this.filterPage.set(key);
    this.currentPage.set(0);
  }

  // Channel-level ("page") defaults editor. Opens channel_configs for the selected
  // page's channel — uses the filtered channel if one is set, else the page's first.
  channelConfigKey   = signal<string | null>(null);
  channelConfigLabel = signal('');

  openChannelConfig() {
    const page = PAGES.find(p => p.key === this.filterPage());
    if (!page) return;
    const key = (this.filterChannel() && page.channels.includes(this.filterChannel()))
      ? this.filterChannel()
      : page.channels[0];
    this.channelConfigKey.set(key);
    this.channelConfigLabel.set(page.label);
  }

  pageAccentClass(): string {
    const page = this.filterPage();
    const map: Record<string, string> = {
      'Wild Capture':       'ca-wild',
      'NaturePulse':        'ca-nature',
      'NatureFrame':        'ca-frame',
      "France Aujourd'hui": 'ca-fr',
      'Vivere in Italia':   'ca-it',
    };
    return map[page] ?? '';
  }

  onItemUpdated(item: ContentItem) {
    this._allItems.update(items => items.map(i => i.id === item.id ? item : i));
  }

  async onItemDeleted(id: number) {
    try {
      await this.supabase.deleteContentItem(id);
      this._allItems.update(items => items.filter(i => i.id !== id));
      this.selectedItem.set(null);
      this.showToast('Deleted');
    } catch (err: any) {
      this.showToast(err.message, false);
    }
  }

  async markPosted(item: ContentItem) {
    try {
      await this.supabase.updateContentItemStatus(item.id, 'posted', {
        fb_status: 'posted',
        fb_posted_at: new Date().toISOString(),
      });
      this.showToast('Marked as posted');
      await this.load();
    } catch (err: any) {
      this.showToast(err.message, false);
    }
  }

  async markSelectedPosted() {
    const ids = this.selectedIds();
    if (!ids.length) return;
    try {
      await Promise.all(ids.map(id => this.supabase.updateContentItemStatus(id, 'posted', {
        fb_status: 'posted',
        fb_posted_at: new Date().toISOString(),
      })));
      this.showToast(`${ids.length} reel${ids.length !== 1 ? 's' : ''} marked as posted`);
      this.selectedIds.set([]);
      await this.load();
    } catch (err: any) {
      this.showToast(err.message, false);
    }
  }

  async deleteOne(item: ContentItem) {
    if (!confirm(`Delete reel "${item.title ?? item.channel_key}"?\nThis cannot be undone.`)) return;
    try {
      await this.supabase.deleteContentItem(item.id);
      this.showToast('Deleted');
      await this.load();
    } catch (err: any) {
      this.showToast(err.message, false);
    }
  }

  async deleteSelected() {
    const ids = this.selectedIds();
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} reels?\nThis cannot be undone.`)) return;
    try {
      await this.supabase.deleteContentItems(ids);
      this.showToast(`Deleted ${ids.length} reels`);
      await this.load();
    } catch (err: any) {
      this.showToast(err.message, false);
    }
  }

  async signOut() {
    await this.supabase.signOut();
    this.router.navigate(['/login']);
  }

  async queueRender(channelKey: string) {
    this.queueing.set(true);
    try {
      await this.supabase.queueRender(channelKey);
      this.showToast(`Queued: ${channelKey}`);
      const stats = await this.supabase.getRenderQueueStats();
      this.renderQueueStats.set(stats);
    } catch (err: any) {
      this.showToast(err.message, false);
    } finally {
      this.queueing.set(false);
    }
  }

  copy(text: string, label: string) {
    navigator.clipboard.writeText(text).then(
      () => this.showToast(`${label} copied`),
      () => this.showToast('Copy failed — use browser copy', false),
    );
  }

  showToast(msg: string, ok = true) {
    clearTimeout(this.toastTimer);
    this.toast.set({ msg, ok });
    this.toastTimer = setTimeout(() => this.toast.set(null), 3000);
  }

  captionText(item: ContentItem): string {
    const c = item.ai_caption;
    if (!c) return '';
    return [c.intro, c.question, c.cta].filter(Boolean).join('\n\n');
  }

  fullUploadPackage(item: ContentItem): string {
    const parts: string[] = [];
    if (item.rendered_video_url) parts.push(`VIDEO: ${item.rendered_video_url}`);
    const caption = this.captionText(item);
    if (caption) parts.push(`\nCAPTION:\n${caption}`);
    if (item.hashtags?.length) parts.push(`\nHASHTAGS:\n${item.hashtags.join(' ')}`);
    return parts.join('\n');
  }

  styleBorderColor(style: string): string {
    return (STYLE_TEXT as any)[style] ?? 'var(--ink-border)';
  }

  statusBadgeClass(status: string): string {
    return ({
      brief:      'ib-ai',
      storyboard: 'ib-ai',
      generating: 'ib-alert',
      pending:    '',
      rendering:  'ib-alert',
      rendered:   'ib-trending',
      publishing: 'ib-alert',
      posted:     'ib-standard',
      failed:     'ib-breaking',
      blocked:    'ib-breaking',
    } as any)[status] ?? '';
  }

  sceneStatusClass(status: string): string {
    return ({
      image_done: 'ib-ai',
      video_done: 'ib-trending',
      blocked:    'ib-breaking',
    } as any)[status] ?? '';
  }

  visionBadgeClass(status: string): string {
    return ({ pass: 'ib-standard', blocked: 'ib-breaking', retry: 'ib-alert' } as any)[status] ?? 'ib-ai';
  }

  hasPlatformActivity(item: ContentItem): boolean {
    return ['fb', 'ig', 'yt', 'tt'].some(p => item.target_platforms?.includes(p));
  }

  platformDotColor(item: ContentItem, key: string): string {
    if (!item.target_platforms?.includes(key)) return 'var(--ink-border)';
    const status = (item as any)[`${key}_status`];
    if (status === 'posted') return '#00cc70';
    if (status === 'failed') return '#ff3636';
    if (status === 'posting' || status === 'pending') return '#ff8c00';
    return 'var(--ink-text-3)';
  }

  platformTitle(item: ContentItem, key: string): string {
    if (!item.target_platforms?.includes(key)) return `${key.toUpperCase()}: not targeted`;
    const status = (item as any)[`${key}_status`] ?? 'not started';
    return `${key.toUpperCase()}: ${status}`;
  }

  platformRows(item: ContentItem): { key: string; label: string; targeted: boolean; status: string; dotColor: string; badgeClass: string; postId: string | null }[] {
    return [
      { key: 'fb', label: 'FB', idField: 'fb_post_id' },
      { key: 'ig', label: 'IG', idField: 'ig_post_id' },
      { key: 'yt', label: 'YT', idField: 'yt_video_id' },
      { key: 'tt', label: 'TT', idField: 'tt_video_id' },
    ].map(({ key, label, idField }) => {
      const targeted = item.target_platforms?.includes(key) ?? false;
      const status   = (item as any)[`${key}_status`] ?? (targeted ? 'not started' : '—');
      const dotColor = this.platformDotColor(item, key);
      const badgeClass = status === 'posted' ? 'ib-standard' : status === 'failed' ? 'ib-breaking' : status !== '—' && status !== 'not started' ? 'ib-alert' : '';
      return { key, label, targeted, status, dotColor, badgeClass, postId: targeted ? (item as any)[idField] ?? null : null };
    });
  }
}
