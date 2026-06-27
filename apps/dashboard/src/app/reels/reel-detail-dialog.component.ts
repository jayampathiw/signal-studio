import { Component, Input, Output, EventEmitter, signal, OnInit, OnChanges, SimpleChanges, OnDestroy } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ContentItem, ContentItemScene, GenConfig, SupabaseService } from '../core/supabase.service';

// Safe-language lint — Higgsfield flags these; offer substitutions
const UNSAFE_TERMS: { term: string; fix: string }[] = [
  { term: 'exposed roots',  fix: 'tangled root structures' },
  { term: 'predawn',        fix: 'cool morning light' },
  { term: 'toe pads',       fix: 'small paws' },
  { term: 'nose leather',   fix: 'muzzle detail' },
  { term: 'iris texture',   fix: 'eye catching light' },
];

const VIDEO_PROMPT_FIELDS: { key: string; label: string; rows: number; hint: string }[] = [
  { key: 'composition',  label: 'Composition',   rows: 2, hint: 'Framing, subject placement, orientation' },
  { key: 'style',        label: 'Style',         rows: 1, hint: 'ultrarealistic, wildlife documentary cinematography, film grain' },
  { key: 'cameraMotion', label: 'Camera Motion', rows: 2, hint: 'Named move + emotional justification' },
  { key: 'subjects',     label: 'Subjects',      rows: 2, hint: 'Species detail, fur/eye description, props' },
  { key: 'action',       label: 'Action',        rows: 2, hint: 'Micro-events, NOT macro-drama' },
  { key: 'location',     label: 'Location',      rows: 2, hint: 'Interior/exterior, specific setting detail' },
  { key: 'audioCues',    label: 'Audio Cues',    rows: 2, hint: 'Specific layered sounds — never vague. Natural audio ONLY.' },
  { key: 'lighting',     label: 'Lighting',      rows: 2, hint: 'Always directional, always emotionally purposeful' },
];

const SCENARIO_OPTIONS = [
  { value: 1, label: '1', desc: 'Storyboard-direct — no start frame, uses storyboard panel as video reference.' },
  { value: 2, label: '2', desc: 'Fresh start frame — previous final frame = CHARACTER reference only.' },
  { value: 3, label: '3', desc: 'Chain — start + end frames; end of clip N = start of clip N+1.' },
];

const TRANSITION_OPTIONS = [
  { value: 'panel', label: 'panel' },
  { value: 'fresh', label: 'fresh' },
  { value: 'chain', label: 'chain' },
];

// Higgsfield model IDs — see docs/higgsfield-models.md (canonical MCP IDs)
const IMAGE_MODELS: { id: string; label: string }[] = [
  { id: 'nano_banana_pro',     label: 'Nano Banana Pro — Google · 4K quality' },
  { id: 'nano_banana_2',       label: 'Nano Banana 2 — Google · fast, high-quality' },
  { id: 'nano_banana',         label: 'Nano Banana — Google · budget' },
  { id: 'cinematic_studio_2_5',label: 'Cinema Studio 2.5 — Higgsfield · 4K cinematic' },
  { id: 'soul_cinematic',      label: 'Soul Cinema — Higgsfield · cinema stills' },
  { id: 'seedream_v4_5',       label: 'Seedream 4.5 — Bytedance · precise 4K' },
  { id: 'flux_2',              label: 'Flux 2.0 — Black Forest Labs · prompt-accurate' },
  { id: 'kling_omni_image',    label: 'Kling O1 Image — Kling · photorealistic' },
];

// `endImage: false` models cannot do the 21s scenario-3 start+end chain
const VIDEO_MODELS: { id: string; label: string; endImage: boolean }[] = [
  { id: 'seedance_2_0',        label: 'Seedance 2.0 — Bytedance · start+end, 4K, 4–15s', endImage: true },
  { id: 'seedance_2_0_mini',   label: 'Seedance 2.0 Mini — Bytedance · fast/budget',     endImage: true },
  { id: 'seedance_1_5',        label: 'Seedance 1.5 Pro — Bytedance · 4/8/12s',          endImage: true },
  { id: 'kling3_0',            label: 'Kling 3.0 — Kling · multi-shot, 3–15s',           endImage: true },
  { id: 'kling3_0_turbo',      label: 'Kling 3.0 Turbo — Kling · fast, start-frame only',endImage: false },
  { id: 'wan2_7',              label: 'Wan 2.7 — Wan · audio sync, start+end, 2–15s',    endImage: true },
  { id: 'cinematic_studio_3_0',label: 'Cinema Studio 3.0 — Higgsfield · premium',        endImage: true },
];

// Per-model clip-duration limits (seconds). `fixed` = only these exact values are
// valid (e.g. Seedance 1.5). Source: docs/higgsfield-models.md.
const DURATION_RANGE: Record<string, { min: number; max: number; fixed?: number[] }> = {
  seedance_2_0:         { min: 4, max: 15 },
  seedance_2_0_mini:    { min: 4, max: 15 },
  seedance_1_5:         { min: 4, max: 12, fixed: [4, 8, 12] },
  kling3_0:             { min: 3, max: 15 },
  kling3_0_turbo:       { min: 3, max: 15 },
  wan2_7:               { min: 2, max: 15 },
  cinematic_studio_3_0: { min: 4, max: 15 },
};
const DEFAULT_DURATION_RANGE = { min: 2, max: 15 };

const IMAGE_RES = ['1k', '2k', '4k'];
const VIDEO_RES = ['480p', '720p', '1080p', '4k'];
const ASPECT_RATIOS = ['9:16', '16:9', '1:1'];

// Channel fallback defaults — mirror apps/video/src/config/channels.js wildlife/intimacy/EN
const CHANNEL_DEFAULTS = {
  imageModel: 'nano_banana_pro',
  videoModel: 'seedance_2_0',
  imageRes:   '2k',
  videoRes:   '720p',
  aspectRatio:'9:16',
};

