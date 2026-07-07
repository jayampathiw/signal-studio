import { Component, OnInit, signal, computed } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { LongformProject, SupabaseService } from '../core/supabase.service';

const CHANNEL_SLUG_MAP: Record<string, string> = {
  'football': 'football/documentary/EN',
};

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  brief:                    { label: 'Brief',            color: '#94a3b8', bg: 'rgba(148,163,184,.12)' },
  scripting:                { label: 'Scripting',        color: '#60a5fa', bg: 'rgba(96,165,250,.12)'  },
  awaiting_script_approval: { label: 'Gate 1 — Script',  color: '#60a5fa', bg: 'rgba(96,165,250,.12)'  },
  seeding:                  { label: 'Seeding',          color: '#f59e0b', bg: 'rgba(245,158,11,.12)'  },
  awaiting_refs:            { label: 'Gate 2 — Refs',    color: '#f59e0b', bg: 'rgba(245,158,11,.12)'  },
  awaiting_stills:          { label: 'Gate 3 — Stills',  color: '#fb923c', bg: 'rgba(251,146,60,.12)'  },
  rendering:                { label: 'Rendering',        color: '#a78bfa', bg: 'rgba(167,139,250,.12)' },
  rendered:                 { label: 'Rendered',         color: '#a78bfa', bg: 'rgba(167,139,250,.12)' },
  awaiting_final_approval:  { label: 'Gate 4 — Review',  color: '#34d399', bg: 'rgba(52,211,153,.15)'  },
  publishing:               { label: 'Publishing',       color: '#22d3ee', bg: 'rgba(34,211,238,.12)'  },
  posted:                   { label: 'Posted',           color: '#4ade80', bg: 'rgba(74,222,128,.12)'  },
  failed:                   { label: 'Failed',           color: '#f87171', bg: 'rgba(248,113,113,.12)' },
  blocked:                  { label: 'Blocked',          color: '#f87171', bg: 'rgba(248,113,113,.12)' },
};

type FilterTab = 'all' | 'pending' | 'active' | 'review' | 'done' | 'failed';

const TAB_STATUSES: Record<FilterTab, string[]> = {
  all:     [],
  pending: ['brief'],
  active:  ['scripting','awaiting_script_approval','seeding','awaiting_refs','awaiting_stills','rendering','rendered'],
  review:  ['awaiting_final_approval'],
  done:    ['publishing','posted'],
  failed:  ['failed','blocked'],
};

