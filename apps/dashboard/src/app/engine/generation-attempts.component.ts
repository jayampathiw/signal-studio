import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  EngineApiError,
  EngineApiService,
  EngineProject,
  ShotPurposeReportRow,
} from '../core/engine-api.service';
import { EngineNavComponent } from './engine-nav.component';

/**
 * P5.6 — the real replacement for `production-log.csv`: a form to log a
 * generation attempt (success/fail per shot purpose) plus the weekly
 * failure report grouped by shot purpose (`GenerationAttemptsRepo.
 * weeklyReport`).
 */
@Component({
  selector: 'app-generation-attempts',
  standalone: true,
  imports: [FormsModule, EngineNavComponent],
  template: `
    <app-engine-nav />
    <div style="max-width:720px;margin:0 auto;padding:24px 16px;">
      <h1 style="font-size:20px;font-weight:700;color:var(--ink-text);margin-bottom:16px;">
        Generation attempts
      </h1>

      @if (error()) {
        <div class="ink-surface" style="padding:16px;margin-bottom:16px;color:var(--ink-breaking);">
          {{ error() }}
        </div>
      }

      <div class="ink-surface" style="padding:16px;margin-bottom:16px;">
        <div style="display:flex;flex-direction:column;gap:8px;">
          <select class="ink-input" [(ngModel)]="selectedSlug" (ngModelChange)="loadReport()">
            @for (p of projects(); track p.id) {
              <option [value]="p.slug">{{ p.slug }}</option>
            }
          </select>
          <input
            class="ink-input"
            placeholder="Shot purpose (e.g. wildlife-b-roll)"
            [(ngModel)]="shotPurpose"
          />
          <textarea
            class="ink-input"
            rows="2"
            placeholder="Note (optional)"
            [(ngModel)]="note"
          ></textarea>
          <div style="display:flex;gap:8px;">
            <button
              class="btn-brand"
              style="height:34px;font-size:12px;padding:0 12px;"
              (click)="log(true)"
            >
              Log success
            </button>
            <button
              class="btn-ink"
              style="height:34px;font-size:12px;padding:0 12px;"
              (click)="log(false)"
            >
              Log failure
            </button>
          </div>
        </div>
      </div>

      @if (report().length > 0) {
        <div class="ink-surface" style="padding:16px;">
          <div style="font-size:12px;font-weight:600;color:var(--ink-text-2);margin-bottom:8px;">
            Last 7 days, by shot purpose
          </div>
          <table style="width:100%;font-size:12px;border-collapse:collapse;">
            <thead>
              <tr style="text-align:left;color:var(--ink-text-2);">
                <th style="padding:4px 0;">Shot purpose</th>
                <th>Attempts</th>
                <th>Succeeded</th>
                <th>Failed</th>
              </tr>
            </thead>
            <tbody>
              @for (row of report(); track row.shot_purpose) {
                <tr style="border-top:1px solid var(--ink-border);">
                  <td style="padding:6px 0;font-family:monospace;">{{ row.shot_purpose }}</td>
                  <td>{{ row.attempts }}</td>
                  <td style="color:var(--ink-standard);">{{ row.succeeded }}</td>
                  <td [style.color]="row.failed > 0 ? 'var(--ink-breaking)' : 'var(--ink-text-2)'">
                    {{ row.failed }}
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
})
export class GenerationAttemptsComponent implements OnInit {
  projects = signal<EngineProject[]>([]);
  report = signal<ShotPurposeReportRow[]>([]);
  error = signal('');
  selectedSlug = '';
  shotPurpose = '';
  note = '';

  constructor(private api: EngineApiService) {}

  async ngOnInit() {
    try {
      const projects = await this.api.listProjects();
      this.projects.set(projects);
      if (projects.length > 0) {
        this.selectedSlug = projects[0].slug;
        await this.loadReport();
      }
    } catch (err) {
      this.error.set(this.messageOf(err));
    }
  }

  async loadReport() {
    if (!this.selectedSlug) return;
    try {
      this.report.set(await this.api.generationAttemptsReport(this.selectedSlug));
    } catch (err) {
      this.error.set(this.messageOf(err));
    }
  }

  async log(succeeded: boolean) {
    if (!this.selectedSlug || !this.shotPurpose) return;
    try {
      await this.api.logGenerationAttempt({
        projectSlug: this.selectedSlug,
        shotPurpose: this.shotPurpose,
        succeeded,
        note: this.note || undefined,
      });
      this.shotPurpose = '';
      this.note = '';
      await this.loadReport();
    } catch (err) {
      this.error.set(this.messageOf(err));
    }
  }

  private messageOf(err: unknown): string {
    return err instanceof EngineApiError
      ? err.message
      : err instanceof Error
        ? err.message
        : String(err);
  }
}