@Component({
  selector: 'app-reel-detail',
  standalone: true,
  imports: [DatePipe],
  template: `
    <div style="display:flex;flex-direction:column;height:100%;background:var(--ink-surface);position:relative;">

      <!-- Header -->
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;flex-shrink:0;border-bottom:1px solid var(--ink-border);"
           [style.background]="statusBg(item.status)">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          <span [class]="'ink-badge ' + statusBadgeClass(item.status)" style="text-transform:uppercase;">{{ item.status }}</span>
          @if (item.format) {
            <span class="ink-badge ib-brand" style="font-family:'JetBrains Mono',monospace;">{{ item.format }}</span>
          }
          @if (item.slot) {
            <span style="font-size:10px;color:var(--ink-text-2);font-family:'JetBrains Mono',monospace;">{{ item.slot }}</span>
          }
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="ink-badge" style="background:var(--ink-raised);color:var(--ink-text-2);font-family:'JetBrains Mono',monospace;font-size:9px;">#{{ item.id }}</span>
          <button class="btn-ghost-icon" (click)="closePanel.emit()">✕</button>
        </div>
      </div>

      <!-- Title + channel -->
      <div style="padding:10px 16px;border-bottom:1px solid var(--ink-border);flex-shrink:0;">
        <h2 style="font-size:14px;font-weight:600;line-height:1.4;color:var(--ink-text);margin:0 0 4px;">{{ item.title ?? item.channel_key }}</h2>
        <div style="font-size:11px;color:var(--ink-text-2);font-family:'JetBrains Mono',monospace;">{{ item.channel_key }}</div>
      </div>

      <!-- Tabs -->
      <div class="ink-tabs scrollbar-none" style="overflow-x:auto;flex-shrink:0;">
        @for (tab of tabs; track tab; let i = $index) {
          <button [class]="'ink-tab ' + (activeTab() === i ? 'active' : '')" (click)="activeTab.set(i)">
            {{ tab }}
            @if (i === 1 && dirtyCount() > 0) {
              <span style="display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;border-radius:50%;background:var(--ink-alert);color:#fff;font-size:8px;font-weight:700;margin-left:4px;">{{ dirtyCount() }}</span>
            }
            @if (i === 2 && genConfigDirty()) {
              <span style="display:inline-flex;align-items:center;justify-content:center;width:6px;height:6px;border-radius:50%;background:var(--ink-alert);margin-left:4px;"></span>
            }
          </button>
        }
      </div>

      <!-- Body -->
      <div style="padding:16px;display:flex;flex-direction:column;gap:16px;">

        <!-- ── Overview ── -->
        @if (activeTab() === 0) {
          @if (item.status_note) {
            <div [style.background]="item.status === 'blocked' ? 'rgba(255,54,54,.08)' : 'rgba(255,140,0,.08)'"
                 [style.border]="item.status === 'blocked' ? '1px solid rgba(255,54,54,.25)' : '1px solid rgba(255,140,0,.25)'"
                 style="border-radius:8px;padding:10px 14px;">
              <p class="section-label" [style.color]="item.status === 'blocked' ? 'var(--ink-breaking)' : 'var(--ink-alert)'" style="margin-bottom:4px;">
                {{ item.status === 'blocked' ? '⛔ Blocked' : '⚠ Note' }}
              </p>
              <p style="font-size:12px;line-height:1.6;margin:0;color:var(--ink-text);">{{ item.status_note }}</p>
            </div>
          }
          <!-- Generate Scene Prompts CTA — only when brief with no scenes yet -->
          @if (item.status === 'brief' && !item.scenes?.length) {
            <div style="border:1px dashed var(--ink-brand);border-radius:10px;padding:18px 16px;display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center;background:var(--ink-brand-glow);">
              <div style="font-size:28px;line-height:1;">✦</div>
              <p style="font-size:13px;font-weight:600;color:var(--ink-text);margin:0;">Ready to expand this brief</p>
              <p style="font-size:12px;color:var(--ink-text-2);margin:0;line-height:1.5;max-width:340px;">Claude will read the concept title and generate full image + video prompts for each scene. You can review and edit them before running Higgsfield.</p>
              <div style="display:flex;gap:6px;align-items:center;font-size:11px;color:var(--ink-text-3);">
                <span class="ink-badge ib-ai">brief</span>
                <span>→</span>
                <span class="ink-badge ib-ai">storyboard</span>
                <span>·</span>
                <span>{{ item.format ?? '11s' }} · {{ (item.format ?? '11s') === '21s' ? '3 scenes' : '1 scene' }}</span>
              </div>
              <button class="btn-brand" style="padding:0 20px;height:38px;font-size:13px;gap:8px;"
                [disabled]="expandingBrief()"
                (click)="expandBrief()">
                @if (expandingBrief()) {
                  <span class="loading loading-spinner" style="width:14px;height:14px;"></span>
                  Generating with Claude…
                } @else {
                  ✦ Generate Scene Prompts
                }
              </button>
            </div>
          }

          <!-- Run Generation Pipeline CTA — shown when storyboard prompts are ready -->
          @if (item.status === 'storyboard') {
            <div style="border:1px solid var(--ink-brand);border-radius:10px;padding:16px;display:flex;flex-direction:column;gap:10px;background:var(--ink-brand-glow);">
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="font-size:18px;line-height:1;">▶</span>
                <p style="font-size:13px;font-weight:600;color:var(--ink-text);margin:0;">Scene prompts ready — run the pipeline</p>
              </div>
              <p style="font-size:12px;color:var(--ink-text-2);margin:0;line-height:1.5;">Dispatches a GitHub Actions runner that calls the Wild Eye skill: Higgsfield start frames → vision gate → video generation → SEO. Takes ~10–20 min.</p>
              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
                <div style="display:flex;gap:6px;align-items:center;font-size:11px;color:var(--ink-text-3);">
                  <span class="ink-badge ib-ai">storyboard</span>
                  <span>→</span>
                  <span class="ink-badge" style="background:rgba(255,140,0,.15);color:#ff8c00;">generating</span>
                  <span>→</span>
                  <span class="ink-badge ib-ai">rendered</span>
                </div>
                <div style="display:flex;gap:8px;align-items:center;">
                  @if (runUrl()) {
                    <a [href]="runUrl()!" target="_blank" style="font-size:11px;color:var(--ink-brand);text-decoration:none;font-weight:600;">View Actions run →</a>
                  }
                  <button class="btn-brand" style="height:34px;padding:0 16px;font-size:12px;gap:8px;"
                    [disabled]="triggering()"
                    (click)="triggerGeneration()">
                    @if (triggering()) {
                      <span class="loading loading-spinner" style="width:13px;height:13px;"></span>
                      Dispatching…
                    } @else {
                      ▶ Run Generation Pipeline
                    }
                  </button>
                </div>
              </div>
            </div>
          }

          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
            <div><p class="section-label">Format</p><span class="ink-badge ib-brand" style="font-family:'JetBrains Mono',monospace;font-size:12px;">{{ item.format ?? '—' }}</span></div>
            <div><p class="section-label">Scenes</p><p style="font-size:28px;font-weight:700;color:var(--ink-text-2);font-family:'JetBrains Mono',monospace;line-height:1;">{{ item.scenes?.length ?? 0 }}</p></div>
            <div><p class="section-label">Style</p><span class="ink-badge" style="font-size:10px;text-transform:uppercase;">{{ item.style ?? '—' }}</span></div>
          </div>
          <div style="border-top:1px solid var(--ink-border);"></div>
          @if (item.slot) {
            <div><p class="section-label">Publish Slot</p><p style="font-size:14px;font-weight:600;color:var(--ink-text);font-family:'JetBrains Mono',monospace;">{{ item.slot }}</p></div>
            <div style="border-top:1px solid var(--ink-border);"></div>
          }
          <div><p class="section-label">Created</p><p style="font-size:13px;color:var(--ink-text);font-family:'JetBrains Mono',monospace;">{{ item.created_at | date:'dd MMM yyyy, HH:mm' }}</p></div>
          @if (item.rendered_at) {
            <div style="border-top:1px solid var(--ink-border);"></div>
            <div><p class="section-label">Rendered</p><p style="font-size:13px;color:var(--ink-text);font-family:'JetBrains Mono',monospace;">{{ item.rendered_at | date:'dd MMM yyyy, HH:mm' }}</p></div>
          }
          <div style="border-top:1px solid var(--ink-border);"></div>
          <div>
            <p class="section-label">Content ID</p>
            <div style="display:flex;align-items:center;gap:8px;">
              <code style="font-family:'JetBrains Mono',monospace;font-size:13px;color:var(--ink-text-2);background:var(--ink-raised);border:1px solid var(--ink-border);padding:4px 8px;border-radius:4px;flex:1;">#{{ item.id }}</code>
              <button class="btn-ink" style="height:28px;padding:0 10px;font-size:11px;flex-shrink:0;" (click)="copy(item.id.toString())">Copy</button>
            </div>
          </div>
        }

        <!-- ── Scenes (Generation Config) ── -->
        @if (activeTab() === 1) {

          @if (dirtyCount() > 1) {
            <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:rgba(255,140,0,.08);border:1px solid rgba(255,140,0,.25);border-radius:8px;">
              <span style="font-size:12px;color:var(--ink-alert);font-weight:600;">{{ dirtyCount() }} scenes have unsaved changes</span>
              <button class="btn-brand" style="background:var(--ink-alert);height:28px;font-size:11px;padding:0 12px;" [disabled]="saving()" (click)="saveAll()">
                {{ saving() ? 'Saving…' : 'Save all' }}
              </button>
            </div>
          }

          @if (!sceneDrafts().length) {
            @if (item.status === 'brief') {
              <div style="display:flex;flex-direction:column;align-items:center;gap:12px;padding:32px 16px;text-align:center;">
                <div style="font-size:36px;opacity:.25;">✦</div>
                <p style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-text-3);">Brief not expanded yet</p>
                <p style="font-size:12px;color:var(--ink-text-2);line-height:1.5;max-width:320px;">Generate scene prompts from the concept title first. You can edit them here before triggering image generation.</p>
                <button class="btn-brand" style="height:36px;padding:0 18px;font-size:12px;gap:8px;"
                  [disabled]="expandingBrief()"
                  (click)="expandBrief()">
                  @if (expandingBrief()) {
                    <span class="loading loading-spinner" style="width:13px;height:13px;"></span>
                    Generating…
                  } @else {
                    ✦ Generate Scene Prompts
                  }
                </button>
              </div>
            } @else {
              <div class="empty-state">
                <div style="font-size:32px;opacity:.2;">🎬</div>
                <p style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;">No scenes yet</p>
                <p style="font-size:11px;color:var(--ink-text-3);margin-top:4px;">Run the <code style="font-family:'JetBrains Mono',monospace;background:var(--ink-raised);padding:2px 5px;border-radius:3px;">wild-eye-reel</code> skill to start generation</p>
              </div>
            }
          }

          @for (scene of sceneDrafts(); track scene.scene_num; let idx = $index) {
            <div style="border:1px solid var(--ink-border);border-radius:10px;overflow:hidden;">

              <!-- Scene header bar -->
              <div style="display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--ink-border);flex-wrap:wrap;background:var(--ink-surface);">
                <span class="ink-badge" style="font-weight:700;font-size:10px;">Scene {{ scene.scene_num }}</span>
                @if (scene.scene_status) {
                  <span [class]="'ink-badge ' + sceneStatusClass(scene.scene_status)" style="font-size:9px;">{{ scene.scene_status }}</span>
                }
                <span style="flex:1;"></span>
                <div style="display:flex;align-items:center;gap:4px;">
                  <label style="font-size:9px;color:var(--ink-text-3);text-transform:uppercase;letter-spacing:.06em;white-space:nowrap;">Dur.</label>
                  <input type="number" class="ink-input" style="width:50px;height:26px;padding:0 6px;font-size:12px;font-family:'JetBrains Mono',monospace;text-align:center;"
                    [value]="scene.duration_sec ?? ''"
                    (change)="patchScene(idx, 'duration_sec', +$any($event.target).value)"
                    min="1" max="60" />
                  <label style="font-size:9px;color:var(--ink-text-3);">s</label>
                </div>
                <div style="display:flex;align-items:center;gap:4px;">
                  <label style="font-size:9px;color:var(--ink-text-3);text-transform:uppercase;letter-spacing:.06em;">Scenario</label>
                  <select class="ink-select" style="height:26px;font-size:11px;padding:0 6px;min-width:46px;"
                    [value]="scene.scenario ?? ''"
                    (change)="patchScene(idx, 'scenario', +$any($event.target).value)">
                    <option value="">—</option>
                    @for (o of SCENARIO_OPTIONS; track o.value) {
                      <option [value]="o.value">{{ o.label }}</option>
                    }
                  </select>
                </div>
                <div style="display:flex;align-items:center;gap:4px;">
                  <label style="font-size:9px;color:var(--ink-text-3);text-transform:uppercase;letter-spacing:.06em;">Trans.</label>
                  <select class="ink-select" style="height:26px;font-size:11px;padding:0 6px;min-width:58px;"
                    [value]="scene.transition ?? ''"
                    (change)="patchScene(idx, 'transition', $any($event.target).value)">
                    <option value="">—</option>
                    @for (t of TRANSITION_OPTIONS; track t.value) {
                      <option [value]="t.value">{{ t.label }}</option>
                    }
                  </select>
                </div>
              </div>

              <!-- Scenario context hint -->
              @if (scene.scenario) {
                <div style="padding:5px 12px;font-size:10px;color:var(--ink-text-3);background:var(--ink-dim);border-bottom:1px solid var(--ink-border);line-height:1.4;">
                  {{ scenarioDesc(scene.scenario) }}
                </div>
              }

              <!-- Existing assets strip -->
              @if (scene.start_frame_url || scene.storyboard_url || scene.clip_url) {
                <div style="display:flex;gap:8px;padding:10px 12px;border-bottom:1px solid var(--ink-border);overflow-x:auto;align-items:flex-start;background:var(--ink-raised);">
                  @if (scene.start_frame_url || scene.storyboard_url) {
                    <div style="position:relative;flex-shrink:0;">
                      <img [src]="scene.start_frame_url ?? scene.storyboard_url!"
                        style="height:110px;width:auto;border-radius:6px;display:block;background:#000;border:1px solid var(--ink-border);" />
                      <div style="position:absolute;top:4px;left:4px;">
                        <span class="ink-badge" style="font-size:8px;opacity:.88;backdrop-filter:blur(6px);">{{ scene.start_frame_url ? 'start frame' : 'storyboard' }}</span>
                      </div>
                      @if (scene.vision_check) {
                        <div style="position:absolute;top:4px;right:4px;">
                          <span [class]="'ink-badge ' + visionBadgeClass(scene.vision_check.status)" style="font-size:9px;backdrop-filter:blur(6px);">
                            {{ scene.vision_check.score }}/10
                          </span>
                        </div>
                      }
                    </div>
                  }
                  @if (scene.clip_url) {
                    <div style="flex-shrink:0;">
                      <video [src]="scene.clip_url" controls preload="metadata"
                        style="height:110px;width:auto;border-radius:6px;background:#000;display:block;border:1px solid var(--ink-border);"></video>
                    </div>
                  }
                  @if (scene.vision_check?.issues?.length) {
                    <div style="display:flex;flex-direction:column;gap:3px;padding:4px 0;flex-shrink:0;max-width:190px;">
                      @for (issue of scene.vision_check!.issues; track issue) {
                        <p style="font-size:10px;color:var(--ink-breaking);margin:0;line-height:1.4;">• {{ issue }}</p>
                      }
                    </div>
                  }
                </div>
              }

              <!-- Prompt editors -->
              <div style="padding:14px 12px;display:flex;flex-direction:column;gap:16px;background:var(--ink-raised);">

                <!-- Image Prompt -->
                <div>
                  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
                    <p class="section-label" style="margin:0;">Image Prompt</p>
                    <span style="font-size:9px;font-family:'JetBrains Mono',monospace;color:var(--ink-text-3);">{{ (scene.image_prompt ?? '').length }} chars</span>
                  </div>
                  <textarea class="ink-input"
                    style="width:100%;min-height:96px;resize:vertical;font-size:12px;line-height:1.65;padding:8px 10px;font-family:inherit;box-sizing:border-box;"
                    [value]="scene.image_prompt ?? ''"
                    placeholder="Flowing paragraph — photorealistic, mood-led, no bracketed labels…"
                    (input)="patchImagePrompt(idx, $any($event.target).value)"
                  ></textarea>
                  @if (safetyWarnings(scene.image_prompt ?? '').length) {
                    <div style="margin-top:6px;display:flex;flex-direction:column;gap:4px;">
                      @for (w of safetyWarnings(scene.image_prompt ?? ''); track w.term) {
                        <div style="display:flex;align-items:center;gap:8px;padding:5px 8px;background:rgba(255,140,0,.08);border:1px solid rgba(255,140,0,.25);border-radius:5px;">
                          <span style="font-size:10px;color:var(--ink-alert);flex:1;">⚠ "<code style="font-family:'JetBrains Mono',monospace;">{{ w.term }}</code>" may be flagged by Higgsfield</span>
                          <button class="btn-ink" style="height:20px;font-size:9px;padding:0 8px;flex-shrink:0;"
                            (click)="applyFix(idx, w.term, w.fix)">→ {{ w.fix }}</button>
                        </div>
                      }
                    </div>
                  }
                </div>

                <!-- Video Prompt -->
                <div>
                  <p class="section-label" style="margin-bottom:10px;">Video Prompt</p>
                  <div style="display:flex;flex-direction:column;gap:8px;">
                    @for (field of VIDEO_PROMPT_FIELDS; track field.key) {
                      <div style="display:grid;grid-template-columns:108px 1fr;gap:8px;align-items:start;">
                        <div style="padding-top:6px;">
                          <span style="font-size:11px;font-weight:600;color:var(--ink-text-2);display:block;">{{ field.label }}</span>
                          <span style="font-size:9px;color:var(--ink-text-3);line-height:1.3;display:block;margin-top:2px;">{{ field.hint }}</span>
                        </div>
                        <textarea class="ink-input"
                          style="font-size:12px;line-height:1.55;padding:6px 8px;resize:vertical;font-family:inherit;width:100%;box-sizing:border-box;"
                          [rows]="field.rows"
                          [value]="(scene.video_prompt ?? {})[field.key] ?? ''"
                          [placeholder]="field.hint"
                          (input)="patchVideoField(idx, field.key, $any($event.target).value)"
                        ></textarea>
                      </div>
                    }
                    <!-- Duration (video_prompt.durationSec) -->
                    <div style="display:grid;grid-template-columns:108px 1fr;gap:8px;align-items:center;">
                      <div>
                        <span style="font-size:11px;font-weight:600;color:var(--ink-text-2);display:block;">Duration</span>
                        <span style="font-size:9px;color:var(--ink-text-3);">seconds for this clip</span>
                      </div>
                      <div style="display:flex;align-items:center;gap:6px;">
                        <input type="number" class="ink-input"
                          style="width:64px;height:32px;padding:0 8px;font-size:13px;font-family:'JetBrains Mono',monospace;"
                          [value]="(scene.video_prompt ?? {})['durationSec'] ?? scene.duration_sec ?? ''"
                          placeholder="11" min="1" max="60"
                          (change)="patchVideoField(idx, 'durationSec', $any($event.target).value)"
                        />
                        <span style="font-size:12px;color:var(--ink-text-3);">s</span>
                      </div>
                    </div>
                  </div>
                </div>

              </div>

              <!-- Scene save footer -->
              <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-top:1px solid var(--ink-border);background:var(--ink-surface);">
                <div>
                  @if (isDirty(idx)) {
                    <span style="font-size:10px;color:var(--ink-alert);font-weight:600;">● unsaved changes</span>
                  } @else {
                    <span style="font-size:10px;color:var(--ink-text-3);">{{ scene.scene_status ? 'Saved · ' + scene.scene_status : 'No changes' }}</span>
                  }
                </div>
                <div style="display:flex;gap:6px;">
                  @if (isDirty(idx)) {
                    <button class="btn-ink" style="height:28px;font-size:11px;padding:0 10px;" (click)="revertScene(idx)">Revert</button>
                  }
                  <button class="btn-brand" style="height:28px;font-size:11px;padding:0 12px;"
                    [disabled]="saving() || !isDirty(idx)"
                    (click)="saveScene(idx)">
                    {{ saving() ? 'Saving…' : 'Save scene ' + scene.scene_num }}
                  </button>
                </div>
              </div>

            </div>
          }
        }

        <!-- ── Config ── -->
        @if (activeTab() === 2) {
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
            <div>
              <p class="section-label" style="margin-bottom:2px;">⚙ Generation Config @if (item.format) { · {{ item.format }} }</p>
              <p style="font-size:10px;color:var(--ink-text-3);margin:0;">Defaults from channel · override per-reel. Saved to <code style="font-family:'JetBrains Mono',monospace;">gen_config</code> jsonb.</p>
            </div>
            @if (item.format) {
              <span class="ink-badge ib-brand" style="font-family:'JetBrains Mono',monospace;">{{ item.format }}</span>
            }
          </div>

          <!-- Platform (Higgsfield only for now) -->
          <div>
            <p class="section-label">Platform</p>
            <select class="ink-select" style="height:30px;font-size:12px;padding:0 8px;width:100%;max-width:280px;" disabled>
              <option>Higgsfield</option>
            </select>
            <p style="font-size:9px;color:var(--ink-text-3);margin:4px 0 0;">fal.ai · Replicate · RunwayML — coming soon</p>
          </div>

          <!-- Image Generation -->
          <div style="border-top:1px solid var(--ink-border);padding-top:12px;">
            <p class="section-label">🖼 Image Generation</p>
            <div style="display:flex;flex-direction:column;gap:10px;">
              <div>
                <label style="font-size:9px;color:var(--ink-text-3);text-transform:uppercase;letter-spacing:.06em;display:block;margin-bottom:4px;">Model</label>
                <select class="ink-select" style="height:30px;font-size:12px;padding:0 8px;width:100%;"
                  [value]="genConfigDraft().imageModel ?? CHANNEL_DEFAULTS.imageModel"
                  (change)="patchConfig('imageModel', $any($event.target).value)">
                  @for (m of IMAGE_MODELS; track m.id) {
                    <option [value]="m.id">{{ m.label }}</option>
                  }
                </select>
              </div>
              <div style="display:flex;gap:20px;flex-wrap:wrap;">
                <div>
                  <label style="font-size:9px;color:var(--ink-text-3);text-transform:uppercase;letter-spacing:.06em;display:block;margin-bottom:4px;">Resolution</label>
                  <div style="display:flex;gap:4px;">
                    @for (r of IMAGE_RES; track r) {
                      <button [class]="'pill ' + ((genConfigDraft().imageRes ?? CHANNEL_DEFAULTS.imageRes) === r ? 'pill-on' : '')"
                        (click)="patchConfig('imageRes', r)">{{ r.toUpperCase() }}</button>
                    }
                  </div>
                </div>
                <div>
                  <label style="font-size:9px;color:var(--ink-text-3);text-transform:uppercase;letter-spacing:.06em;display:block;margin-bottom:4px;">Aspect Ratio</label>
                  <div style="display:flex;gap:4px;">
                    @for (a of ASPECT_RATIOS; track a) {
                      <button [class]="'pill ' + ((genConfigDraft().aspectRatio ?? CHANNEL_DEFAULTS.aspectRatio) === a ? 'pill-on' : '')"
                        (click)="patchConfig('aspectRatio', a)">{{ a }}</button>
                    }
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Video Generation — hidden for portrait -->
          @if (item.format !== 'portrait') {
            <div style="border-top:1px solid var(--ink-border);padding-top:12px;">
              <p class="section-label">🎬 Video Generation</p>
              <div style="display:flex;flex-direction:column;gap:10px;">
                <div>
                  <label style="font-size:9px;color:var(--ink-text-3);text-transform:uppercase;letter-spacing:.06em;display:block;margin-bottom:4px;">Model</label>
                  <select class="ink-select" style="height:30px;font-size:12px;padding:0 8px;width:100%;"
                    [value]="genConfigDraft().videoModel ?? CHANNEL_DEFAULTS.videoModel"
                    (change)="patchConfig('videoModel', $any($event.target).value)">
                    @for (m of VIDEO_MODELS; track m.id) {
                      <option [value]="m.id" [disabled]="item.format === '21s' && !m.endImage">
                        {{ m.label }}{{ item.format === '21s' && !m.endImage ? ' — no end_image ✗' : '' }}
                      </option>
                    }
                  </select>
                  @if (item.format === '21s') {
                    <p style="font-size:9px;color:var(--ink-text-3);margin:4px 0 0;">21s scenario-3 chain needs a start+end model — turbo disabled.</p>
                  }
                </div>
                <div>
                  <label style="font-size:9px;color:var(--ink-text-3);text-transform:uppercase;letter-spacing:.06em;display:block;margin-bottom:4px;">Resolution</label>
                  <div style="display:flex;gap:4px;flex-wrap:wrap;">
                    @for (r of VIDEO_RES; track r) {
                      <button [class]="'pill ' + ((genConfigDraft().videoRes ?? CHANNEL_DEFAULTS.videoRes) === r ? 'pill-on' : '')"
                        (click)="patchConfig('videoRes', r)">{{ r }}</button>
                    }
                  </div>
                </div>
                <!-- Clip duration (gen_config.duration) — overrides the format preset. -->
                @if (item.format !== '21s') {
                  <div>
                    <label style="font-size:9px;color:var(--ink-text-3);text-transform:uppercase;letter-spacing:.06em;display:block;margin-bottom:4px;">Clip duration (s)</label>
                    <input type="number" class="ink-select" style="height:30px;font-size:12px;padding:0 8px;width:120px;"
                      [min]="durationRange().min" [max]="durationRange().max" step="1"
                      [value]="resolvedDuration()"
                      (change)="setDuration($any($event.target).value)" />
                    <p style="font-size:9px;color:var(--ink-text-3);margin:4px 0 0;">
                      {{ genConfigDraft().videoModel ?? CHANNEL_DEFAULTS.videoModel }} supports {{ durationRange().min }}–{{ durationRange().max }}s@if (durationRange().fixed) { · valid: {{ durationRange().fixed?.join(' / ') }}s }. Default {{ formatDurationDefault() }}s from {{ item.format }} preset.
                    </p>
                  </div>
                }
              </div>
            </div>
          }

          <!-- Footer -->
          <div style="border-top:1px solid var(--ink-border);padding-top:12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <button class="btn-brand" [disabled]="!genConfigDirty() || saving()" (click)="saveConfig()">Save config</button>
            <button class="btn-ink" (click)="resetConfig()">↺ Reset to channel defaults</button>
          </div>
        }

        <!-- ── SEO ── -->
        @if (activeTab() === 3) {
          @if (item.seo) {
            <div>
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
                <p class="section-label" style="margin-bottom:0;">Title</p>
                <button class="btn-ink" style="height:26px;padding:0 10px;font-size:11px;" (click)="copy(item.seo!.title)">Copy</button>
              </div>
              <div class="ink-content-block">{{ item.seo!.title }}</div>
            </div>
            <div>
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
                <p class="section-label" style="margin-bottom:0;">Description</p>
                <button class="btn-ink" style="height:26px;padding:0 10px;font-size:11px;" (click)="copy(item.seo!.description)">Copy</button>
              </div>
              <div class="ink-content-block" style="white-space:pre-wrap;max-height:200px;overflow-y:auto;">{{ item.seo!.description }}</div>
            </div>
            @if (item.seo!.hashtags?.length) {
              <div>
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
                  <p class="section-label" style="margin-bottom:0;">Hashtags</p>
                  <button class="btn-ink" style="height:26px;padding:0 10px;font-size:11px;" (click)="copy(item.seo!.hashtags.join(' '))">Copy all</button>
                </div>
                <div style="display:flex;gap:4px;flex-wrap:wrap;">
                  @for (tag of item.seo!.hashtags; track tag) {
                    <span class="ink-badge ib-brand" style="cursor:pointer;" (click)="copy(tag)">{{ tag }}</span>
                  }
                </div>
              </div>
            }
            <button class="btn-brand" style="width:100%;justify-content:center;" (click)="copyFullSeo()">📋 Copy full caption package</button>
          } @else if (item.ai_caption) {
            <div>
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
                <p class="section-label" style="margin-bottom:0;">Caption</p>
                <button class="btn-ink" style="height:26px;padding:0 10px;font-size:11px;" (click)="copy(captionText())">Copy</button>
              </div>
              <div class="ink-content-block" style="white-space:pre-wrap;max-height:200px;overflow-y:auto;">{{ captionText() }}</div>
            </div>
          } @else {
            <div class="empty-state">
              <div style="font-size:32px;opacity:.2;">◑</div>
              <p style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;">No SEO content yet</p>
            </div>
          }
        }

        <!-- ── Pipeline ── -->
        @if (activeTab() === 4) {
          @if (item.rendered_video_url) {
            <div>
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
                <p class="section-label" style="margin-bottom:0;">▶ Rendered Video</p>
                <button class="btn-ink" style="height:26px;padding:0 10px;font-size:11px;" (click)="copy(item.rendered_video_url!)">Copy URL</button>
              </div>
              <video [src]="item.rendered_video_url!" controls preload="metadata"
                style="width:100%;max-height:300px;border-radius:8px;background:#000;display:block;"></video>
            </div>
            <div style="border-top:1px solid var(--ink-border);"></div>
          }
          @if (hasJobIds()) {
            <div>
              <p class="section-label">Higgsfield Jobs</p>
              <div style="display:flex;flex-direction:column;gap:6px;">
                @for (scene of item.scenes!; track scene.scene_num) {
                  @if (scene.higgsfield_image_job || scene.higgsfield_video_job) {
                    <div style="background:var(--ink-raised);border:1px solid var(--ink-border);border-radius:6px;padding:8px 10px;display:flex;flex-direction:column;gap:4px;">
                      <span style="font-size:10px;font-weight:700;color:var(--ink-text-3);">Scene {{ scene.scene_num }}</span>
                      @if (scene.higgsfield_image_job) {
                        <div style="display:flex;align-items:center;gap:6px;">
                          <span style="font-size:10px;color:var(--ink-text-3);width:32px;flex-shrink:0;">img</span>
                          <code style="font-size:10px;font-family:'JetBrains Mono',monospace;color:var(--ink-text-2);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{{ scene.higgsfield_image_job }}</code>
                          <button class="btn-ghost-icon" style="width:24px;height:24px;font-size:11px;" (click)="copy(scene.higgsfield_image_job!)">⧉</button>
                        </div>
                      }
                      @if (scene.higgsfield_video_job) {
                        <div style="display:flex;align-items:center;gap:6px;">
                          <span style="font-size:10px;color:var(--ink-text-3);width:32px;flex-shrink:0;">vid</span>
                          <code style="font-size:10px;font-family:'JetBrains Mono',monospace;color:var(--ink-text-2);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{{ scene.higgsfield_video_job }}</code>
                          <button class="btn-ghost-icon" style="width:24px;height:24px;font-size:11px;" (click)="copy(scene.higgsfield_video_job!)">⧉</button>
                        </div>
                      }
                    </div>
                  }
                }
              </div>
            </div>
            <div style="border-top:1px solid var(--ink-border);"></div>
          }
          @if (hasPlatformActivity()) {
            <div>
              <p class="section-label">📡 Platforms</p>
              <div style="display:flex;flex-direction:column;gap:6px;">
                @for (p of platformRows(); track p.key) {
                  @if (p.targeted) {
                    <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--ink-raised);border-radius:6px;border:1px solid var(--ink-border);">
                      <span [style.width]="'8px'" [style.height]="'8px'" [style.border-radius]="'50%'" [style.flex-shrink]="'0'" [style.background]="p.dotColor"></span>
                      <span style="font-size:12px;font-weight:600;color:var(--ink-text);width:28px;flex-shrink:0;">{{ p.label }}</span>
                      <span [class]="'ink-badge ' + p.badgeClass" style="font-size:10px;">{{ p.status }}</span>
                    </div>
                  }
                }
              </div>
            </div>
          }
          @if (!item.rendered_video_url && !hasJobIds() && !hasPlatformActivity()) {
            <div class="empty-state">
              <div style="font-size:32px;opacity:.2;">◈</div>
              <p style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;">Pipeline hasn't run yet</p>
            </div>
          }
        }

      </div>

      <!-- Inline toast -->
      @if (toast()) {
        <div style="position:absolute;bottom:80px;left:50%;transform:translateX(-50%);z-index:10;pointer-events:none;">
          <div [class]="'toast-msg ' + (toast()!.ok ? 'toast-ok' : 'toast-err')">
            {{ toast()!.ok ? '✓' : '✗' }} {{ toast()!.msg }}
          </div>
        </div>
      }

      <!-- Footer -->
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 16px;border-top:1px solid var(--ink-border);flex-shrink:0;flex-wrap:wrap;">
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          @if (item.status === 'rendered') {
            <button class="btn-brand" style="background:var(--ink-trending);" (click)="markPosted()">✓ Mark as Posted</button>
          }
          @if (item.rendered_video_url) {
            <button class="btn-ink" (click)="copyFullPackage()">📋 Copy package</button>
            <button class="btn-ink" style="opacity:.5;cursor:not-allowed;" disabled title="Coming soon — server-side FFmpeg overlay">💧 Add Watermark</button>
          }
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <button class="btn-reject" (click)="deleteItem()">Delete</button>
          <button class="btn-ink" (click)="closePanel.emit()">Close</button>
        </div>
      </div>

    </div>
  `,
  styles: [`
    :host { display: block; }
    .pill {
      height: 26px; padding: 0 10px; font-size: 11px; font-family: 'JetBrains Mono', monospace;
      border-radius: 6px; border: 1px solid var(--ink-border); background: var(--ink-raised);
      color: var(--ink-text-2); cursor: pointer; transition: all .12s;
    }
    .pill:hover { border-color: var(--ink-text-3); }
    .pill-on {
      background: var(--ink-brand, #4f46e5); border-color: var(--ink-brand, #4f46e5); color: #fff;
    }
  `],
})
export class ReelDetailComponent implements OnInit, OnChanges, OnDestroy {
  @Input() item!: ContentItem;
  @Output() closePanel   = new EventEmitter<void>();
  @Output() itemUpdated  = new EventEmitter<ContentItem>();
  @Output() itemDeleted  = new EventEmitter<number>();

