import { Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LongformProject, LONGFORM_CHANNEL_KEYS, SupabaseService } from '../core/supabase.service';

interface ChannelSummary {
  slug: string;
  channelKey: string;
  pageName: string;
  logoFile: string;
  description: string;
  total: number;
  active: number;
  done: number;
}

const CHANNEL_META: Record<string, { slug: string; pageName: string; logoFile: string; description: string }> = {
  'football/documentary/EN': {
    slug: 'football',
    pageName: 'The Underdog Archives',
    logoFile: 'underdog_archive_standalone_icon.png',
    description: 'Documentary pipeline — stills + narration + Ken Burns',
  },
};

const DONE_STATUSES = new Set(['posted']);
const ACTIVE_STATUSES = new Set(['scripting','awaiting_script_approval','seeding','awaiting_refs','awaiting_stills','rendering','rendered','awaiting_final_approval','publishing']);

@Component({
  selector: 'app-longform-list',
  standalone: true,
  imports: [RouterLink],
  template: `
    <nav style="display:flex;align-items:center;gap:24px;padding:0 20px;height:52px;background:#0d0d0d;border-bottom:1px solid #1e1e1e;position:sticky;top:0;z-index:100;">
      <span style="font-size:13px;font-weight:600;color:#e2e8f0;letter-spacing:.5px;">SIGNAL STUDIO</span>
      <div style="display:flex;gap:4px;">
        <a routerLink="/reels"    style="padding:4px 12px;border-radius:6px;font-size:12px;color:#64748b;text-decoration:none;">Reels</a>
        <a routerLink="/articles" style="padding:4px 12px;border-radius:6px;font-size:12px;color:#64748b;text-decoration:none;">Articles</a>
        <a routerLink="/longform" style="padding:4px 12px;border-radius:6px;font-size:12px;color:#e2e8f0;text-decoration:none;background:#1e1e1e;">Video Channels</a>
      </div>
    </nav>

    <div style="max-width:960px;margin:0 auto;padding:32px 20px;">
      <div style="margin-bottom:28px;">
        <h1 style="margin:0;font-size:22px;font-weight:700;color:#e2e8f0;">Longform Channels</h1>
        <p style="margin:4px 0 0;font-size:13px;color:#475569;">Select a channel to browse its videos</p>
      </div>

      @if (loading()) {
        <div style="text-align:center;padding:60px 0;color:#475569;font-size:14px;">Loading…</div>
      }

      @if (!loading()) {
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;">
          @for (ch of channels(); track ch.slug) {
            <a [routerLink]="['/longform/channel', ch.slug]"
               style="display:block;padding:24px;border-radius:12px;background:#111;border:1px solid #1a1a1a;text-decoration:none;transition:border-color .15s,background .15s;"
               (mouseenter)="hoverIn($event)"
               (mouseleave)="hoverOut($event)">
              <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">
                <img [src]="'logos/' + ch.logoFile" [alt]="ch.pageName"
                     style="width:48px;height:48px;border-radius:8px;object-fit:contain;background:#1a1a1a;padding:4px;">
                <div style="font-size:16px;font-weight:700;color:#e2e8f0;line-height:1.3;">{{ ch.pageName }}</div>
              </div>
              <div style="font-size:12px;color:#475569;margin-bottom:16px;line-height:1.5;">{{ ch.description }}</div>
              <div style="display:flex;gap:16px;">
                <div style="text-align:center;">
                  <div style="font-size:22px;font-weight:700;color:#e2e8f0;">{{ ch.total }}</div>
                  <div style="font-size:11px;color:#475569;">Total</div>
                </div>
                <div style="text-align:center;">
                  <div style="font-size:22px;font-weight:700;color:#f59e0b;">{{ ch.active }}</div>
                  <div style="font-size:11px;color:#475569;">In Progress</div>
                </div>
                <div style="text-align:center;">
                  <div style="font-size:22px;font-weight:700;color:#4ade80;">{{ ch.done }}</div>
                  <div style="font-size:11px;color:#475569;">Posted</div>
                </div>
              </div>
            </a>
          }
        </div>
      }
    </div>
  `,
})
export class LongformListComponent implements OnInit {
  channels = signal<ChannelSummary[]>([]);
  loading  = signal(true);

  constructor(private svc: SupabaseService) {}

  async ngOnInit() {
    try {
      const videos = await this.svc.getLongformProjects();
      const grouped = new Map<string, LongformProject[]>();
      for (const key of LONGFORM_CHANNEL_KEYS) grouped.set(key, []);
      for (const v of videos) {
        grouped.get(v.channel_key)?.push(v);
      }
      this.channels.set(
        LONGFORM_CHANNEL_KEYS.map(key => {
          const meta = CHANNEL_META[key];
          const items = grouped.get(key) ?? [];
          return {
            slug:        meta.slug,
            pageName:    meta.pageName,
            logoFile:    meta.logoFile,
            description: meta.description,
            channelKey: key,
            total:  items.length,
            active: items.filter(v => ACTIVE_STATUSES.has(v.status)).length,
            done:   items.filter(v => DONE_STATUSES.has(v.status)).length,
          };
        })
      );
    } finally {
      this.loading.set(false);
    }
  }

  hoverIn(e: MouseEvent)  { (e.currentTarget as HTMLElement).style.borderColor = '#334155'; }
  hoverOut(e: MouseEvent) { (e.currentTarget as HTMLElement).style.borderColor = '#1a1a1a'; }
}
