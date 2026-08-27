import { Component, Input, OnInit, signal, computed, ElementRef, ViewChild } from '@angular/core';
import { ContentStill, LongformProject, StillCut, SupabaseService } from '../core/supabase.service';

const CUTS: StillCut[] = ['A', 'B', 'C', 'D'];

interface SlotState {
  uploading: boolean;
  error: string | null;
}

interface StillSlot {
  scene_n: number;
  cut: StillCut;
  still: ContentStill | null;
  uploading: boolean;
  error: string | null;
}

interface SceneGroup {
  scene_n: number;
  label: string;
  slots: StillSlot[];
}

@Component({
  selector: 'app-longform-workbench',
  standalone: true,
  template: `
    <div style="background:#111;border:1px solid #1a1a1a;border-radius:12px;padding:24px;margin-bottom:24px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <!-- Collapse toggle + title -->
        <button (click)="collapsed.set(!collapsed())"
                style="display:flex;align-items:center;gap:8px;background:none;border:none;cursor:pointer;padding:0;">
          <span style="font-size:12px;color:#475569;transition:transform .2s;"
                [style.transform]="collapsed() ? 'rotate(-90deg)' : 'rotate(0)'">▼</span>
          <h2 style="margin:0;font-size:14px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.8px;">
            {{ workbenchTitle() }}
          </h2>
        </button>
        <div style="display:flex;align-items:center;gap:12px;">
          <span style="font-size:12px;color:#475569;">{{ uploadedCount() }} / {{ totalSlots() }} uploaded</span>
          <!-- View toggle — only shown when expanded and browsing the grid/list -->
          @if (!collapsed() && (project.status !== 'storyboard' || uploadMethod() === 'individual')) {
            <div style="display:flex;border:1px solid #262626;border-radius:6px;overflow:hidden;">
              <button (click)="listView.set(false)"
                      style="padding:4px 10px;border:none;font-size:11px;cursor:pointer;transition:background .15s;"
                      [style.background]="!listView() ? '#2563eb' : '#1a1a1a'"
                      [style.color]="!listView() ? 'white' : '#64748b'">Grid</button>
              <button (click)="listView.set(true)"
                      style="padding:4px 10px;border:none;font-size:11px;cursor:pointer;transition:background .15s;"
                      [style.background]="listView() ? '#2563eb' : '#1a1a1a'"
                      [style.color]="listView() ? 'white' : '#64748b'">List</button>
            </div>
          }
        </div>
      </div>

      @if (!loading() && totalSlots() > 0) {
        <div style="background:#1a1a1a;border-radius:4px;height:4px;overflow:hidden;margin-bottom:20px;">
          <div style="height:100%;background:#4ade80;transition:width .3s;"
               [style.width]="(uploadedCount() / totalSlots() * 100) + '%'"></div>
        </div>
      }

      @if (!collapsed()) {

      @if (loading()) {
        <div style="text-align:center;padding:40px;color:#475569;font-size:13px;">Loading stills…</div>
      } @else if (scenes().length === 0) {
        <div style="text-align:center;padding:40px;color:#475569;font-size:13px;">No scenes found. Import a shot list first.</div>
      } @else if (project.status === 'storyboard' && uploadMethod() === null) {

        <!-- ── METHOD PICKER — pick one, then only that flow is shown ── -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;">
          <button (click)="uploadMethod.set('individual')"
                  style="text-align:left;background:#0d0d0d;border:1px dashed #262626;border-radius:10px;padding:18px 20px;cursor:pointer;transition:border-color .15s;">
            <div style="font-size:13px;font-weight:600;color:#94a3b8;margin-bottom:4px;">🖼️ Upload Still Images</div>
            <div style="font-size:11px;color:#475569;line-height:1.5;">Browse scene-by-scene and click each slot to upload its image one at a time.</div>
          </button>
          <button (click)="uploadMethod.set('filename')"
                  style="text-align:left;background:#0a1a0a;border:1px dashed #1a3a1a;border-radius:10px;padding:18px 20px;cursor:pointer;transition:border-color .15s;">
            <div style="font-size:13px;font-weight:600;color:#4ade80;margin-bottom:4px;">📁 Bulk Upload by Filename</div>
            <div style="font-size:11px;color:#475569;line-height:1.5;">Files named <code style="background:#111;padding:1px 4px;border-radius:3px;">S7-A.jpeg</code> — slot assigned instantly from the filename, no AI needed.</div>
          </button>
          <button (click)="uploadMethod.set('automatch')"
                  style="text-align:left;background:#0a1628;border:1px dashed #1e3a5f;border-radius:10px;padding:18px 20px;cursor:pointer;transition:border-color .15s;">
            <div style="font-size:13px;font-weight:600;color:#60a5fa;margin-bottom:4px;">⚡ Auto-Match via Claude Vision</div>
            <div style="font-size:11px;color:#475569;line-height:1.5;">Any filename — Claude Vision looks at each image and assigns it to the correct slot.</div>
          </button>
        </div>

      } @else {

      @if (project.status === 'storyboard') {
        <button (click)="uploadMethod.set(null)"
                style="display:flex;align-items:center;gap:4px;background:#1a1a1a;border:1px solid #262626;border-radius:6px;color:#94a3b8;font-size:12px;font-weight:600;cursor:pointer;padding:6px 12px;margin-bottom:14px;">
          ← Back
        </button>
      }

      @if (project.status !== 'storyboard' || uploadMethod() === 'individual') {

      @if (listView()) {

        <!-- ── LIST VIEW: prompt text visible, one row per slot ── -->
        <div style="display:flex;flex-direction:column;gap:6px;">
          @for (scene of scenes(); track scene.scene_n) {
            @for (slot of scene.slots; track slot.cut) {
              @if (isEditorBuild(slot)) {
                <!-- Editor-build slot: no image needed, show as disabled row -->
                <div style="display:grid;grid-template-columns:64px 80px 1fr 110px;gap:12px;align-items:center;padding:10px 12px;border-radius:8px;border:1px solid #131313;background:#0a0a0a;opacity:.45;">
                  <div style="aspect-ratio:16/9;border-radius:5px;background:#111;display:flex;align-items:center;justify-content:center;font-size:18px;">🎬</div>
                  <div>
                    <div style="font-size:13px;font-weight:700;color:#475569;font-family:monospace;">S{{ slot.scene_n }}-{{ slot.cut }}</div>
                    <span style="font-size:9px;padding:1px 5px;border-radius:3px;font-weight:600;background:rgba(100,116,139,.2);color:#64748b;">editor build</span>
                  </div>
                  <div style="font-size:11px;color:#334155;font-style:italic;">No image needed — built in editor</div>
                  <div style="font-size:11px;color:#334155;text-align:right;">—</div>
                </div>
              } @else {
                <div style="display:grid;grid-template-columns:64px 80px 1fr 110px;gap:12px;align-items:center;padding:10px 12px;border-radius:8px;border:1px solid;"
                     [style.border-color]="slot.uploading ? '#3b82f6' : slot.still?.clip_url ? '#1e293b' : '#1a1a1a'"
                     [style.background]="slot.still?.clip_url ? 'rgba(30,41,59,.3)' : '#0d0d0d'">

                  <!-- Thumbnail -->
                  <div style="position:relative;aspect-ratio:16/9;border-radius:5px;overflow:hidden;background:#1a1a1a;cursor:pointer;"
                       (click)="openPicker(slot)">
                    @if (slot.still?.clip_url) {
                      <img [src]="slot.still!.clip_url!" style="width:100%;height:100%;object-fit:cover;" />
                    } @else if (slot.uploading) {
                      <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;">
                        <div class="spinner"></div>
                      </div>
                    } @else {
                      <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#334155;font-size:18px;">+</div>
                    }
                  </div>

                  <!-- Scene label -->
                  <div>
                    <div style="font-size:13px;font-weight:700;color:#94a3b8;font-family:monospace;">
                      S{{ slot.scene_n }}-{{ slot.cut }}
                    </div>
                    @if (slot.still) {
                      <span style="font-size:9px;padding:1px 5px;border-radius:3px;font-weight:600;"
                            [style.background]="statusBg(slot.still.status)"
                            [style.color]="statusColor(slot.still.status)">
                        {{ slot.still.status }}
                      </span>
                    }
                  </div>

                  <!-- Prompt text -->
                  <div style="font-size:11px;color:#475569;line-height:1.5;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">
                    {{ slot.still?.prompt ?? '—' }}
                  </div>

                  <!-- Upload button -->
                  <button (click)="openPicker(slot)"
                          [disabled]="slot.uploading"
                          style="padding:6px 12px;border-radius:6px;border:1px solid #262626;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;"
                          [style.background]="slot.still?.clip_url ? '#1e293b' : '#0d0d0d'"
                          [style.color]="slot.still?.clip_url ? '#60a5fa' : '#4ade80'">
                    {{ slot.uploading ? 'Uploading…' : slot.still?.clip_url ? '↑ Replace' : '↑ Upload' }}
                  </button>

                  @if (slot.error) {
                    <div style="grid-column:1/-1;font-size:11px;color:#f87171;padding-left:4px;">{{ slot.error }}</div>
                  }
                </div>
              }
            }
          }
        </div>

      } @else {

        <!-- ── GRID VIEW ── -->
        @for (scene of scenes(); track scene.scene_n) {
          <div style="margin-bottom:24px;">
            <div style="font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;">
              Scene {{ scene.scene_n }}
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;">
              @for (slot of scene.slots; track slot.cut) {
                @if (isEditorBuild(slot)) {
                  <!-- Editor-build: greyed out, no click -->
                  <div style="border-radius:8px;overflow:hidden;border:1px solid #131313;background:#0a0a0a;opacity:.4;">
                    <div style="position:relative;aspect-ratio:16/9;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;">
                      <div style="font-size:22px;">🎬</div>
                      <div style="font-size:10px;color:#475569;font-weight:600;">Editor Build</div>
                    </div>
                    <div style="padding:6px 8px;font-size:10px;color:#334155;font-style:italic;min-height:32px;">
                      S{{ slot.scene_n }}-{{ slot.cut }} — no image needed
                    </div>
                  </div>
                } @else {
                  <div style="border-radius:8px;overflow:hidden;border:1px solid;background:#0d0d0d;cursor:pointer;"
                       [style.border-color]="slot.uploading ? '#3b82f6' : slot.still?.clip_url ? '#262626' : '#1e3a2a'"
                       (click)="openPicker(slot)">
                    <!-- Image -->
                    <div style="position:relative;aspect-ratio:16/9;">
                      @if (slot.still?.clip_url && !slot.uploading) {
                        <img [src]="slot.still!.clip_url!" style="width:100%;height:100%;object-fit:cover;display:block;" />
                      } @else if (slot.uploading) {
                        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.7);">
                          <div class="spinner"></div>
                        </div>
                      } @else {
                        <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;">
                          <div style="width:28px;height:28px;border-radius:50%;border:1.5px dashed #2d4a3a;display:flex;align-items:center;justify-content:center;color:#2d6a4f;font-size:16px;">+</div>
                          <div style="font-size:10px;color:#2d6a4f;">Upload</div>
                        </div>
                      }
                      <div style="position:absolute;top:5px;left:5px;display:flex;gap:4px;align-items:center;">
                        <span style="padding:1px 6px;border-radius:4px;font-size:10px;font-weight:700;background:rgba(0,0,0,.7);color:#94a3b8;">
                          S{{ slot.scene_n }}-{{ slot.cut }}
                        </span>
                        @if (slot.still) {
                          <span style="padding:1px 5px;border-radius:4px;font-size:9px;font-weight:600;"
                                [style.background]="statusBg(slot.still.status)"
                                [style.color]="statusColor(slot.still.status)">
                            {{ slot.still.status }}
                          </span>
                        }
                      </div>
                    </div>
                    <!-- Prompt text below image -->
                    <div style="padding:6px 8px;font-size:10px;color:#475569;line-height:1.4;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;min-height:32px;">
                      {{ slot.still?.prompt ?? '' }}
                    </div>
                  </div>
                }
              }
            </div>
          </div>
        }

      }

      } <!-- end individual-upload grid/list -->

      } <!-- end method-chosen @else -->

      } <!-- end !collapsed() -->

      <!-- ── ACTION PANEL — always visible regardless of collapse/view state ── -->
      @if (project.status === 'storyboard' && uploadMethod() === 'filename') {
        <div style="margin-top:16px;padding-top:16px;border-top:1px solid #1a1a1a;">

          <!-- Filename-based bulk upload (fast, no AI) -->
          <div style="background:#0a1a0a;border:1px dashed #1a3a1a;border-radius:10px;padding:18px 20px;margin-bottom:12px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
              <div>
                <div style="font-size:13px;font-weight:600;color:#4ade80;">📁 Bulk Upload by Filename</div>
                <div style="font-size:11px;color:#475569;margin-top:2px;">Files must be named <code style="background:#111;padding:1px 4px;border-radius:3px;">S7-A.jpeg</code> — slot assigned from filename instantly, no AI needed</div>
              </div>
              <button (click)="triggerFilenameUpload()"
                      [disabled]="filenameUploading()"
                      style="padding:8px 18px;border-radius:8px;background:#15803d;color:white;border:none;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;flex-shrink:0;margin-left:16px;"
                      [style.opacity]="filenameUploading() ? '0.6' : '1'">
                {{ filenameUploading() ? 'Uploading…' : '📁 Select S{N}-{CUT} Files' }}
              </button>
            </div>
            @if (filenameUploading() || filenameProgress().log.length > 0) {
              @if (filenameUploading()) {
                <div style="margin-bottom:6px;">
                  <div style="display:flex;justify-content:space-between;font-size:11px;color:#475569;margin-bottom:3px;">
                    <span>{{ filenameProgress().current }} of {{ filenameProgress().total }}</span>
                    <span>{{ Math.round(filenameProgress().current / filenameProgress().total * 100) }}%</span>
                  </div>
                  <div style="background:#1a1a1a;border-radius:3px;height:3px;overflow:hidden;">
                    <div style="height:100%;background:#4ade80;transition:width .3s;"
                         [style.width]="(filenameProgress().current / filenameProgress().total * 100) + '%'"></div>
                  </div>
                </div>
              }
              <div style="max-height:140px;overflow-y:auto;display:flex;flex-direction:column;gap:2px;">
                @for (line of filenameProgress().log; track $index) {
                  <div style="font-size:11px;font-family:monospace;padding:2px 0;"
                       [style.color]="line.startsWith('✓') ? '#4ade80' : line.startsWith('⚠') ? '#f59e0b' : line.startsWith('✗') ? '#f87171' : '#64748b'">
                    {{ line }}
                  </div>
                }
              </div>
            }
          </div>

          <!-- Upload count summary -->
          <div style="font-size:12px;color:#475569;">
            {{ uploadedCount() }} of {{ totalSlots() }} stills uploaded
            @if (uploadedCount() < totalSlots()) { · {{ totalSlots() - uploadedCount() }} remaining }
          </div>
        </div>
      }

      @if (project.status === 'storyboard' && uploadMethod() === 'automatch') {
        <div style="margin-top:16px;padding-top:16px;border-top:1px solid #1a1a1a;">

          <!-- Auto-match bulk upload (AI Vision fallback) -->
          <div style="background:#0a1628;border:1px dashed #1e3a5f;border-radius:10px;padding:18px 20px;margin-bottom:16px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
              <div>
                <div style="font-size:13px;font-weight:600;color:#60a5fa;">⚡ Auto-Match via Claude Vision</div>
                <div style="font-size:11px;color:#475569;margin-top:2px;">Any filename — Claude Vision analyses each image and assigns it to the correct slot</div>
              </div>
              <button (click)="triggerAutoMatch()"
                      [disabled]="autoMatching()"
                      style="padding:8px 18px;border-radius:8px;background:#1d4ed8;color:white;border:none;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;flex-shrink:0;margin-left:16px;"
                      [style.opacity]="autoMatching() ? '0.6' : '1'">
                {{ autoMatching() ? 'Analysing…' : '⚡ Select Images' }}
              </button>
            </div>
            @if (autoMatching() || matchProgress().log.length > 0) {
              @if (autoMatching()) {
                <div style="margin-bottom:8px;">
                  <div style="display:flex;justify-content:space-between;font-size:11px;color:#475569;margin-bottom:4px;">
                    <span>Processing {{ matchProgress().current }} of {{ matchProgress().total }}</span>
                    <span>{{ Math.round(matchProgress().current / matchProgress().total * 100) }}%</span>
                  </div>
                  <div style="background:#1a1a1a;border-radius:3px;height:3px;overflow:hidden;">
                    <div style="height:100%;background:#3b82f6;transition:width .3s;"
                         [style.width]="(matchProgress().current / matchProgress().total * 100) + '%'"></div>
                  </div>
                </div>
              }
              <div style="max-height:160px;overflow-y:auto;display:flex;flex-direction:column;gap:2px;">
                @for (line of matchProgress().log; track $index) {
                  <div style="font-size:11px;font-family:monospace;padding:2px 0;"
                       [style.color]="line.startsWith('✓') ? '#4ade80' : line.startsWith('⚠') ? '#f59e0b' : line.startsWith('✗') ? '#f87171' : '#64748b'">
                    {{ line }}
                  </div>
                }
              </div>
            }
          </div>

          <!-- Upload count summary -->
          <div style="font-size:12px;color:#475569;">
            {{ uploadedCount() }} of {{ totalSlots() }} stills uploaded
            @if (uploadedCount() < totalSlots()) { · {{ totalSlots() - uploadedCount() }} remaining }
          </div>
        </div>
      }
    </div>

    <input #fileInput type="file" accept="image/*" style="display:none"
           (change)="onFileSelected($event)" />
    <input #autoMatchInput type="file" accept="image/*" multiple style="display:none"
           (change)="onAutoMatchFiles($event)" />
    <input #filenameInput type="file" accept="image/*" multiple style="display:none"
           (change)="onFilenameUpload($event)" />

    <style>
      .spinner {
        width: 20px; height: 20px;
        border: 2px solid #3b82f6;
        border-top-color: transparent;
        border-radius: 50%;
        animation: spin .8s linear infinite;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
    </style>
  `,
})
export class LongformWorkbenchComponent implements OnInit {
  @Input() project!: LongformProject;
  @ViewChild('fileInput')      fileInputRef!:       ElementRef<HTMLInputElement>;
  @ViewChild('autoMatchInput') autoMatchInputRef!:  ElementRef<HTMLInputElement>;
  @ViewChild('filenameInput')  filenameInputRef!:   ElementRef<HTMLInputElement>;

