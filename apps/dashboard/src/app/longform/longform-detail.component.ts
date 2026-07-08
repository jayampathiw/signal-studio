import { Component, OnInit, signal, computed } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { LongformProject, SupabaseService } from '../core/supabase.service';
import { LongformWorkbenchComponent } from './longform-workbench.component';
import { LongformScriptComponent } from './longform-script.component';
import { LongformFinalReviewComponent } from './longform-final-review.component';
import { LongformAudioComponent } from './longform-audio.component';

type Stage = {
  key: string;
  label: string;
  icon: string;
  description: string;
  action?: { label: string; stage: string };
};

const STAGES: Stage[] = [
  { key: 'brief',                    icon: '1', label: 'Brief',            description: 'Project created. Waiting for script.' },
  { key: 'scripting',                icon: '2', label: 'Scripting',        description: 'AI is writing the script.' },
  { key: 'awaiting_script_approval', icon: '3', label: 'Gate 1 — Script',  description: 'Review the script and approve to continue.',
    action: { label: 'Approve script → Seed', stage: 'seed' } },
  { key: 'seeding',                  icon: '4', label: 'Seeding',          description: 'AI is generating reference images.' },
  { key: 'awaiting_refs',            icon: '5', label: 'Gate 2 — Refs',    description: 'Review reference images and approve.',
    action: { label: 'Approve refs → Stills', stage: 'tts' } },
  { key: 'awaiting_stills',          icon: '6', label: 'Gate 3 — Stills',  description: 'Review all scene stills and approve.',
    action: { label: 'Approve stills → Render', stage: 'assemble' } },
  { key: 'rendering',                icon: '7', label: 'Rendering',        description: 'FFmpeg is assembling the final video.' },
  { key: 'rendered',                 icon: '8', label: 'Rendered',         description: 'Video assembled. Ready for final review.' },
  { key: 'awaiting_final_approval',  icon: '9', label: 'Gate 4 — Review',  description: 'Watch the video and approve to publish.' },
  { key: 'publishing',               icon: '10', label: 'Publishing',      description: 'Uploading to YouTube / Facebook.' },
  { key: 'posted',                   icon: '✓',  label: 'Posted',          description: 'Live on all configured platforms.' },
];

const STATUS_ORDER = STAGES.map(s => s.key);

function stageIndex(status: string) {
  const i = STATUS_ORDER.indexOf(status);
  return i < 0 ? 0 : i;
}