  tabs     = ['Overview', 'Scenes', 'Config', 'SEO', 'Pipeline'];
  activeTab     = signal(0);
  toast         = signal<{ msg: string; ok: boolean } | null>(null);
  saving        = signal(false);
  expandingBrief  = signal(false);
  triggering      = signal(false);
  runUrl          = signal<string | null>(null);

  sceneDrafts  = signal<ContentItemScene[]>([]);
  private _dirty = signal<Set<number>>(new Set());

  genConfigDraft = signal<GenConfig>({});
  private _genConfigDirty = signal(false);

  readonly SCENARIO_OPTIONS    = SCENARIO_OPTIONS;
  readonly TRANSITION_OPTIONS  = TRANSITION_OPTIONS;
  readonly VIDEO_PROMPT_FIELDS = VIDEO_PROMPT_FIELDS;
  readonly IMAGE_MODELS        = IMAGE_MODELS;
  readonly VIDEO_MODELS        = VIDEO_MODELS;
  readonly IMAGE_RES           = IMAGE_RES;
  readonly VIDEO_RES           = VIDEO_RES;
  readonly ASPECT_RATIOS       = ASPECT_RATIOS;
  readonly CHANNEL_DEFAULTS    = CHANNEL_DEFAULTS;

  private toastTimer: any;
  private _originalScenes: ContentItemScene[] = [];