  loading          = signal(true);
  stills           = signal<ContentStill[]>([]);
  slotState        = signal<Record<string, SlotState>>({});
  collapsed        = signal(false);
  listView         = signal(true);
  uploadMethod     = signal<'individual' | 'filename' | 'automatch' | null>(null);
  autoMatching     = signal(false);
  matchProgress    = signal<{ current: number; total: number; log: string[] }>({ current: 0, total: 0, log: [] });
  filenameUploading = signal(false);
  filenameProgress  = signal<{ current: number; total: number; log: string[] }>({ current: 0, total: 0, log: [] });

  readonly Math = Math;
  private pendingSlot: { scene_n: number; cut: StillCut } | null = null;

  constructor(private svc: SupabaseService) {}

  scenes = computed<SceneGroup[]>(() => {
    const rawStills = this.stills();
    const states    = this.slotState();

    const stillMap = new Map<string, ContentStill>();
    rawStills.forEach(s => stillMap.set(`${s.scene_n}-${s.cut}`, s));

    // Group scene numbers from DB rows only (not all 4 cuts per scene)
    const sceneNums = new Set<number>();
    rawStills.forEach(s => sceneNums.add(s.scene_n));

    return [...sceneNums].sort((a, b) => a - b).map(scene_n => {
      // Only show cuts that exist in content_stills
      const cutsInScene = CUTS.filter(cut => stillMap.has(`${scene_n}-${cut}`));
      return {
        scene_n,
        label: `Scene ${scene_n}`,
        slots: cutsInScene.map(cut => {
          const key   = `${scene_n}-${cut}`;
          const state = states[key] ?? { uploading: false, error: null };
          return {
            scene_n,
            cut,
            still: stillMap.get(key) ?? null,
            uploading: state.uploading,
            error: state.error,
          };
        }),
      };
    });
  });

