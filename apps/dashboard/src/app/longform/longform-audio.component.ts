import { Component, Input, OnInit, signal, computed } from '@angular/core';
import { AudioPlanSegment, LongformProject, SupabaseService } from '../core/supabase.service';

const TRACKS = [
  { value: 'hum_only',   label: 'Hum only (ambient)',      color: '#374151' },
  { value: 'silence',    label: 'Silence (hard gap)',       color: '#1f2937' },
  { value: 'somber',     label: 'Somber — melancholic',     color: '#1e40af' },
  { value: 'tension',    label: 'Tension — dark build',     color: '#92400e' },
  { value: 'drone',      label: 'Drone — minimal ambient',  color: '#4c1d95' },
  { value: 'release',    label: 'Release — triumph swell',  color: '#065f46' },
  { value: 'reflective', label: 'Reflective — warm piano',  color: '#0e7490' },
];

const TRACK_COLOR: Record<string, string> = Object.fromEntries(TRACKS.map(t => [t.value, t.color]));

function toMmSs(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

@Component({
  selector: 'app-longform-audio',
  standalone: true,
  template: `
    <div style="background:#111;border:1px solid #1a1a1a;border-radius:12px;padding:20px;margin-bottom:24px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <h2 style="margin:0;font-size:14px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.8px;">Audio Plan</h2>
        <div style="display:flex;gap:8px;align-items:center;">
          @if (dirty()) {
            <span style="font-size:11px;color:#fbbf24;">Unsaved changes</span>
          }
          <button (click)="save()"
                  [disabled]="saving() || !dirty()"
                  style="padding:5px 14px;border-radius:6px;border:none;font-size:12px;font-weight:600;cursor:pointer;transition:all .15s;"
                  [style.background]="dirty() && !saving() ? '#2563eb' : '#1a1a1a'"
                  [style.color]="dirty() && !saving() ? 'white' : '#475569'"
                  [style.cursor]="dirty() && !saving() ? 'pointer' : 'not-allowed'">
            {{ saving() ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </div>

      @if (saveError()) {
        <div style="margin-bottom:12px;padding:8px 12px;border-radius:6px;background:rgba(248,113,113,.1);border:1px solid rgba(248,113,113,.2);font-size:12px;color:#f87171;">
          {{ saveError() }}
        </div>
      }
      @if (saveOk()) {
        <div style="margin-bottom:12px;padding:8px 12px;border-radius:6px;background:rgba(74,222,128,.08);border:1px solid rgba(74,222,128,.2);font-size:12px;color:#4ade80;">
          Audio plan saved.
        </div>
      }

      @if (rows().length === 0) {
        <div style="text-align:center;padding:32px;color:#475569;font-size:13px;">
          No audio plan yet — the seed stage will populate this automatically.
          <br />
          <button (click)="addRow()" style="margin-top:12px;padding:6px 14px;border-radius:6px;background:#1e1e1e;color:#94a3b8;border:1px solid #262626;font-size:12px;cursor:pointer;">
            Add segment manually
          </button>
        </div>
      } @else {
        <!-- Timeline visualization -->
        <div style="display:flex;height:18px;border-radius:6px;overflow:hidden;margin-bottom:16px;gap:1px;">
          @for (row of rows(); track $index) {
            @let dur = row.to_sec - row.from_sec;
            @let pct = totalDur() > 0 ? (dur / totalDur()) * 100 : 0;
            <div [style.flex-basis]="pct + '%'"
                 [style.flex-shrink]="'0'"
                 [style.background]="trackColor(row.track)"
                 [title]="row.track + ' · ' + toMmSs(row.from_sec) + '–' + toMmSs(row.to_sec)"
                 style="min-width:2px;">
            </div>
          }
        </div>
        <!-- Timeline labels -->
        <div style="display:flex;justify-content:space-between;font-size:10px;color:#475569;margin-bottom:16px;">
          <span>0:00</span>
          <span>{{ toMmSs(totalDur() / 2) }}</span>
          <span>{{ toMmSs(totalDur()) }}</span>
        </div>

        <!-- Segment rows -->
        <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px;">
          <!-- Header -->
          <div style="display:grid;grid-template-columns:36px 72px 72px 1fr 90px 32px;gap:8px;align-items:center;padding:0 4px;">
            <div style="font-size:10px;color:#475569;text-transform:uppercase;letter-spacing:.4px;">Act</div>
            <div style="font-size:10px;color:#475569;text-transform:uppercase;letter-spacing:.4px;">From (s)</div>
            <div style="font-size:10px;color:#475569;text-transform:uppercase;letter-spacing:.4px;">To (s)</div>
            <div style="font-size:10px;color:#475569;text-transform:uppercase;letter-spacing:.4px;">Track</div>
            <div style="font-size:10px;color:#475569;text-transform:uppercase;letter-spacing:.4px;">Gain (dB)</div>
            <div></div>
          </div>

          @for (row of rows(); track $index; let i = $index) {
            <div style="display:grid;grid-template-columns:36px 72px 72px 1fr 90px 32px;gap:8px;align-items:center;padding:6px 4px;border-radius:6px;background:#0d0d0d;">
              <!-- Act badge -->
              <div style="text-align:center;padding:2px 0;border-radius:4px;font-size:11px;font-weight:700;background:#1a1a1a;color:#64748b;">
                {{ i }}
              </div>
              <!-- From -->
              <input type="number" [value]="row.from_sec" min="0"
                     (change)="patchRow(i, 'from_sec', +$any($event.target).value)"
                     style="width:100%;padding:4px 6px;border-radius:5px;background:#111;border:1px solid #262626;color:#e2e8f0;font-size:12px;" />
              <!-- To -->
              <input type="number" [value]="row.to_sec" min="0"
                     (change)="patchRow(i, 'to_sec', +$any($event.target).value)"
                     style="width:100%;padding:4px 6px;border-radius:5px;background:#111;border:1px solid #262626;color:#e2e8f0;font-size:12px;" />
              <!-- Track -->
              <select [value]="row.track"
                      (change)="patchRow(i, 'track', $any($event.target).value)"
                      style="width:100%;padding:4px 6px;border-radius:5px;background:#111;border:1px solid #262626;color:#e2e8f0;font-size:12px;">
                @for (t of tracks; track t.value) {
                  <option [value]="t.value" [selected]="t.value === row.track">{{ t.label }}</option>
                }
              </select>
              <!-- Gain -->
              <input type="number" [value]="row.gain_db" max="0" min="-60"
                     (change)="patchRow(i, 'gain_db', +$any($event.target).value)"
                     style="width:100%;padding:4px 6px;border-radius:5px;background:#111;border:1px solid #262626;color:#e2e8f0;font-size:12px;" />
              <!-- Delete -->
              <button (click)="removeRow(i)"
                      style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;border-radius:5px;background:transparent;border:1px solid #262626;color:#475569;cursor:pointer;font-size:14px;line-height:1;">
                ×
              </button>
            </div>
          }
        </div>

        <button (click)="addRow()"
                style="padding:5px 14px;border-radius:6px;background:#1e1e1e;color:#64748b;border:1px solid #262626;font-size:12px;cursor:pointer;">
          + Add segment
        </button>
      }
    </div>
  `,
})
export class LongformAudioComponent implements OnInit {
  @Input() project!: LongformProject;

  rows      = signal<AudioPlanSegment[]>([]);
  saving    = signal(false);
  saveError = signal<string | null>(null);
  saveOk    = signal(false);

  tracks = TRACKS;
  toMmSs = toMmSs;

  private original = '[]';

  dirty = computed(() => JSON.stringify(this.rows()) !== this.original);

  totalDur = computed(() => {
    const r = this.rows();
    return r.length ? Math.max(...r.map(s => s.to_sec)) : 0;
  });

  trackColor(track: string): string {
    return TRACK_COLOR[track] ?? '#1e1e1e';
  }

  ngOnInit() {
    const plan: AudioPlanSegment[] = this.project.audio_plan ?? [];
    this.rows.set(structuredClone(plan));
    this.original = JSON.stringify(plan);
  }

  patchRow(i: number, field: keyof AudioPlanSegment, value: string | number) {
    const next = this.rows().map((r, idx) =>
      idx === i ? { ...r, [field]: value } : r
    );
    this.rows.set(next);
  }

  addRow() {
    const last = this.rows().at(-1);
    const from_sec = last ? last.to_sec : 0;
    this.rows.set([...this.rows(), {
      act: this.rows().length,
      from_sec,
      to_sec: from_sec + 60,
      track: 'somber',
      gain_db: -23,
    }]);
  }

  removeRow(i: number) {
    this.rows.set(this.rows().filter((_, idx) => idx !== i));
  }

  async save() {
    this.saving.set(true);
    this.saveError.set(null);
    this.saveOk.set(false);
    try {
      await this.svc.updateAudioPlan(this.project.id, this.rows());
      this.original = JSON.stringify(this.rows());
      this.saveOk.set(true);
      setTimeout(() => this.saveOk.set(false), 3000);
    } catch (e: any) {
      this.saveError.set(e.message);
    } finally {
      this.saving.set(false);
    }
  }

  constructor(private svc: SupabaseService) {}
}