@Component({
  selector: 'app-longform-detail',
  standalone: true,
  imports: [DatePipe, RouterLink, LongformWorkbenchComponent, LongformScriptComponent, LongformFinalReviewComponent, LongformAudioComponent],
  template: `
    <!-- Navbar -->
    <nav style="display:flex;align-items:center;justify-content:space-between;padding:0 20px;height:52px;background:#0d0d0d;border-bottom:1px solid #1e1e1e;position:sticky;top:0;z-index:100;">
      <div style="display:flex;align-items:center;gap:24px;">
        <span style="font-size:13px;font-weight:600;color:#e2e8f0;letter-spacing:.5px;">SIGNAL STUDIO</span>
        <div style="display:flex;gap:4px;">
          <a routerLink="/reels"    style="padding:4px 12px;border-radius:6px;font-size:12px;color:#64748b;text-decoration:none;">Reels</a>
          <a routerLink="/articles" style="padding:4px 12px;border-radius:6px;font-size:12px;color:#64748b;text-decoration:none;">Articles</a>
          <a routerLink="/longform" style="padding:4px 12px;border-radius:6px;font-size:12px;color:#e2e8f0;text-decoration:none;background:#1e1e1e;">Longform</a>
        </div>
      </div>
    </nav>

    <div style="max-width:960px;margin:0 auto;padding:32px 20px;">

      <!-- Loading -->
      @if (loading()) {
        <div style="text-align:center;padding:80px 0;color:#475569;font-size:14px;">Loading project…</div>
      }

      <!-- Error -->
      @if (error()) {
        <div style="padding:16px;border-radius:8px;background:rgba(248,113,113,.1);border:1px solid rgba(248,113,113,.2);color:#f87171;font-size:13px;">
          {{ error() }}
        </div>
      }

      @if (!loading() && project()) {
        <!-- Back link + title -->
        <div style="margin-bottom:24px;">
          <a [routerLink]="backLink()" style="font-size:12px;color:#475569;text-decoration:none;">← Back to videos</a>
          <h1 style="margin:8px 0 4px;font-size:22px;font-weight:700;color:#e2e8f0;">
            {{ project()!.title ?? 'Untitled Project #' + project()!.id }}
          </h1>
          <div style="font-size:12px;color:#475569;">
            #{{ project()!.id }} · {{ project()!.channel_key }} · created {{ project()!.created_at | date:'dd MMM yyyy' }}
          </div>
        </div>

        <!-- Stage tracker -->
        <div style="background:#111;border:1px solid #1a1a1a;border-radius:12px;padding:24px;margin-bottom:24px;">
          <h2 style="margin:0 0 20px;font-size:14px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.8px;">Pipeline stages</h2>

          <div style="display:flex;flex-direction:column;gap:0;">
            @for (stage of stages; track stage.key; let i = $index) {
              @let sIdx = currentStageIndex();
              @let done = i < sIdx;
              @let active = i === sIdx;
              @let future = i > sIdx;

              <div style="display:flex;gap:16px;align-items:flex-start;padding:12px 0;"
                   [style.opacity]="future ? '0.35' : '1'">

                <!-- Circle -->
                <div style="width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:12px;font-weight:700;transition:all .2s;"
                     [style.background]="done ? '#16a34a' : active ? '#2563eb' : '#1a1a1a'"
                     [style.border]="active ? '2px solid #3b82f6' : done ? '2px solid #16a34a' : '2px solid #262626'"
                     [style.color]="(done || active) ? 'white' : '#475569'">
                  {{ done ? '✓' : stage.icon }}
                </div>

                <!-- Label + description + action -->
                <div style="flex:1;padding-top:6px;">
                  <div style="font-size:13px;font-weight:600;"
                       [style.color]="active ? '#e2e8f0' : done ? '#4ade80' : '#475569'">
                    {{ stage.label }}
                  </div>
                  @if (active) {
                    <div style="font-size:12px;color:#64748b;margin-top:2px;">{{ stage.description }}</div>

                    @if (stage.action) {
                      <button (click)="triggerStage(stage.action!.stage)"
                              [disabled]="triggering()"
                              style="margin-top:10px;padding:7px 16px;border-radius:7px;background:#2563eb;color:white;border:none;font-size:12px;font-weight:600;cursor:pointer;transition:opacity .15s;"
                              [style.opacity]="triggering() ? '0.5' : '1'">
                        {{ triggering() ? 'Dispatching…' : stage.action!.label }}
                      </button>
                    }

                    @if (triggerResult()) {
                      <div style="margin-top:8px;font-size:12px;"
                           [style.color]="triggerResult()!.ok ? '#4ade80' : '#f87171'">
                        {{ triggerResult()!.message }}
                        @if (triggerResult()!.ok && triggerResult()!.runUrl) {
                          · <a [href]="triggerResult()!.runUrl" target="_blank" style="color:#60a5fa;">View run ↗</a>
                        }
                      </div>
                    }

                    @if (project()!.status_note) {
                      <div style="margin-top:6px;font-size:11px;color:#64748b;font-family:monospace;background:#0d0d0d;padding:8px 10px;border-radius:6px;max-height:80px;overflow:auto;">
                        {{ project()!.status_note }}
                      </div>
                    }
                  }
                </div>

                <!-- Connector line -->
                @if (i < stages.length - 1) {
                  <div style="position:absolute;left:36px;width:2px;height:24px;background:#1a1a1a;margin-top:44px;"></div>
                }
              </div>
            }
          </div>
        </div>

        <!-- Script viewer (Gate 1) -->
        @if (project()!.status === 'awaiting_script_approval') {
          <app-longform-script [projectId]="project()!.id" />
        }

        <!-- Stills workbench (Gate 2 / Gate 3) -->
        @if (isWorkbenchGate()) {
          <app-longform-workbench [project]="project()!" />
        }

        <!-- Gate 4: full review + publish (awaiting_final_approval only) -->
        @if (project()!.status === 'awaiting_final_approval') {
          <app-longform-final-review
            [project]="project()!"
            (published)="onPublished()" />
        }

        <!-- Generic video + SEO (rendered / publishing / posted) -->
        @if (isSimpleVideoState()) {
          <div style="background:#111;border:1px solid #1a1a1a;border-radius:12px;overflow:hidden;margin-bottom:24px;">
            <div style="padding:16px 20px;border-bottom:1px solid #1a1a1a;">
              <h2 style="margin:0;font-size:14px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.8px;">Video</h2>
            </div>
            @if (project()!.rendered_video_url) {
              <video [src]="project()!.rendered_video_url!"
                     controls
                     preload="metadata"
                     style="width:100%;display:block;background:#000;max-height:540px;">
              </video>
            } @else {
              <div style="padding:40px 0;text-align:center;color:#475569;font-size:13px;">Video URL not set yet.</div>
            }
          </div>

          @if (project()!.seo) {
            <div style="background:#111;border:1px solid #1a1a1a;border-radius:12px;padding:20px;">
              <div style="font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.6px;margin-bottom:14px;">SEO</div>
              <div style="margin-bottom:10px;">
                <div style="font-size:10px;color:#475569;margin-bottom:3px;">Title</div>
                <div style="font-size:14px;color:#e2e8f0;">{{ project()!.seo!.title }}</div>
              </div>
              <div style="margin-bottom:10px;">
                <div style="font-size:10px;color:#475569;margin-bottom:3px;">Description</div>
                <div style="font-size:13px;color:#94a3b8;white-space:pre-wrap;">{{ project()!.seo!.description }}</div>
              </div>
              @if (project()!.seo!.hashtags?.length) {
                <div>
                  <div style="font-size:10px;color:#475569;margin-bottom:6px;">Hashtags</div>
                  <div style="display:flex;flex-wrap:wrap;gap:6px;">
                    @for (tag of project()!.seo!.hashtags; track tag) {
                      <span style="padding:2px 8px;background:#1e1e1e;border-radius:4px;font-size:12px;color:#60a5fa;">#{{ tag }}</span>
                    }
                  </div>
                </div>
              }
            </div>
          }
        }
        <!-- Audio plan editor (always shown) -->
        <app-longform-audio [project]="project()!" />
      }
    </div>
  `,
})
export class LongformDetailComponent implements OnInit {
  project    = signal<LongformProject | null>(null);
  loading    = signal(true);
  error      = signal<string | null>(null);
  triggering = signal(false);
  triggerResult = signal<{ ok: boolean; message: string; runUrl?: string | null } | null>(null);

