import { Component, Input, Output, EventEmitter, signal, computed, inject } from '@angular/core';
import { LongformProject, SupabaseService } from '../core/supabase.service';

const CHECKLIST = [
  "I've watched the full video from start to finish",
  'Audio levels, music, and narration are correct',
  'Title cards and text overlays are accurate',
];

@Component({
  selector: 'app-longform-final-review',
  standalone: true,
  template: `
    <!-- Video player -->
    <div
      style="background:#111;border:1px solid #1a1a1a;border-radius:12px;overflow:hidden;margin-bottom:24px;"
    >
      <div
        style="padding:16px 20px;border-bottom:1px solid #1a1a1a;display:flex;align-items:center;justify-content:space-between;"
      >
        <h2
          style="margin:0;font-size:14px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.8px;"
        >
          Gate 4 — Final Review
        </h2>
        <span
          style="padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;background:rgba(37,99,235,.2);color:#60a5fa;"
        >
          Awaiting approval
        </span>
      </div>

      @if (project.rendered_video_url) {
        <video
          [src]="project.rendered_video_url"
          controls
          preload="metadata"
          style="width:100%;display:block;background:#000;max-height:560px;"
        ></video>
      } @else {
        <div style="padding:60px 0;text-align:center;color:#475569;font-size:13px;">
          Video URL not set yet — the render may still be uploading.
        </div>
      }
    </div>

    <!-- SEO preview -->
    @if (project.seo) {
      <div
        style="background:#111;border:1px solid #1a1a1a;border-radius:12px;padding:20px;margin-bottom:24px;"
      >
        <div
          style="font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.6px;margin-bottom:14px;"
        >
          SEO Package
        </div>

        <div style="margin-bottom:12px;">
          <div
            style="font-size:10px;color:#475569;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;"
          >
            Title
          </div>
          <div style="font-size:14px;color:#e2e8f0;font-weight:500;">{{ project.seo.title }}</div>
        </div>

        <div style="margin-bottom:12px;">
          <div
            style="font-size:10px;color:#475569;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;"
          >
            Description
          </div>
          <div
            style="font-size:12px;color:#94a3b8;line-height:1.6;white-space:pre-wrap;max-height:120px;overflow-y:auto;"
          >
            {{ project.seo.description }}
          </div>
        </div>

        @if (project.seo.hashtags?.length) {
          <div>
            <div
              style="font-size:10px;color:#475569;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;"
            >
              Hashtags
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;">
              @for (tag of project.seo.hashtags; track tag) {
                <span
                  style="padding:2px 8px;background:#1e1e1e;border-radius:4px;font-size:12px;color:#60a5fa;"
                  >#{{ tag }}</span
                >
              }
            </div>
          </div>
        }
      </div>
    }

    <!-- Pre-publish checklist + approve -->
    <div
      style="background:#111;border:1px solid #1a1a1a;border-radius:12px;padding:20px;margin-bottom:24px;"
    >
      <div
        style="font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.6px;margin-bottom:14px;"
      >
        Pre-publish checklist
      </div>

      <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:20px;">
        @for (item of checklist; track $index; let i = $index) {
          <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;">
            <input
              type="checkbox"
              [checked]="checked()[i]"
              (change)="toggle(i)"
              style="margin-top:2px;accent-color:#2563eb;width:15px;height:15px;flex-shrink:0;"
            />
            <span style="font-size:13px;" [style.color]="checked()[i] ? '#e2e8f0' : '#64748b'">
              {{ item }}
            </span>
          </label>
        }
      </div>

      @if (!confirmStep()) {
        <button
          (click)="startConfirm()"
          [disabled]="!allChecked() || publishing()"
          style="padding:9px 20px;border-radius:8px;font-size:13px;font-weight:600;border:none;cursor:pointer;transition:all .15s;"
          [style.background]="allChecked() ? '#16a34a' : '#1a1a1a'"
          [style.color]="allChecked() ? 'white' : '#475569'"
          [style.cursor]="allChecked() ? 'pointer' : 'not-allowed'"
        >
          Approve &amp; Publish
        </button>
        @if (!allChecked()) {
          <div style="margin-top:8px;font-size:11px;color:#475569;">
            Complete the checklist to enable publish.
          </div>
        }
      } @else {
        <!-- Confirm step -->
        <div
          style="padding:14px;border-radius:8px;border:1px solid rgba(234,179,8,.3);background:rgba(234,179,8,.06);"
        >
          <div style="font-size:13px;color:#fbbf24;font-weight:600;margin-bottom:4px;">
            Publish to all platforms?
          </div>
          <div style="font-size:12px;color:#94a3b8;margin-bottom:14px;">
            This will dispatch the publish workflow to YouTube and Facebook. This cannot be undone.
          </div>
          <div style="display:flex;gap:10px;">
            <button
              (click)="confirm()"
              [disabled]="publishing()"
              style="padding:8px 18px;border-radius:7px;background:#16a34a;color:white;border:none;font-size:13px;font-weight:600;cursor:pointer;transition:opacity .15s;"
              [style.opacity]="publishing() ? '0.5' : '1'"
            >
              {{ publishing() ? 'Publishing…' : 'Yes, publish now' }}
            </button>
            <button
              (click)="cancelConfirm()"
              [disabled]="publishing()"
              style="padding:8px 18px;border-radius:7px;background:#1e1e1e;color:#94a3b8;border:1px solid #262626;font-size:13px;cursor:pointer;"
            >
              Cancel
            </button>
          </div>
        </div>
      }

      @if (publishError()) {
        <div style="margin-top:10px;font-size:12px;color:#f87171;">{{ publishError() }}</div>
      }
    </div>

    <!-- Add narration & re-render -->
    <div
      style="background:#111;border:1px solid #1a1a1a;border-radius:12px;padding:20px;margin-bottom:24px;"
    >
      <div
        style="font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px;"
      >
        Need narration?
      </div>
      <div style="font-size:12px;color:#475569;line-height:1.6;margin-bottom:14px;">
        If this render has no voiceover, run TTS to generate narration audio for all scenes then
        re-assemble. The video will return here once complete (~15–20 min).
      </div>
      @if (!renarrating()) {
        <button
          (click)="renarrating.set(true)"
          style="padding:7px 16px;border-radius:7px;background:#1e1e1e;color:#94a3b8;border:1px solid #262626;font-size:12px;font-weight:600;cursor:pointer;"
        >
          🎙 Add Narration &amp; Re-render
        </button>
      } @else {
        <div
          style="padding:14px;border-radius:8px;border:1px solid rgba(234,179,8,.3);background:rgba(234,179,8,.06);"
        >
          <div style="font-size:13px;color:#fbbf24;font-weight:600;margin-bottom:4px;">
            Re-run TTS + assemble?
          </div>
          <div style="font-size:12px;color:#94a3b8;margin-bottom:14px;">
            This will generate Kokoro TTS audio for all 40 clips then re-assemble the full video.
            The current render stays in R2 until overwritten.
          </div>
          <div style="display:flex;gap:10px;">
            <button
              (click)="confirmRenarrate()"
              [disabled]="renarrationBusy()"
              style="padding:8px 18px;border-radius:7px;background:#7c3aed;color:white;border:none;font-size:12px;font-weight:600;cursor:pointer;transition:opacity .15s;"
              [style.opacity]="renarrationBusy() ? '0.5' : '1'"
            >
              {{ renarrationBusy() ? 'Dispatching…' : 'Yes, run TTS + re-assemble' }}
            </button>
            <button
              (click)="renarrating.set(false)"
              [disabled]="renarrationBusy()"
              style="padding:8px 18px;border-radius:7px;background:#1e1e1e;color:#94a3b8;border:1px solid #262626;font-size:12px;cursor:pointer;"
            >
              Cancel
            </button>
          </div>
          @if (renarrationResult()) {
            <div
              style="margin-top:10px;font-size:12px;"
              [style.color]="renarrationResult()!.ok ? '#4ade80' : '#f87171'"
            >
              {{ renarrationResult()!.message }}
              @if (renarrationResult()!.ok && renarrationResult()!.runUrl) {
                ·
                <a [href]="renarrationResult()!.runUrl" target="_blank" style="color:#60a5fa;"
                  >View run ↗</a
                >
              }
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class LongformFinalReviewComponent {
  @Input() project!: LongformProject;
  @Output() published = new EventEmitter<void>();
  @Output() rerendering = new EventEmitter<void>();

  checklist = CHECKLIST;
  checked = signal<boolean[]>(CHECKLIST.map(() => false));
  confirmStep = signal(false);
  publishing = signal(false);
  publishError = signal<string | null>(null);

  renarrating = signal(false);
  renarrationBusy = signal(false);
  renarrationResult = signal<{ ok: boolean; message: string; runUrl?: string | null } | null>(null);

  allChecked = computed(() => this.checked().every(Boolean));

  toggle(i: number) {
    const next = [...this.checked()];
    next[i] = !next[i];
    this.checked.set(next);
  }

  startConfirm() {
    if (!this.allChecked()) return;
    this.publishError.set(null);
    this.confirmStep.set(true);
  }

  cancelConfirm() {
    this.confirmStep.set(false);
  }

  async confirm() {
    this.publishing.set(true);
    this.publishError.set(null);
    try {
      await this.svc.triggerLongform(this.project.id, 'publish');
      this.published.emit();
    } catch (e: any) {
      this.publishError.set(e.message);
      this.confirmStep.set(false);
    } finally {
      this.publishing.set(false);
    }
  }

  async confirmRenarrate() {
    this.renarrationBusy.set(true);
    this.renarrationResult.set(null);
    try {
      const res = await this.svc.triggerLongform(this.project.id, 'tts_assemble', '--audio-mix');
      this.renarrationResult.set({
        ok: true,
        message: 'TTS + assemble dispatched.',
        runUrl: res.runUrl,
      });
      this.rerendering.emit();
    } catch (e: any) {
      this.renarrationResult.set({ ok: false, message: e.message });
    } finally {
      this.renarrationBusy.set(false);
    }
  }

  constructor(private svc: SupabaseService) {}
}
