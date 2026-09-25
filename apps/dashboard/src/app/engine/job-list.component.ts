import { SlicePipe } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { EngineApiService, EngineJob } from '../core/engine-api.service';
import { EngineNavComponent } from './engine-nav.component';

const STATUS_FAMILIES = ['all', 'active', 'awaiting_review', 'delivered', 'failed'] as const;
type StatusFamily = (typeof STATUS_FAMILIES)[number];

function familyOf(status: string): StatusFamily {
  if (status.startsWith('awaiting_review:')) return 'awaiting_review';
  if (status === 'delivered' || status === 'published') return 'delivered';
  if (status === 'failed' || status === 'cancelled') return 'failed';
  return 'active';
}

@Component({
  selector: 'app-job-list',
  standalone: true,
  imports: [RouterLink, EngineNavComponent, SlicePipe],
  template: `
    <app-engine-nav />
    <div style="max-width:960px;margin:0 auto;padding:24px 16px;">
      <a [routerLink]="['/engine/projects', slug]" style="font-size:12px;color:var(--ink-text-2);"
        >&larr; {{ slug }}</a
      >
      <div style="display:flex;align-items:center;justify-content:space-between;margin:8px 0 16px;">
        <h1 style="font-size:20px;font-weight:700;color:var(--ink-text);">Jobs</h1>
        <a
          [routerLink]="['/engine/projects', slug, 'jobs', 'new']"
          class="btn-brand"
          style="height:34px;padding:0 14px;font-size:13px;text-decoration:none;display:flex;align-items:center;"
        >
          + New job
        </a>
      </div>

      <div style="display:flex;gap:6px;margin-bottom:14px;">
        @for (f of families; track f) {
          <button
            class="country-pill"
            [class.active]="filter() === f"
            (click)="filter.set(f)"
            style="text-transform:capitalize;"
          >
            {{ f.replace('_', ' ') }}
          </button>
        }
      </div>

      @if (error()) {
        <div class="ink-surface" style="padding:16px;color:var(--ink-breaking);">{{ error() }}</div>
      }

      <div style="display:flex;flex-direction:column;gap:6px;">
        @for (job of filtered(); track job.id) {
          <a
            [routerLink]="['/engine/jobs', job.id]"
            class="ink-surface"
            style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;text-decoration:none;"
          >
            <span style="font-family:monospace;font-size:12px;color:var(--ink-text-2);">{{
              job.id.slice(0, 8)
            }}</span>
            <span
              style="font-size:12px;font-weight:600;padding:2px 8px;border-radius:4px;"
              [style.color]="statusColor(job.status)"
              >{{ job.status }}</span
            >
            <span style="font-size:11px;color:var(--ink-text-3);">{{
              job.created_at | slice: 0 : 16
            }}</span>
          </a>
        }
        @if (filtered().length === 0 && !loading()) {
          <div class="ink-surface" style="padding:24px;text-align:center;color:var(--ink-text-2);">
            No jobs in this filter.
          </div>
        }
      </div>
    </div>
  `,
  // `slice` is used as a pure string pipe below via Angular's built-in
  // `SlicePipe` — imported separately so the standalone component doesn't
  // need the whole CommonModule for one pipe.
})
export class JobListComponent implements OnInit {
  slug = '';
  jobs = signal<EngineJob[]>([]);
  loading = signal(true);
  error = signal('');
  filter = signal<StatusFamily>('all');
  families = STATUS_FAMILIES;

  constructor(
    private route: ActivatedRoute,
    private api: EngineApiService,
  ) {}

  async ngOnInit() {
    this.slug = this.route.snapshot.paramMap.get('slug') ?? '';
    try {
      this.jobs.set(await this.api.listJobs(this.slug));
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : String(err));
    } finally {
      this.loading.set(false);
    }
  }

  filtered(): EngineJob[] {
    const f = this.filter();
    if (f === 'all') return this.jobs();
    return this.jobs().filter((j) => familyOf(j.status) === f);
  }

  statusColor(status: string): string {
    const f = familyOf(status);
    if (f === 'delivered') return 'var(--ink-standard)';
    if (f === 'failed') return 'var(--ink-breaking)';
    if (f === 'awaiting_review') return 'var(--ink-alert)';
    return 'var(--ink-trending)';
  }
}
