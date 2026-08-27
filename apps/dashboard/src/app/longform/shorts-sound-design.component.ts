import { Component, Input, computed, signal } from '@angular/core';
import { LongformProject } from '../core/supabase.service';

interface BedSegment {
  key: string;
  start_scene: number;
  end_scene: number;
}

interface HeartbeatSpan {
  start_scene: number;
  end_scene: number;
}

@Component({
  selector: 'app-shorts-sound-design',
  standalone: true,
  template: `
    <div style="background:#111;border:1px solid #1a1a1a;border-radius:12px;padding:20px;margin-bottom:24px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <h2 style="margin:0;font-size:14px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.8px;">Sound Design</h2>
        <span style="font-size:11px;color:#475569;">read-only — derived from the shot list's music_bed / heartbeat_layer columns</span>
      </div>

      @if (!bed().length && !heartbeat().length) {
        <div style="text-align:center;padding:32px;color:#475569;font-size:13px;">
          No sound design data — this shot list may not have set <code style="background:#1a1a1a;padding:1px 5px;border-radius:3px;">music_bed</code>/<code style="background:#1a1a1a;padding:1px 5px;border-radius:3px;">heartbeat_layer</code>, or predates the v3 template.
        </div>
      } @else {
        @if (bed().length) {
          <div style="margin-bottom:16px;">
            <div style="font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">Music bed</div>
            <div style="display:flex;flex-direction:column;gap:6px;">
              @for (seg of bed(); track $index) {
                <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:#0d0d0d;border-radius:6px;border:1px solid #1e1e1e;">
                  <span style="font-family:monospace;font-size:11px;color:#64748b;min-width:90px;">S{{ seg.start_scene }}{{ seg.start_scene !== seg.end_scene ? '–' + seg.end_scene : '' }}</span>
                  <span style="font-size:12px;color:#e2e8f0;font-weight:600;">{{ seg.key }}</span>
                </div>
              }
            </div>
          </div>
        }
        @if (heartbeat().length) {
          <div>
            <div style="font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">Heartbeat layer</div>
            <div style="display:flex;flex-direction:column;gap:6px;">
              @for (seg of heartbeat(); track $index) {
                <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:#0d0d0d;border-radius:6px;border:1px solid #1e1e1e;">
                  <span style="font-family:monospace;font-size:11px;color:#64748b;min-width:90px;">S{{ seg.start_scene }}{{ seg.start_scene !== seg.end_scene ? '–' + seg.end_scene : '' }}</span>
                  <span style="font-size:12px;color:#e2e8f0;">💓 heartbeat active</span>
                </div>
              }
            </div>
          </div>
        }
      }
    </div>
  `,
})
export class ShortsSoundDesignComponent {
  private _project = signal<LongformProject | null>(null);
  @Input() set project(p: LongformProject) { this._project.set(p); }

  private soundDesign = computed(() => {
    const meta = this._project()?.shot_list_meta as { sound_design?: { bed?: BedSegment[]; heartbeat?: HeartbeatSpan[] } } | null;
    return meta?.sound_design ?? null;
  });

  bed = computed<BedSegment[]>(() => this.soundDesign()?.bed ?? []);
  heartbeat = computed<HeartbeatSpan[]>(() => this.soundDesign()?.heartbeat ?? []);
}