  stages = STAGES;

  currentStageIndex = computed(() => stageIndex(this.project()?.status ?? 'brief'));
  backLink = computed(() => {
    const ch = this.project()?.channel_key;
    if (ch === 'football/documentary/EN') return ['/longform/channel', 'football'];
    return ['/longform'];
  });

  isSimpleVideoState = computed(() => {
    const s = this.project()?.status;
    return s === 'rendered' || s === 'publishing' || s === 'posted';
  });

  isWorkbenchGate = computed(() => {
    const s = this.project()?.status;
    return s === 'awaiting_refs' || s === 'awaiting_stills';
  });

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private svc: SupabaseService,
  ) {}

  async ngOnInit() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!id) { this.router.navigate(['/longform']); return; }
    try {
      this.project.set(await this.svc.getLongformProject(id));
      if (!this.project()) this.error.set('Project not found.');
    } catch (e: any) {
      this.error.set(e.message);
    } finally {
      this.loading.set(false);
    }
  }

  async onPublished() {
    const p = this.project();
    if (!p) return;
    const updated = await this.svc.getLongformProject(p.id);
    if (updated) this.project.set(updated);
  }

  async triggerStage(stage: string) {
    const p = this.project();
    if (!p) return;
    this.triggering.set(true);
    this.triggerResult.set(null);
    try {
      const res = await this.svc.triggerLongform(p.id, stage);
      this.triggerResult.set({
        ok: true,
        message: res.dispatched ? 'Workflow dispatched.' : 'Already in progress.',
        runUrl: res.runUrl,
      });
      // Refresh project status after a short delay
      setTimeout(async () => {
        const updated = await this.svc.getLongformProject(p.id);
        if (updated) this.project.set(updated);
      }, 2000);
    } catch (e: any) {
      this.triggerResult.set({ ok: false, message: e.message });
    } finally {
      this.triggering.set(false);
    }
  }
}
