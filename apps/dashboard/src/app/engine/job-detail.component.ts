import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  EngineApiError,
  EngineApiService,
  EngineArtifact,
  EngineJob,
  EngineLogEntry,
  EngineStage,
} from '../core/engine-api.service';
import { EngineNavComponent } from './engine-nav.component';

type ShotAsset = {
  id: string;
  filename: string;
  status: 'pending' | 'uploading' | 'uploaded' | 'error';
  progress: number;
};

/**
 * P5.3 (Jobs detail) + P5.5 (Assets + Review), combined on one page rather
 * than three separate routes — a job's stage timeline, its `job_log` tail,
 * its rendered-output artifacts, its raw-asset upload slots (when still
 * `created`/`awaiting_assets`), and its gate approve/reject controls (when
 * `awaiting_review:<gate>`) are all facts about the SAME job, and a
 * reviewer needs to see the render/log/artifacts right next to the
 * approve/reject buttons to make that call — splitting them across pages
 * would just mean tab-switching to see the thing being reviewed.
 */
@Component({
  selector: 'app-job-detail',
  standalone: true,
  imports: [FormsModule, RouterLink, EngineNavComponent],
  template: `
    <app-engine-nav />
    <div style="max-width:820px;margin:0 auto;padding:24px 16px;">
      <a routerLink="/engine/projects" style="font-size:12px;color:var(--ink-text-2);"
        >&larr; Projects</a
      >

      @if (error()) {
        <div class="ink-surface" style="padding:16px;margin-top:12px;color:var(--ink-breaking);">
          {{ error() }}
        </div>
      }

      @if (job(); as j) {
        <div
          style="display:flex;align-items:center;justify-content:space-between;margin:8px 0 16px;"
        >
          <div>
            <h1 style="font-size:18px;font-family:monospace;color:var(--ink-text);">{{ j.id }}</h1>
            <span style="font-size:12px;font-weight:600;color:var(--ink-text-2);">{{
              j.status
            }}</span>
          </div>
          <div style="display:flex;gap:8px;">
            @if (['created', 'awaiting_assets'].includes(j.status)) {
              <button
                class="btn-brand"
                style="height:32px;font-size:12px;padding:0 12px;"
                (click)="queue()"
              >
                Queue &amp; dispatch
              </button>
            }
            @if (j.status === 'failed') {
              <button
                class="btn-brand"
                style="height:32px;font-size:12px;padding:0 12px;"
                (click)="retry()"
              >
                Re-run
              </button>
            }
            @if (!['delivered', 'published', 'failed', 'cancelled'].includes(j.status)) {
              <button
                class="btn-ink"
                style="height:32px;font-size:12px;padding:0 12px;"
                (click)="cancel()"
              >
                Cancel
              </button>
            }
          </div>
        </div>

        @if (j.status.startsWith('awaiting_review:')) {
          <div
            class="ink-surface"
            style="padding:16px;margin-bottom:16px;display:flex;flex-direction:column;gap:8px;"
          >
            <div style="font-size:12px;font-weight:600;color:var(--ink-alert);">
              Awaiting review: {{ j.status.split(':')[1] }}
            </div>
            <div style="display:flex;gap:8px;">
              <button
                class="btn-brand"
                style="height:32px;font-size:12px;padding:0 12px;"
                (click)="approve()"
              >
                Approve
              </button>
            </div>
            <div style="display:flex;gap:8px;">
              <input
                class="ink-input"
                placeholder="Rejection note"
                [(ngModel)]="rejectNote"
                style="flex:1;"
              />
              <button
                class="btn-ink"
                style="height:32px;font-size:12px;padding:0 12px;"
                (click)="reject()"
                [disabled]="!rejectNote"
              >
                Reject
              </button>
            </div>
          </div>
        }

        @if (shotAssets().length > 0 && ['created', 'awaiting_assets'].includes(j.status)) {
          <div class="ink-surface" style="padding:16px;margin-bottom:16px;">
            <div style="font-size:12px;font-weight:600;color:var(--ink-text-2);margin-bottom:8px;">
              Assets
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;">
              @for (shot of shotAssets(); track shot.id) {
                <div style="display:flex;align-items:center;gap:8px;">
                  <span style="font-family:monospace;font-size:12px;width:80px;">{{
                    shot.id
                  }}</span>
                  <span style="font-size:12px;color:var(--ink-text-3);flex:1;">{{
                    shot.filename
                  }}</span>
                  <span
                    style="font-size:11px;"
                    [style.color]="
                      shot.status === 'uploaded'
                        ? 'var(--ink-standard)'
                        : shot.status === 'error'
                          ? 'var(--ink-breaking)'
                          : 'var(--ink-text-2)'
                    "
                    >{{ shot.status
                    }}{{ shot.status === 'uploading' ? ' ' + shot.progress + '%' : '' }}</span
                  >
                  <input
                    type="file"
                    (change)="uploadFile(shot, $event)"
                    style="font-size:11px;width:140px;"
                  />
                </div>
              }
            </div>
          </div>
        }

        @if (stages().length > 0) {
          <div class="ink-surface" style="padding:16px;margin-bottom:16px;">
            <div style="font-size:12px;font-weight:600;color:var(--ink-text-2);margin-bottom:8px;">
              Stage timeline
            </div>
            <div style="display:flex;flex-direction:column;gap:4px;">
              @for (s of stages(); track s.stage_name + s.output_id) {
                <div style="display:flex;align-items:center;gap:10px;font-size:12px;">
                  <span style="width:70px;font-weight:600;" [style.color]="stageColor(s.status)">{{
                    s.status
                  }}</span>
                  <span style="font-family:monospace;"
                    >{{ s.stage_name }}{{ s.output_id ? ':' + s.output_id : '' }}</span
                  >
                  @if (s.warnings && s.warnings.length) {
                    <span style="color:var(--ink-alert);">&#9888; {{ s.warnings.join('; ') }}</span>
                  }
                </div>
              }
            </div>
          </div>
        }

        @if (artifacts().length > 0) {
          <div class="ink-surface" style="padding:16px;margin-bottom:16px;">
            <div style="font-size:12px;font-weight:600;color:var(--ink-text-2);margin-bottom:8px;">
              Artifacts
            </div>
            <div style="display:flex;flex-direction:column;gap:10px;">
              @for (a of artifacts(); track a.id) {
                <div>
                  <div style="font-size:11px;color:var(--ink-text-3);margin-bottom:4px;">
                    {{ a.stage_name }} · {{ a.kind }}
                  </div>
                  @if (isVideo(a.url)) {
                    <video [src]="a.url" controls style="max-width:100%;max-height:280px;"></video>
                  } @else if (isImage(a.url)) {
                    <img [src]="a.url" style="max-width:100%;max-height:280px;" />
                  } @else {
                    <a
                      [href]="a.url"
                      target="_blank"
                      style="font-size:12px;color:var(--ink-brand);"
                      >{{ a.url }}</a
                    >
                  }
                </div>
              }
            </div>
          </div>
        }

        <div class="ink-surface" style="padding:16px;">
          <div style="font-size:12px;font-weight:600;color:var(--ink-text-2);margin-bottom:8px;">
            Log
          </div>
          <pre
            style="font-size:11px;color:var(--ink-text-2);white-space:pre-wrap;max-height:320px;overflow:auto;margin:0;"
            >{{ logText() }}</pre>
        </div>
      }
    </div>
  `,
})
export class JobDetailComponent implements OnInit {
  jobId = '';
  job = signal<EngineJob | null>(null);
  stages = signal<EngineStage[]>([]);
  artifacts = signal<EngineArtifact[]>([]);
  log = signal<EngineLogEntry[]>([]);
  error = signal('');
  rejectNote = '';