  // Editor-build slots: passed with no image — intentionally empty, never need upload
  isEditorBuild = (slot: StillSlot) => slot.still?.status === 'passed' && !slot.still?.clip_url;

  uploadedCount = computed(() => this.stills().filter(s => s.clip_url != null).length);
  totalSlots    = computed(() =>
    this.scenes().reduce((n, s) => n + s.slots.filter(slot => !this.isEditorBuild(slot)).length, 0)
  );

  workbenchTitle = computed(() => {
    const s = this.project.status;
    if (s === 'storyboard')    return 'Upload Still Images';
    if (s === 'awaiting_refs') return 'Gate 2 — Reference Images';
    return 'Gate 3 — Scene Stills';
  });


  async ngOnInit() {
    try {
      this.stills.set(await this.svc.getContentStills(this.project.id));
    } catch (e: any) {
      console.error('Failed to load stills:', e);
    } finally {
      this.loading.set(false);
    }
  }

  openPicker(slot: StillSlot) {
    if (slot.uploading) return;
    this.pendingSlot = { scene_n: slot.scene_n, cut: slot.cut };
    this.fileInputRef.nativeElement.value = '';
    this.fileInputRef.nativeElement.click();
  }

  async onFileSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    const pending = this.pendingSlot;
    if (!file || !pending) return;

