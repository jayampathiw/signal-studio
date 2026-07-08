import { Component, Input, OnInit, signal, computed } from '@angular/core';
import { ContentClip, SupabaseService } from '../core/supabase.service';

function wordCount(clips: ContentClip[]): number {
  return clips.reduce((n, c) => n + (c.vo_text?.split(/\s+/).filter(Boolean).length ?? 0), 0);
}

@Component({
  selector: 'app-longform-script',
  standalone: true,
  template: `
    <div style="background:#111;border:1px solid #1a1a1a;border-radius:12px;padding:24px;margin-bottom:24px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
        <h2 style="margin:0;font-size:14px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.8px;">
          Gate 1 — Script Review
        </h2>
        @if (!loading() && clips().length) {
          <span style="font-size:12px;color:#475569;">
            {{ wc() }} words · ~{{ readMins() }} min read · {{ clips().length }} scenes
          </span>
        }
      </div>

      @if (loading()) {
        <div style="text-align:center;padding:40px;color:#475569;font-size:13px;">Loading script…</div>
      } @else if (!clips().length) {
        <div style="text-align:center;padding:40px;color:#475569;font-size:13px;">
          No script scenes found. The AI may still be writing it.
        </div>
      } @else {
        <!-- Full VO block (easy copy-paste for TTS check) -->
        <details style="margin-bottom:24px;">
          <summary style="cursor:pointer;font-size:12px;color:#475569;user-select:none;padding:8px 0;">
            Full narration text (click to expand)
          </summary>
          <div style="margin-top:12px;padding:16px;background:#0d0d0d;border-radius:8px;font-size:13px;color:#94a3b8;line-height:1.8;white-space:pre-wrap;font-family:Georgia,serif;max-height:400px;overflow-y:auto;">{{ fullVo() }}</div>
        </details>

        <!-- Per-scene breakdown -->
        <div style="display:flex;flex-direction:column;gap:16px;">
          @for (clip of clips(); track clip.id) {
            <div style="border:1px solid #1a1a1a;border-radius:8px;overflow:hidden;">
              <!-- Scene header -->
              <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:#0d0d0d;border-bottom:1px solid #1a1a1a;">
                <span style="padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;background:#1e2e1e;color:#4ade80;">
                  S{{ clip.scene_n }}
                </span>
                @if (clip.kind === 'text_card') {
                  <span style="padding:2px 6px;border-radius:4px;font-size:9px;font-weight:600;background:rgba(234,179,8,.15);color:#facc15;">CARD</span>
                }
                @if (clip.title) {
                  <span style="font-size:13px;font-weight:600;color:#e2e8f0;">{{ clip.title }}</span>
                }
                @if (clip.duration_sec) {
                  <span style="margin-left:auto;font-size:11px;color:#475569;">{{ clip.duration_sec }}s</span>
                }
              </div>

              <div style="padding:12px 14px;display:flex;flex-direction:column;gap:10px;">
                <!-- VO / narration -->
                @if (clip.vo_text) {
                  <div>
                    <div style="font-size:10px;color:#475569;text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px;">Narration</div>
                    <div style="font-size:13px;color:#e2e8f0;line-height:1.7;font-family:Georgia,serif;">{{ clip.vo_text }}</div>
                  </div>
                }

                <!-- Visual prompt -->
                @if (clip.visual_prompt) {
                  <div>
                    <div style="font-size:10px;color:#475569;text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px;">Visual</div>
                    <div style="font-size:12px;color:#64748b;line-height:1.6;font-style:italic;">{{ clip.visual_prompt }}</div>
                  </div>
                }

                <!-- Text overlay + audio cue row -->
                @if (clip.text_overlay || clip.audio_cue) {
                  <div style="display:flex;gap:16px;flex-wrap:wrap;">
                    @if (clip.text_overlay) {
                      <div>
                        <div style="font-size:10px;color:#475569;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;">On-screen text</div>
                        <div style="font-size:12px;color:#94a3b8;">"{{ clip.text_overlay }}"</div>
                      </div>
                    }
                    @if (clip.audio_cue) {
                      <div>
                        <div style="font-size:10px;color:#475569;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;">SFX / Audio</div>
                        <div style="font-size:12px;color:#94a3b8;">{{ clip.audio_cue }}</div>
                      </div>
                    }
                  </div>
                }
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class LongformScriptComponent implements OnInit {
  @Input() projectId!: number;

  loading = signal(true);
  clips   = signal<ContentClip[]>([]);

  wc       = computed(() => wordCount(this.clips()));
  readMins = computed(() => Math.ceil(this.wc() / 130)); // ~130 wpm narration pace
  fullVo   = computed(() =>
    this.clips()
      .filter(c => c.vo_text)
      .map(c => `[S${c.scene_n}${c.title ? ' — ' + c.title : ''}]\n${c.vo_text}`)
      .join('\n\n')
  );

  constructor(private svc: SupabaseService) {}

  async ngOnInit() {
    try {
      this.clips.set(await this.svc.getContentClips(this.projectId));
    } catch (e: any) {
      console.error('Failed to load clips:', e);
    } finally {
      this.loading.set(false);
    }
  }
}