@Component({
  selector: 'app-longform-videos',
  standalone: true,
  imports: [RouterLink, DatePipe],
  template: `
    <nav style="display:flex;align-items:center;gap:24px;padding:0 20px;height:52px;background:#0d0d0d;border-bottom:1px solid #1e1e1e;position:sticky;top:0;z-index:100;">
      <span style="font-size:13px;font-weight:600;color:#e2e8f0;letter-spacing:.5px;">SIGNAL STUDIO</span>
      <div style="display:flex;gap:4px;">
        <a routerLink="/reels"    style="padding:4px 12px;border-radius:6px;font-size:12px;color:#64748b;text-decoration:none;">Reels</a>
        <a routerLink="/articles" style="padding:4px 12px;border-radius:6px;font-size:12px;color:#64748b;text-decoration:none;">Articles</a>
        <a routerLink="/longform" style="padding:4px 12px;border-radius:6px;font-size:12px;color:#e2e8f0;text-decoration:none;background:#1e1e1e;">Longform</a>
      </div>
    </nav>

    <div style="max-width:1100px;margin:0 auto;padding:32px 20px;">

      <!-- Breadcrumb -->
      <div style="font-size:12px;color:#475569;margin-bottom:20px;">
        <a routerLink="/longform" style="color:#475569;text-decoration:none;">Longform</a>
        <span style="margin:0 6px;">›</span>
        <span style="color:#94a3b8;">{{ channelLabel() }}</span>
      </div>

      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
        <div>
          <h1 style="margin:0;font-size:20px;font-weight:700;color:#e2e8f0;">{{ channelLabel() }}</h1>
          <p style="margin:4px 0 0;font-size:13px;color:#475569;">{{ filtered().length }} of {{ all().length }} videos</p>
        </div>
      </div>

      <!-- Filter tabs -->
      <div style="display:flex;gap:4px;margin-bottom:20px;border-bottom:1px solid #1a1a1a;padding-bottom:0;">
        @for (tab of tabs; track tab.key) {
          <button (click)="activeTab.set(tab.key)"
                  style="padding:8px 14px;border:none;background:none;cursor:pointer;font-size:12px;font-weight:600;border-bottom:2px solid transparent;margin-bottom:-1px;transition:all .15s;"
                  [style.color]="activeTab() === tab.key ? '#e2e8f0' : '#475569'"
                  [style.border-bottom-color]="activeTab() === tab.key ? '#3b82f6' : 'transparent'">
            {{ tab.label }}
            @if (counts()[tab.key] > 0) {
              <span style="margin-left:5px;padding:1px 6px;border-radius:10px;font-size:10px;"
                    [style.background]="activeTab() === tab.key ? '#1e293b' : 'transparent'"
                    [style.color]="activeTab() === tab.key ? '#94a3b8' : '#334155'">
                {{ counts()[tab.key] }}
              </span>
            }
          </button>
        }
      </div>

      <!-- Loading -->
      @if (loading()) {
        <div style="text-align:center;padding:60px 0;color:#475569;font-size:14px;">Loading videos…</div>
      }

      @if (!loading()) {
        @if (filtered().length === 0) {
          <div style="text-align:center;padding:80px 0;color:#475569;font-size:14px;">No videos in this category.</div>
        } @else {
          <!-- Table -->
          <div style="background:#111;border:1px solid #1a1a1a;border-radius:10px;overflow:hidden;">
            <!-- Header -->
            <div style="display:grid;grid-template-columns:48px 1fr 180px 140px 110px;gap:0;padding:10px 16px;border-bottom:1px solid #1a1a1a;">
              <div style="font-size:11px;color:#334155;font-weight:600;">#</div>
              <div style="font-size:11px;color:#334155;font-weight:600;">TITLE</div>
              <div style="font-size:11px;color:#334155;font-weight:600;">STATUS</div>
              <div style="font-size:11px;color:#334155;font-weight:600;">CREATED</div>
              <div></div>
            </div>

            <!-- Rows -->
            @for (v of filtered(); track v.id; let odd = $odd) {
              <div style="display:grid;grid-template-columns:48px 1fr 180px 140px 110px;align-items:center;gap:0;padding:12px 16px;border-bottom:1px solid #161616;transition:background .1s;"
                   [style.background]="odd ? '#0f0f0f' : '#111'"
                   (mouseenter)="rowIn($event)"
                   (mouseleave)="rowOut($event, odd)">

                <div style="font-size:12px;color:#334155;font-family:monospace;">{{ v.id }}</div>

                <div>
                  <div style="font-size:13px;font-weight:600;color:#e2e8f0;">
                    {{ v.title ?? 'Untitled #' + v.id }}
                  </div>
                  @if (v.status_note) {
                    <div style="font-size:11px;color:#475569;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:420px;">
                      {{ v.status_note }}
                    </div>
                  }
                </div>

                <div>
                  <span [style.color]="sm(v.status).color"
                        [style.background]="sm(v.status).bg"
                        style="padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;white-space:nowrap;">
                    {{ sm(v.status).label }}
                  </span>
                </div>

                <div style="font-size:12px;color:#475569;">{{ v.created_at | date:'dd MMM yyyy' }}</div>

                <div>
                  <a [routerLink]="['/longform/video', v.id]"
                     style="padding:5px 12px;border-radius:6px;background:#1e293b;color:#94a3b8;font-size:12px;font-weight:600;text-decoration:none;white-space:nowrap;">
                    Open →
                  </a>
                </div>
              </div>
            }
          </div>
        }
      }
    </div>
  `,
})
export class LongformVideosComponent implements OnInit {
  all       = signal<LongformProject[]>([]);
  loading   = signal(true);
  activeTab = signal<FilterTab>('all');
  slug      = '';

  tabs: { key: FilterTab; label: string }[] = [
    { key: 'all',     label: 'All'         },
    { key: 'pending', label: 'Pending'     },
    { key: 'active',  label: 'In Progress' },
    { key: 'review',  label: 'Review'      },
    { key: 'done',    label: 'Done'        },
    { key: 'failed',  label: 'Failed'      },
  ];

  filtered = computed(() => {
    const statuses = TAB_STATUSES[this.activeTab()];
    if (!statuses.length) return this.all();
    return this.all().filter(v => statuses.includes(v.status));
  });

  counts = computed(() => {
    const items = this.all();
    const result: Record<string, number> = { all: items.length };
    for (const [tab, statuses] of Object.entries(TAB_STATUSES)) {
      result[tab] = statuses.length ? items.filter(v => statuses.includes(v.status)).length : items.length;
    }
    return result;
  });

  channelLabel = computed(() => {
    const key = CHANNEL_SLUG_MAP[this.slug];
    return key === 'football/documentary/EN' ? '⚽ Football Documentary' : this.slug;
  });

  constructor(private route: ActivatedRoute, private svc: SupabaseService) {}

  async ngOnInit() {
    this.slug = this.route.snapshot.paramMap.get('slug') ?? '';
    const channelKey = CHANNEL_SLUG_MAP[this.slug];
    if (!channelKey) { this.loading.set(false); return; }
    try {
      this.all.set(await this.svc.getLongformByChannel(channelKey));
      // Auto-select review tab if any are awaiting final approval
      const hasReview = this.all().some(v => v.status === 'awaiting_final_approval');
      if (hasReview) this.activeTab.set('review');
    } finally {
      this.loading.set(false);
    }
  }

  sm(status: string) {
    return STATUS_META[status] ?? { label: status, color: '#94a3b8', bg: 'rgba(148,163,184,.12)' };
  }

  rowIn(e: MouseEvent)  { (e.currentTarget as HTMLElement).style.background = '#161616'; }
  rowOut(e: MouseEvent, odd: boolean) { (e.currentTarget as HTMLElement).style.background = odd ? '#0f0f0f' : '#111'; }
}
