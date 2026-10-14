import { Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EngineApiService, EngineProject } from '../core/engine-api.service';
import { EngineNavComponent } from './engine-nav.component';

@Component({
  selector: 'app-project-list',
  standalone: true,
  imports: [RouterLink, EngineNavComponent],
  template: `
    <app-engine-nav />
    <div style="max-width:900px;margin:0 auto;padding:24px 16px;">
      <div
        style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;"
      >
        <h1 style="font-size:20px;font-weight:700;color:var(--ink-text);">Projects</h1>
      </div>
      @if (error()) {
        <div class="ink-surface" style="padding:16px;color:var(--ink-breaking);">{{ error() }}</div>
      }
      @if (!error()) {
        <div style="display:flex;flex-direction:column;gap:8px;">
          @for (p of projects(); track p.id) {
            <a
              [routerLink]="['/engine/projects', p.slug]"
              class="ink-surface"
              style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;text-decoration:none;"
            >
              <div>
                <div style="font-weight:600;color:var(--ink-text);">{{ p.slug }}</div>
                <div style="font-size:12px;color:var(--ink-text-2);">
                  {{ templateOf(p) }} · {{ outputsOf(p).join(', ') }}
                </div>
              </div>
              <span style="color:var(--ink-text-3);">&rarr;</span>
            </a>
          }
          @if (projects().length === 0 && !loading()) {
            <div
              class="ink-surface"
              style="padding:24px;text-align:center;color:var(--ink-text-2);"
            >
              No projects yet.
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class ProjectListComponent implements OnInit {
  projects = signal<EngineProject[]>([]);
  loading = signal(true);
  error = signal('');

  constructor(private api: EngineApiService) {}

  async ngOnInit() {
    try {
      this.projects.set(await this.api.listProjects());
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : String(err));
    } finally {
      this.loading.set(false);
    }
  }

  templateOf(p: EngineProject): string {
    return (
      (((p.config as Record<string, unknown>)['defaults'] as Record<string, unknown> | undefined)?.[
        'template'
      ] as string) ?? ''
    );
  }

  outputsOf(p: EngineProject): string[] {
    return (
      (((p.config as Record<string, unknown>)['defaults'] as Record<string, unknown> | undefined)?.[
        'outputs'
      ] as string[]) ?? []
    );
  }
}
