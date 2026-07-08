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
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
        <h2 style="margin:0;font-size:14px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.8px;">
          {{ workbenchTitle() }}
        </h2>
        <span style="font-size:12px;color:#475569;">
          {{ uploadedCount() }} / {{ totalSlots() }} stills uploaded
        </span>
      </div>

      @if (loading()) {
        <div style="text-align:center;padding:40px;color:#475569;font-size:13px;">Loading stills…</div>
      } @else if (scenes().length === 0) {
        <div style="text-align:center;padding:40px;color:#475569;font-size:13px;">
          No scenes found. The script may not have been approved yet.
        </div>
      } @else {
        @for (scene of scenes(); track scene.scene_n) {
          <div style="margin-bottom:24px;">
            <div style="font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;">
              {{ scene.label }}
            </div>
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;">
              @for (slot of scene.slots; track slot.cut) {
                <div style="position:relative;aspect-ratio:16/9;border-radius:8px;overflow:hidden;border:1px solid;background:#0d0d0d;cursor:pointer;"
                     [style.border-color]="slot.uploading ? '#3b82f6' : slot.still?.clip_url ? '#262626' : '#1e3a2a'"
                     (click)="openPicker(slot)">

                  @if (slot.still?.clip_url && !slot.uploading) {
                    <img [src]="slot.still!.clip_url!"
                         style="width:100%;height:100%;object-fit:cover;display:block;"
                         [alt]="'S' + slot.scene_n + '-' + slot.cut" />
                  }

                  @if (!slot.still?.clip_url && !slot.uploading) {
                    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;">
                      <div style="width:28px;height:28px;border-radius:50%;border:1.5px dashed #2d4a3a;display:flex;align-items:center;justify-content:center;color:#2d6a4f;font-size:16px;">+</div>
                      <div style="font-size:10px;color:#2d6a4f;">Upload</div>
                    </div>
                  }

                  @if (slot.uploading) {
                    <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.7);">
                      <div class="spinner"></div>
                    </div>
                  }

                  @if (slot.error && !slot.uploading) {
                    <div style="position:absolute;bottom:0;left:0;right:0;background:rgba(220,38,38,.85);padding:3px 6px;font-size:10px;color:#fff;line-height:1.3;">
                      {{ slot.error }}
                    </div>
                  }

                  <div style="position:absolute;top:5px;left:5px;display:flex;gap:4px;align-items:center;">
                    <span style="padding:1px 6px;border-radius:4px;font-size:10px;font-weight:700;background:rgba(0,0,0,.7);color:#94a3b8;">
                      {{ slot.cut }}
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
              }
            </div>
          </div>
        }
      }
    </div>

    <input #fileInput type="file" accept="image/*" style="display:none"
           (change)="onFileSelected($event)" />

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
  @ViewChild('fileInput') fileInputRef!: ElementRef<HTMLInputElement>;

  loading    = signal(true);
  stills     = signal<ContentStill[]>([]);
  // Transient per-slot state (uploading/error) keyed by 'scene_n-cut'
  slotState  = signal<Record<string, SlotState>>({});

  private pendingSlot: { scene_n: number; cut: StillCut } | null = null;

  scenes = computed<SceneGroup[]>(() => {
    const rawStills  = this.stills();
    const states     = this.slotState();
    const projectScenes = this.project.scenes ?? [];

    const sceneNums = new Set<number>();
    projectScenes.forEach(s => sceneNums.add(s.scene_num));
    rawStills.forEach(s => sceneNums.add(s.scene_n));

    const stillMap = new Map<string, ContentStill>();
    rawStills.forEach(s => stillMap.set(`${s.scene_n}-${s.cut}`, s));

    return [...sceneNums].sort((a, b) => a - b).map(scene_n => ({
      scene_n,
      label: `Scene ${scene_n}`,
      slots: CUTS.map(cut => {
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
    }));
  });

  uploadedCount = computed(() => this.stills().filter(s => s.clip_url != null).length);
  totalSlots    = computed(() => this.scenes().length * 4);

  workbenchTitle = computed(() =>
    this.project.status === 'awaiting_refs' ? 'Gate 2 — Reference Images' : 'Gate 3 — Scene Stills'
  );

  constructor(private svc: SupabaseService) {}

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
      const { upload_url, public_url } = await this.svc.presignStillUpload(
        this.project.id, scene_n, cut, file.name, file.type
      );

      const putRes = await fetch(upload_url, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });
      if (!putRes.ok) throw new Error(`R2 upload failed (${putRes.status})`);

      const { id, clip_url } = await this.svc.confirmStillUpload(
        this.project.id, scene_n, cut, public_url
      );

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
