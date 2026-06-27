import { Component, Input, Output, EventEmitter, signal, OnInit } from '@angular/core';
import { GenConfig, SupabaseService } from '../core/supabase.service';
import {
  IMAGE_MODELS, VIDEO_MODELS, IMAGE_RES, VIDEO_RES, ASPECT_RATIOS,
  CHANNEL_DEFAULTS, durationRangeFor, clampDuration,
} from './gen-config.constants';

// Channel-level ("page") generation defaults editor. Writes channel_configs.config,
// which sits between per-reel gen_config and the channels.js code defaults.
@Component({
  selector: 'app-channel-config-dialog',
  standalone: true,
  template: `
    <div style="position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;padding:16px;">
      <div style="position:absolute;inset:0;background:rgba(0,0,0,.7);backdrop-filter:blur(8px);" (click)="close.emit()"></div>
      <div style="position:relative;width:100%;max-width:460px;max-height:90vh;overflow:auto;background:var(--ink-surface);border:1px solid var(--ink-border);border-radius:12px;padding:18px;display:flex;flex-direction:column;gap:14px;">

        <!-- Header -->
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
          <div>
            <p class="section-label" style="margin:0 0 2px;">⚙ {{ channelLabel || channelKey }} — Channel defaults</p>
            <p style="font-size:10px;color:var(--ink-text-3);margin:0;">Applies to all <code style="font-family:'JetBrains Mono',monospace;">{{ channelKey }}</code> reels unless a reel overrides it. Falls through to code defaults when unset.</p>
          </div>
          <button class="btn-ink" style="padding:2px 8px;" (click)="close.emit()">✕</button>
        </div>

        @if (loading()) {
          <p style="font-size:12px;color:var(--ink-text-3);">Loading…</p>
        } @else {
          <!-- Image -->
          <div style="border-top:1px solid var(--ink-border);padding-top:12px;">
            <p class="section-label">🖼 Image Generation</p>
            <div style="display:flex;flex-direction:column;gap:10px;">
              <div>
                <label style="font-size:9px;color:var(--ink-text-3);text-transform:uppercase;letter-spacing:.06em;display:block;margin-bottom:4px;">Model</label>
                <select class="ink-select" style="height:30px;font-size:12px;padding:0 8px;width:100%;"
                  (change)="patch('imageModel', $any($event.target).value)">
                  @for (m of IMAGE_MODELS; track m.id) { <option [value]="m.id" [selected]="(draft().imageModel ?? CHANNEL_DEFAULTS.imageModel) === m.id">{{ m.label }}</option> }
                </select>
              </div>
              <div style="display:flex;gap:20px;flex-wrap:wrap;">
                <div>
                  <label style="font-size:9px;color:var(--ink-text-3);text-transform:uppercase;letter-spacing:.06em;display:block;margin-bottom:4px;">Resolution</label>
                  <div style="display:flex;gap:4px;">
                    @for (r of IMAGE_RES; track r) {
                      <button [class]="'pill ' + ((draft().imageRes ?? CHANNEL_DEFAULTS.imageRes) === r ? 'pill-on' : '')" (click)="patch('imageRes', r)">{{ r.toUpperCase() }}</button>
                    }
                  </div>
                </div>
                <div>
                  <label style="font-size:9px;color:var(--ink-text-3);text-transform:uppercase;letter-spacing:.06em;display:block;margin-bottom:4px;">Aspect Ratio</label>
                  <div style="display:flex;gap:4px;">
                    @for (a of ASPECT_RATIOS; track a) {
                      <button [class]="'pill ' + ((draft().aspectRatio ?? CHANNEL_DEFAULTS.aspectRatio) === a ? 'pill-on' : '')" (click)="patch('aspectRatio', a)">{{ a }}</button>
                    }
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Video -->
          <div style="border-top:1px solid var(--ink-border);padding-top:12px;">
            <p class="section-label">🎬 Video Generation</p>
            <div style="display:flex;flex-direction:column;gap:10px;">
              <div>
                <label style="font-size:9px;color:var(--ink-text-3);text-transform:uppercase;letter-spacing:.06em;display:block;margin-bottom:4px;">Model</label>
                <select class="ink-select" style="height:30px;font-size:12px;padding:0 8px;width:100%;"
                  (change)="patch('videoModel', $any($event.target).value)">
                  @for (m of VIDEO_MODELS; track m.id) { <option [value]="m.id" [selected]="(draft().videoModel ?? CHANNEL_DEFAULTS.videoModel) === m.id">{{ m.label }}</option> }
                </select>
              </div>
              <div>
                <label style="font-size:9px;color:var(--ink-text-3);text-transform:uppercase;letter-spacing:.06em;display:block;margin-bottom:4px;">Resolution</label>
                <div style="display:flex;gap:4px;flex-wrap:wrap;">
                  @for (r of VIDEO_RES; track r) {
                    <button [class]="'pill ' + ((draft().videoRes ?? CHANNEL_DEFAULTS.videoRes) === r ? 'pill-on' : '')" (click)="patch('videoRes', r)">{{ r }}</button>
                  }
                </div>
              </div>
              <div>
                <label style="font-size:9px;color:var(--ink-text-3);text-transform:uppercase;letter-spacing:.06em;display:block;margin-bottom:4px;">Default clip duration (s)</label>
                <div style="display:flex;gap:6px;align-items:center;">
                  <input type="number" class="ink-select" style="height:30px;font-size:12px;padding:0 8px;width:110px;"
                    [min]="durationRange().min" [max]="durationRange().max" step="1"
                    [value]="draft().duration ?? ''" placeholder="format preset"
                    (change)="setDuration($any($event.target).value)" />
                  @if (draft().duration != null) {
                    <button class="btn-ink" style="padding:2px 8px;" (click)="patch('duration', undefined)">use preset</button>
                  }
                </div>
                <p style="font-size:9px;color:var(--ink-text-3);margin:4px 0 0;">
                  {{ draft().videoModel ?? CHANNEL_DEFAULTS.videoModel }} supports {{ durationRange().min }}–{{ durationRange().max }}s@if (durationRange().fixed) { · valid: {{ durationRange().fixed?.join(' / ') }}s }. Empty = per-format preset (11s / 21s).
                </p>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div style="border-top:1px solid var(--ink-border);padding-top:12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <button class="btn-brand" [disabled]="!dirty() || saving()" (click)="save()">Save channel defaults</button>
            <button class="btn-ink" [disabled]="saving()" (click)="reset()">↺ Reset to code defaults</button>
            @if (toast()) { <span style="font-size:11px;color:var(--ink-text-2);">{{ toast() }}</span> }
          </div>
        }
      </div>
    </div>
  `,
})
export class ChannelConfigDialogComponent implements OnInit {
  @Input({ required: true }) channelKey!: string;
  @Input() channelLabel = '';
  @Output() close = new EventEmitter<void>();

