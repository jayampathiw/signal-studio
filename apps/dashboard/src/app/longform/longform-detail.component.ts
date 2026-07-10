import { Component, OnInit, signal, computed } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DatePipe, DecimalPipe } from '@angular/common';
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
  { key: 'brief',                    icon: '1', label: 'Brief',            description: 'Project created. Waiting for shot list.' },
  { key: 'storyboard',               icon: '2', label: 'Storyboard',       description: 'Shot list imported. Upload your generated still images.' },
  { key: 'awaiting_refs',            icon: '3', label: 'Gate 2 — Refs',    description: 'Review reference images and approve.',
    action: { label: 'Approve refs → Stills', stage: 'tts' } },
  { key: 'awaiting_stills',          icon: '4', label: 'Gate 3 — Stills',  description: 'Review all scene stills and approve.',
    action: { label: 'Approve stills → Render', stage: 'assemble' } },
  { key: 'rendering',                icon: '5', label: 'Rendering',        description: 'FFmpeg is assembling the final video.' },
  { key: 'rendered',                 icon: '6', label: 'Rendered',         description: 'Video assembled. Ready for final review.' },
  { key: 'awaiting_final_approval',  icon: '7', label: 'Gate 4 — Review',  description: 'Watch the video and approve to publish.' },
  { key: 'publishing',               icon: '8', label: 'Publishing',       description: 'Uploading to YouTube / Facebook.' },
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
  imports: [DatePipe, DecimalPipe, RouterLink, LongformWorkbenchComponent, LongformScriptComponent, LongformFinalReviewComponent, LongformAudioComponent],
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
        <div style="background:#111;border:1px solid #1a1a1a;border-radius:12px;padding:20px 24px;margin-bottom:24px;">

          <!-- Horizontal strip -->
          <div style="display:flex;align-items:flex-start;overflow-x:auto;padding-bottom:4px;gap:0;">
            @for (stage of stages; track stage.key; let i = $index) {
              @let sIdx = currentStageIndex();
              @let done = i < sIdx;
              @let active = i === sIdx;
              @let future = i > sIdx;

              <!-- Stage node -->
              <div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0;min-width:72px;max-width:88px;opacity:1;"
                   [style.opacity]="future ? '0.35' : '1'">
                <div style="width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;transition:all .2s;flex-shrink:0;"
                     [style.background]="done ? '#16a34a' : active ? '#2563eb' : '#1a1a1a'"
                     [style.border]="active ? '2px solid #3b82f6' : done ? '2px solid #16a34a' : '2px solid #262626'"
                     [style.color]="(done || active) ? 'white' : '#475569'">
                  {{ done ? '✓' : stage.icon }}
                </div>
                <div style="margin-top:6px;font-size:10px;font-weight:600;text-align:center;line-height:1.3;word-break:break-word;padding:0 4px;"
                     [style.color]="active ? '#e2e8f0' : done ? '#4ade80' : '#475569'">
                  {{ stage.label }}
                </div>
              </div>

              <!-- Connector between nodes -->
              @if (i < stages.length - 1) {
                <div style="flex:1;height:2px;min-width:12px;margin-top:14px;flex-shrink:1;"
                     [style.background]="i < sIdx ? '#16a34a' : '#262626'"></div>
              }
            }
          </div>

          <!-- Active stage detail (below the strip) -->
          @let activeStage = stages[currentStageIndex()];
          @if (activeStage) {
            <div style="margin-top:16px;padding-top:16px;border-top:1px solid #1a1a1a;">
              <div style="font-size:12px;color:#64748b;margin-bottom:10px;">{{ activeStage.description }}</div>

              <!-- Shot list upload (brief stage only) -->
              @if (activeStage.key === 'brief') {
                <div style="padding:16px;background:#0d0d0d;border:1px solid #1e1e1e;border-radius:8px;">
                  <div style="font-size:12px;font-weight:600;color:#94a3b8;margin-bottom:10px;text-transform:uppercase;letter-spacing:.6px;">Upload shot list</div>
                  <div style="font-size:11px;color:#475569;margin-bottom:12px;line-height:1.5;">
                    Upload a <code style="background:#1a1a1a;padding:1px 5px;border-radius:3px;color:#94a3b8;">.md</code> file in the standard silenced-shotlist format.
                    The parser will create <strong style="color:#64748b;">content_stills</strong> and <strong style="color:#64748b;">content_clips</strong> rows and advance the project to <em>storyboard</em>.
                  </div>

                  <label style="display:inline-flex;align-items:center;gap:8px;padding:7px 14px;border-radius:7px;background:#1a1a1a;border:1px solid #262626;font-size:12px;color:#94a3b8;cursor:pointer;">
                    📄 Choose shot list (.md)
                    <input type="file" accept=".md,text/markdown" style="display:none;"
                           (change)="onShotlistFileSelect($event)" />
                  </label>

                  @if (shotlistPreview()) {
                    <div style="margin-top:12px;padding:10px 12px;background:#111;border:1px solid #1e293b;border-radius:6px;">
                      <div style="font-size:11px;color:#475569;margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px;">Preview</div>
                      @if (shotlistPreview()!.title) {
                        <div style="font-size:12px;color:#e2e8f0;margin-bottom:4px;">{{ shotlistPreview()!.title }}</div>
                      }
                      <div style="font-size:11px;color:#64748b;">
                        {{ shotlistPreview()!.scenes }} scenes ·
                        @if (shotlistPreview()!.duration) {
                          {{ shotlistPreview()!.duration }}s ({{ (shotlistPreview()!.duration! / 60 | number:'1.0-1') }}m) ·
                        }
                        {{ shotlistPreview()!.stills }} generated stills · {{ shotlistPreview()!.editorBuilds }} editor builds
                      </div>
                    </div>
                  }

                  @if (shotlistFile()) {
                    <button (click)="importShotlist()"
                            [disabled]="importing()"
                            style="margin-top:12px;padding:7px 16px;border-radius:7px;background:#7c3aed;color:white;border:none;font-size:12px;font-weight:600;cursor:pointer;transition:opacity .15s;"
                            [style.opacity]="importing() ? '0.5' : '1'">
                      {{ importing() ? 'Importing…' : 'Import shot list' }}
                    </button>
                  }

                  @if (importResult()) {
                    <div style="margin-top:8px;font-size:12px;"
                         [style.color]="importResult()!.ok ? '#4ade80' : '#f87171'">
                      {{ importResult()!.message }}
                    </div>
                  }
                </div>
              }

              @if (activeStage.action) {
                <button (click)="triggerStage(activeStage.action!.stage)"
                        [disabled]="triggering()"
                        style="margin-top:10px;padding:7px 16px;border-radius:7px;background:#2563eb;color:white;border:none;font-size:12px;font-weight:600;cursor:pointer;transition:opacity .15s;"
                        [style.opacity]="triggering() ? '0.5' : '1'">
                  {{ triggering() ? 'Dispatching…' : activeStage.action!.label }}
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
            </div>
          }
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

  // Shot list upload
  shotlistFile     = signal<File | null>(null);
  shotlistPreview  = signal<{ title: string | null; scenes: number; stills: number; editorBuilds: number; duration: number | null } | null>(null);
  importing        = signal(false);
  importResult     = signal<{ ok: boolean; message: string } | null>(null);

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
    return s === 'storyboard' || s === 'awaiting_refs' || s === 'awaiting_stills';
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

  onShotlistFileSelect(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.shotlistFile.set(file);
    this.shotlistPreview.set(null);
    this.importResult.set(null);
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      // Quick client-side preview parse
      const titleM = text.match(/\*\*TITLE:\*\*\s*(.*)/);
      const durM = text.match(/\*\*TARGET_DURATION_SEC:\*\*\s*(\d+)/);
      const sceneMatches = text.match(/\*\*SCENE\s+\d+/g) ?? [];
      const editorMatches = text.match(/EDITOR (BUILD|GRAPHIC)/g) ?? [];
      const stillMatches = text.match(/🖼️\s+STILL\s+[A-D]:/g) ?? [];
      this.shotlistPreview.set({
        title:        titleM ? titleM[1].trim() : null,
        duration:     durM ? Number(durM[1]) : null,
        scenes:       sceneMatches.length,
        stills:       stillMatches.length - editorMatches.length,
        editorBuilds: editorMatches.length,
      });
    };
    reader.readAsText(file);
  }

  async importShotlist() {
    const file = this.shotlistFile();
    const p = this.project();
    if (!file || !p) return;
    this.importing.set(true);
    this.importResult.set(null);
    try {
      const text = await file.text();
      const res = await this.svc.importShotlist(p.id, text);
      this.importResult.set({
        ok: true,
        message: `Imported: ${res.scenes_total} scenes, ${res.stills_inserted} stills inserted. Project advanced to storyboard.`,
      });
      // Refresh project
      const updated = await this.svc.getLongformProject(p.id);
      if (updated) this.project.set(updated);
    } catch (e: any) {
      this.importResult.set({ ok: false, message: e.message });
    } finally {
      this.importing.set(false);
    }
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