    const { scene_n, cut } = pending;
    this.patchSlot(scene_n, cut, { uploading: true, error: null });

    try {
      const { id, clip_url } = await this.svc.uploadStill(this.project.id, scene_n, cut, file);

      const current = this.stills();
      const exists  = current.find(s => s.scene_n === scene_n && s.cut === cut);
      if (exists) {
        this.stills.set(current.map(s =>
          s.scene_n === scene_n && s.cut === cut
            ? { ...s, clip_url, status: 'generated' as const }
            : s
        ));
      } else {
        this.stills.set([...current, {
          id,
          project_id: this.project.id,
          scene_n,
          cut,
          act: null,
          prompt: null,
          motion: 'push',
          image_source: 'editor',
          clip_url,
          status: 'generated' as const,
          retry_count: 0,
          fail_reason: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }]);
      }

      this.patchSlot(scene_n, cut, { uploading: false, error: null });
    } catch (e: any) {
      this.patchSlot(scene_n, cut, { uploading: false, error: e.message });
    }
  }

  triggerFilenameUpload() {
    this.filenameInputRef.nativeElement.value = '';
    this.filenameInputRef.nativeElement.click();
  }

  async onFilenameUpload(event: Event) {
    const files = Array.from((event.target as HTMLInputElement).files ?? []);
    if (!files.length) return;

    this.filenameUploading.set(true);
    this.filenameProgress.set({ current: 0, total: files.length, log: [] });

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const p = this.filenameProgress();
      this.filenameProgress.set({ ...p, current: i + 1, log: [...p.log, `Uploading ${file.name}…`] });

      // Parse S{N}-{CUT} from filename (e.g. S7-A.jpeg, S12-B.jpg)
      const slotM = file.name.match(/^S(\d+)-([A-D])\./i);
      if (!slotM) {
        const updated = this.filenameProgress();
        this.filenameProgress.set({ ...updated, log: [...updated.log.slice(0, -1), `⚠ ${file.name} — skipped (filename must be S{N}-{CUT}.jpeg)`] });
        continue;
      }

      const scene_n = Number(slotM[1]);
      const cut     = slotM[2].toUpperCase() as StillCut;

      try {
        const { clip_url } = await this.svc.uploadStill(this.project.id, scene_n, cut, file);

        // Update local stills
        const current = this.stills();
        this.stills.set(current.map(s =>
          s.scene_n === scene_n && s.cut === cut
            ? { ...s, clip_url, status: 'generated' as const }
            : s
        ));

        const updated = this.filenameProgress();
        this.filenameProgress.set({ ...updated, log: [...updated.log.slice(0, -1), `✓ ${file.name} → S${scene_n}-${cut}`] });
      } catch (e: any) {
        const updated = this.filenameProgress();
        this.filenameProgress.set({ ...updated, log: [...updated.log.slice(0, -1), `✗ ${file.name}: ${e.message}`] });
      }
    }

    this.filenameUploading.set(false);
  }

  triggerAutoMatch() {
    this.autoMatchInputRef.nativeElement.value = '';
    this.autoMatchInputRef.nativeElement.click();
  }

  async onAutoMatchFiles(event: Event) {
    const files = Array.from((event.target as HTMLInputElement).files ?? []);
    if (!files.length) return;

    this.autoMatching.set(true);
    this.matchProgress.set({ current: 0, total: files.length, log: [] });

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const p = this.matchProgress();
      this.matchProgress.set({ ...p, current: i + 1, log: [...p.log, `Analysing ${file.name}…`] });

      try {
        const result = await this.svc.autoMatchStill(this.project.id, file);
        const { scene_n, cut, clip_url, slot } = result;

        // Update local stills signal
        const current = this.stills();
        const exists  = current.find(s => s.scene_n === scene_n && s.cut === cut);
        if (exists) {
          this.stills.set(current.map(s =>
            s.scene_n === scene_n && s.cut === cut
              ? { ...s, clip_url, status: 'generated' as const }
              : s
          ));
        }

        const updated = this.matchProgress();
        const lastLog = updated.log.slice(0, -1);
        this.matchProgress.set({ ...updated, log: [...lastLog, `✓ ${file.name} → ${slot}`] });
      } catch (e: any) {
        const updated = this.matchProgress();
        const lastLog = updated.log.slice(0, -1);
        const msg_str  = e.message as string;
        const isNoMatch   = msg_str.includes('NO_MATCH');
        const isFilled    = msg_str.includes('ALREADY_FILLED');
        const prefix = (isNoMatch || isFilled) ? '⚠' : '✗';
        const msg    = isNoMatch  ? `${file.name} — skipped (no scene match)`
                     : isFilled   ? `${file.name} — slot already filled, skipped`
                     : `${file.name}: ${msg_str}`;
        this.matchProgress.set({ ...updated, log: [...lastLog, `${prefix} ${msg}`] });
      }
    }

    this.autoMatching.set(false);
  }

  private patchSlot(scene_n: number, cut: StillCut, state: SlotState) {
    this.slotState.set({ ...this.slotState(), [`${scene_n}-${cut}`]: state });
  }

  statusBg(status: string): string {
    const map: Record<string, string> = {
      passed: 'rgba(22,163,74,.3)', generated: 'rgba(37,99,235,.3)',
      failed: 'rgba(220,38,38,.3)', blocked: 'rgba(220,38,38,.3)',
      validating: 'rgba(234,179,8,.3)', generating: 'rgba(37,99,235,.3)',
      pending: 'rgba(100,116,139,.3)',
    };
    return map[status] ?? 'rgba(100,116,139,.3)';
  }

  statusColor(status: string): string {
    const map: Record<string, string> = {
      passed: '#4ade80', generated: '#60a5fa',
      failed: '#f87171', blocked: '#f87171',
      validating: '#facc15', generating: '#60a5fa',
      pending: '#94a3b8',
    };
    return map[status] ?? '#94a3b8';
  }
}