  constructor(
    private route: ActivatedRoute,
    private api: EngineApiService,
  ) {}

  async ngOnInit() {
    this.jobId = this.route.snapshot.paramMap.get('id') ?? '';
    await this.refresh();
  }

  async refresh() {
    try {
      const [job, stages, artifacts, log] = await Promise.all([
        this.api.getJob(this.jobId),
        this.api.getJobStages(this.jobId),
        this.api.getJobArtifacts(this.jobId),
        this.api.getJobLog(this.jobId, 200),
      ]);
      this.job.set(job);
      this.stages.set(stages);
      this.artifacts.set(artifacts);
      this.log.set(log);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : String(err));
    }
  }

  logText(): string {
    return this.log()
      .map((l) => `[${l.created_at}] ${l.stage_name ?? '-'}: ${l.message}`)
      .join('\n');
  }

  shotAssets(): ShotAsset[] {
    const j = this.job();
    if (!j) return [];
    const shots = (j.manifest['shots'] as Array<Record<string, unknown>> | undefined) ?? [];
    return shots
      .filter((s) => s['clip'] || s['image'])
      .map((s) => ({
        id: s['id'] as string,
        filename: (s['clip'] ?? s['image']) as string,
        status: 'pending' as const,
        progress: 0,
      }));
  }

  async uploadFile(shot: ShotAsset, event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    shot.status = 'uploading';
    try {
      const { url } = await this.api.presignUpload(this.jobId, shot.id, file.name);
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', url);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) shot.progress = Math.round((e.loaded / e.total) * 100);
        };
        xhr.onload = () =>
          xhr.status >= 200 && xhr.status < 300
            ? resolve()
            : reject(new Error(`upload failed (${xhr.status})`));
        xhr.onerror = () => reject(new Error('upload failed'));
        xhr.send(file);
      });
      shot.status = 'uploaded';
    } catch {
      shot.status = 'error';
    }
  }

  stageColor(status: string): string {
    if (status === 'done') return 'var(--ink-standard)';
    if (status === 'failed') return 'var(--ink-breaking)';
    if (status === 'running') return 'var(--ink-trending)';
    return 'var(--ink-text-3)';
  }

  isVideo(url: string): boolean {
    return /\.(mp4|mov|webm)(\?|$)/i.test(url);
  }
  isImage(url: string): boolean {
    return /\.(png|jpe?g|webp|gif)(\?|$)/i.test(url);
  }

  async approve() {
    try {
      this.job.set(await this.api.approveJob(this.jobId));
      await this.refresh();
    } catch (err) {
      this.error.set(this.messageOf(err));
    }
  }

  async reject() {
    if (!this.rejectNote) return;
    try {
      this.job.set(await this.api.rejectJob(this.jobId, this.rejectNote));
      this.rejectNote = '';
      await this.refresh();
    } catch (err) {
      this.error.set(this.messageOf(err));
    }
  }

  async cancel() {
    try {
      this.job.set(await this.api.cancelJob(this.jobId));
    } catch (err) {
      this.error.set(this.messageOf(err));
    }
  }

  async retry() {
    try {
      await this.api.retryJob(this.jobId);
      await this.refresh();
    } catch (err) {
      this.error.set(this.messageOf(err));
    }
  }

  async queue() {
    try {
      await this.api.queueJob(this.jobId);
      await this.refresh();
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