  constructor(private supabase: SupabaseService) {}

  ngOnInit() { this.initDrafts(); }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['item'] && !changes['item'].firstChange) this.initDrafts();
  }

  ngOnDestroy() { clearTimeout(this.toastTimer); }

  private initDrafts() {
    this._originalScenes = structuredClone(this.item.scenes ?? []);
    this.sceneDrafts.set(structuredClone(this.item.scenes ?? []));
    this._dirty.set(new Set());
    this.genConfigDraft.set(structuredClone(this.item.gen_config ?? {}));
    this._genConfigDirty.set(false);
  }

  // ── Generation config (per-reel gen_config jsonb) ─────────

  genConfigDirty() { return this._genConfigDirty(); }

  patchConfig(field: keyof GenConfig, val: any) {
    this.genConfigDraft.update(c => ({ ...c, [field]: val }));
    this._genConfigDirty.set(true);
  }

  // Clip-duration override (gen_config.duration). Overrides the format preset;
  // resolved/clamped to the selected video model's valid range.
  durationRange() {
    const model = this.genConfigDraft().videoModel ?? CHANNEL_DEFAULTS.videoModel;
    return DURATION_RANGE[model] ?? DEFAULT_DURATION_RANGE;
  }
  formatDurationDefault(): number {
    return this.item.format === '21s' ? 21 : 11;
  }
  resolvedDuration(): number {
    return this.genConfigDraft().duration ?? this.formatDurationDefault();
  }
  setDuration(raw: any) {
    const r = this.durationRange();
    let v = Math.round(Number(raw));
    if (!Number.isFinite(v)) return;
    v = Math.min(r.max, Math.max(r.min, v));
    this.patchConfig('duration', v);
  }

  async saveConfig() {
    if (this.saving() || !this._genConfigDirty()) return;
    this.saving.set(true);
    try {
      const gen_config = structuredClone(this.genConfigDraft());
      await this.supabase.updateContentItemFields(this.item.id, { gen_config });
      this.item = { ...this.item, gen_config };
      this.itemUpdated.emit(this.item);
      this._genConfigDirty.set(false);
      this.showToast('Generation config saved');
    } catch (err: any) {
      this.showToast(err.message, false);
    } finally {
      this.saving.set(false);
    }
  }

  async resetConfig() {
    if (this.saving()) return;
    this.saving.set(true);
    try {
      await this.supabase.updateContentItemFields(this.item.id, { gen_config: null });
      this.item = { ...this.item, gen_config: null };
      this.itemUpdated.emit(this.item);
      this.genConfigDraft.set({});
      this._genConfigDirty.set(false);
      this.showToast('Reset to channel defaults');
    } catch (err: any) {
      this.showToast(err.message, false);
    } finally {
      this.saving.set(false);
    }
  }

  // ── Dirty tracking ────────────────────────────────────────

  dirtyCount() { return this._dirty().size; }
  isDirty(idx: number) { return this._dirty().has(idx); }
  private markDirty(idx: number) { this._dirty.update(s => new Set([...s, idx])); }
  private clearDirty(idx: number) { this._dirty.update(s => { const n = new Set(s); n.delete(idx); return n; }); }

  // ── Draft mutators ────────────────────────────────────────

  patchScene(idx: number, field: keyof ContentItemScene, val: any) {
    this.sceneDrafts.update(s => { const n = [...s]; n[idx] = { ...n[idx], [field]: val }; return n; });
    this.markDirty(idx);
  }

  patchImagePrompt(idx: number, val: string) { this.patchScene(idx, 'image_prompt', val); }

  patchVideoField(idx: number, field: string, val: string) {
    this.sceneDrafts.update(s => {
      const n = [...s];
      n[idx] = { ...n[idx], video_prompt: { ...(n[idx].video_prompt ?? {}), [field]: val } };
      return n;
    });
    this.markDirty(idx);
  }

  applyFix(idx: number, term: string, fix: string) {
    const current = this.sceneDrafts()[idx]?.image_prompt ?? '';
    this.patchScene(idx, 'image_prompt', current.replace(new RegExp(term, 'gi'), fix));
  }

  revertScene(idx: number) {
    const orig = this._originalScenes[idx];
    if (!orig) return;
    this.sceneDrafts.update(s => { const n = [...s]; n[idx] = structuredClone(orig); return n; });
    this.clearDirty(idx);
  }

  // ── Persistence ───────────────────────────────────────────

  async saveScene(idx: number) {
    if (this.saving()) return;
    this.saving.set(true);
    try {
      const scenes = structuredClone(this.sceneDrafts());
      await this.supabase.updateContentItemScenes(this.item.id, scenes);
      this._originalScenes = scenes;
      this.item = { ...this.item, scenes };
      this.itemUpdated.emit(this.item);
      this.clearDirty(idx);
      this.showToast(`Scene ${scenes[idx].scene_num} saved`);
    } catch (err: any) {
      this.showToast(err.message, false);
    } finally {
      this.saving.set(false);
    }
  }

  async saveAll() {
    if (this.saving()) return;
    this.saving.set(true);
    try {
      const scenes = structuredClone(this.sceneDrafts());
      await this.supabase.updateContentItemScenes(this.item.id, scenes);
      this._originalScenes = scenes;
      this.item = { ...this.item, scenes };
      this.itemUpdated.emit(this.item);
      this._dirty.set(new Set());
      this.showToast('All scenes saved');
    } catch (err: any) {
      this.showToast(err.message, false);
    } finally {
      this.saving.set(false);
    }
  }

  // ── Brief expansion (Claude → scene prompts) ──────────────

  async expandBrief() {
    if (this.expandingBrief()) return;
    this.expandingBrief.set(true);
    try {
      const result = await this.supabase.expandBrief(this.item.id);
      this.item = { ...this.item, scenes: result.scenes as any, status: result.status as any };
      this.initDrafts();
      this.itemUpdated.emit(this.item);
      this.activeTab.set(1); // Jump to Scenes tab so user sees what was generated
      this.showToast(`${result.scenes.length} scene prompt${result.scenes.length !== 1 ? 's' : ''} generated`);
    } catch (err: any) {
      this.showToast(err.message, false);
    } finally {
      this.expandingBrief.set(false);
    }
  }

  // ── GitHub Actions generation trigger ─────────────────────

  async triggerGeneration() {
    if (this.triggering()) return;
    this.triggering.set(true);
    this.runUrl.set(null);
    try {
      const result = await this.supabase.triggerGeneration(this.item.id);
      this.runUrl.set(result.runUrl);
      this.showToast('Generation queued on GitHub Actions');
    } catch (err: any) {
      this.showToast(err.message, false);
    } finally {
      this.triggering.set(false);
    }
  }

  // ── Safety lint ───────────────────────────────────────────

  safetyWarnings(prompt: string): { term: string; fix: string }[] {
    const l = prompt.toLowerCase();
    return UNSAFE_TERMS.filter(u => l.includes(u.term));
  }

  scenarioDesc(scenario: number): string {
    return SCENARIO_OPTIONS.find(o => o.value === scenario)?.desc ?? '';
  }

  // ── Display helpers ───────────────────────────────────────

  statusBg(status: string): string {
    const m: Record<string, string> = {
      brief:      'linear-gradient(135deg,rgba(99,102,241,.14) 0%,rgba(99,102,241,.04) 100%)',
      storyboard: 'linear-gradient(135deg,rgba(99,102,241,.14) 0%,rgba(99,102,241,.04) 100%)',
      generating: 'linear-gradient(135deg,rgba(255,140,0,.14) 0%,rgba(255,140,0,.04) 100%)',
      rendered:   'linear-gradient(135deg,rgba(30,122,255,.14) 0%,rgba(30,122,255,.04) 100%)',
      posted:     'linear-gradient(135deg,rgba(0,204,112,.14) 0%,rgba(0,204,112,.04) 100%)',
      blocked:    'linear-gradient(135deg,rgba(255,54,54,.14) 0%,rgba(255,54,54,.04) 100%)',
      failed:     'linear-gradient(135deg,rgba(255,54,54,.14) 0%,rgba(255,54,54,.04) 100%)',
    };
    return m[status] ?? 'transparent';
  }

  statusBadgeClass(s: string): string {
    return ({brief:'ib-ai',storyboard:'ib-ai',generating:'ib-alert',pending:'',
      rendering:'ib-alert',rendered:'ib-trending',publishing:'ib-alert',
      posted:'ib-standard',failed:'ib-breaking',blocked:'ib-breaking'} as any)[s] ?? '';
  }

  visionBadgeClass(s: string): string {
    return ({pass:'ib-standard',blocked:'ib-breaking',retry:'ib-alert'} as any)[s] ?? 'ib-ai';
  }

  sceneStatusClass(s: string): string {
    return ({image_done:'ib-ai',video_done:'ib-trending',blocked:'ib-breaking'} as any)[s] ?? '';
  }

  hasJobIds() { return !!this.item.scenes?.some(s => s.higgsfield_image_job || s.higgsfield_video_job); }
  hasPlatformActivity() { return ['fb','ig','yt','tt'].some(p => this.item.target_platforms?.includes(p)); }

  platformRows() {
    return [
      {key:'fb',label:'FB',idField:'fb_post_id'},
      {key:'ig',label:'IG',idField:'ig_post_id'},
      {key:'yt',label:'YT',idField:'yt_video_id'},
      {key:'tt',label:'TT',idField:'tt_video_id'},
    ].map(({key,label}) => {
      const targeted  = this.item.target_platforms?.includes(key) ?? false;
      const status    = (this.item as any)[`${key}_status`] ?? (targeted ? 'not started' : '—');
      const dotColor  = !targeted ? 'var(--ink-border)' : status==='posted' ? '#00cc70' : status==='failed' ? '#ff3636' : 'var(--ink-text-3)';
      const badgeClass = status==='posted' ? 'ib-standard' : status==='failed' ? 'ib-breaking' : status!=='—'&&status!=='not started' ? 'ib-alert' : '';
      return {key,label,targeted,status,dotColor,badgeClass};
    });
  }

  captionText(): string {
    const c = this.item.ai_caption;
    return c ? [c.intro,c.question,c.cta].filter(Boolean).join('\n\n') : '';
  }

  copyFullSeo() {
    const s = this.item.seo;
    if (s) this.copy([s.description,'',s.hashtags.join(' ')].join('\n'));
  }

  copyFullPackage() {
    const p: string[] = [];
    if (this.item.rendered_video_url) p.push(`VIDEO: ${this.item.rendered_video_url}`);
    if (this.item.seo?.description)   p.push(`\nCAPTION:\n${this.item.seo.description}`);
    if (this.item.seo?.hashtags?.length) p.push(`\nHASHTAGS:\n${this.item.seo.hashtags.join(' ')}`);
    this.copy(p.join('\n'));
  }

  async markPosted() {
    try {
      await this.supabase.updateContentItemStatus(this.item.id, 'posted', {
        fb_status:'posted', fb_posted_at: new Date().toISOString(),
      });
      this.item = { ...this.item, status:'posted' };
      this.itemUpdated.emit(this.item);
      this.showToast('Marked as posted');
    } catch (err: any) { this.showToast(err.message, false); }
  }

  deleteItem() {
    if (!confirm(`Delete "${this.item.title ?? this.item.channel_key}"?\nThis cannot be undone.`)) return;
    this.itemDeleted.emit(this.item.id);
  }

  copy(text: string) { navigator.clipboard.writeText(text).then(() => this.showToast('Copied')); }

  showToast(msg: string, ok = true) {
    clearTimeout(this.toastTimer);
    this.toast.set({ msg, ok });
    this.toastTimer = setTimeout(() => this.toast.set(null), 2500);
  }
}