  readonly IMAGE_MODELS    = IMAGE_MODELS;
  readonly VIDEO_MODELS    = VIDEO_MODELS;
  readonly IMAGE_RES       = IMAGE_RES;
  readonly VIDEO_RES       = VIDEO_RES;
  readonly ASPECT_RATIOS   = ASPECT_RATIOS;
  readonly CHANNEL_DEFAULTS = CHANNEL_DEFAULTS;

  draft   = signal<GenConfig>({});
  loading = signal(true);
  saving  = signal(false);
  dirty   = signal(false);
  toast   = signal('');

  constructor(private supabase: SupabaseService) {}

  async ngOnInit() {
    try {
      const cfg = await this.supabase.getChannelConfig(this.channelKey);
      this.draft.set(cfg ?? {});
    } catch {
      this.draft.set({});
    } finally {
      this.loading.set(false);
    }
  }

  durationRange() {
    return durationRangeFor(this.draft().videoModel ?? CHANNEL_DEFAULTS.videoModel);
  }

  patch(field: keyof GenConfig, val: any) {
    this.draft.update(c => {
      const next = { ...c };
      if (val === undefined) delete (next as any)[field];
      else (next as any)[field] = val;
      return next;
    });
    this.dirty.set(true);
  }

  setDuration(raw: any) {
    if (raw === '' || raw == null) { this.patch('duration', undefined); return; }
    const v = clampDuration(raw, this.draft().videoModel ?? CHANNEL_DEFAULTS.videoModel);
    if (v !== null) this.patch('duration', v);
  }

  async save() {
    if (this.saving() || !this.dirty()) return;
    this.saving.set(true);
    try {
      await this.supabase.upsertChannelConfig(this.channelKey, this.draft());
      this.dirty.set(false);
      this.saving.set(false);
      this.close.emit();
      return;
    } catch (err: any) {
      this.toast.set(err.message ?? 'Save failed');
    } finally {
      this.saving.set(false);
    }
  }

  async reset() {
    if (this.saving()) return;
    this.saving.set(true);
    try {
      await this.supabase.upsertChannelConfig(this.channelKey, {});
      this.draft.set({});
      this.dirty.set(false);
      this.toast.set('Reset to code defaults');
      setTimeout(() => this.toast.set(''), 2500);
    } catch (err: any) {
      this.toast.set(err.message ?? 'Reset failed');
    } finally {
      this.saving.set(false);
    }
  }
}
