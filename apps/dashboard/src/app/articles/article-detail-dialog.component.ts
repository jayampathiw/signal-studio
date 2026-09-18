import {
  Component,
  Input,
  Output,
  EventEmitter,
  signal,
  OnDestroy,
  PLATFORM_ID,
  Inject,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DatePipe } from '@angular/common';
import { Article, SupabaseService } from '../core/supabase.service';

@Component({
  selector: 'app-article-detail',
  standalone: true,
  imports: [DatePipe],
  template: `
    <div
      style="display:flex;flex-direction:column;height:100%;background:var(--ink-surface);position:relative;"
    >
      <!-- ── Header ── -->
      <div
        style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;flex-shrink:0;border-bottom:1px solid var(--ink-border);"
        [style.background]="critBg(article.criticality)"
      >
        <div style="display:flex;align-items:center;gap:6px;">
          <span [class]="critSigClass(article.criticality)"></span>
          <span [class]="'ink-badge ' + critBadgeClass(article.criticality)">{{
            article.criticality
          }}</span>
          <span class="ink-badge" style="background:var(--ink-raised);color:var(--ink-text-2);">{{
            article.country
          }}</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <span [class]="'ink-badge ' + statusBadgeClass(article.status)">{{
            article.status
          }}</span>
          <button class="btn-ghost-icon" (click)="closePanel.emit()">✕</button>
        </div>
      </div>

      <!-- ── Title + meta ── -->
      <div style="padding:12px 16px;border-bottom:1px solid var(--ink-border);flex-shrink:0;">
        <h2
          style="font-size:14px;font-weight:600;line-height:1.45;color:var(--ink-text);margin-bottom:6px;"
        >
          {{ article.title }}
        </h2>
        <div
          style="display:flex;align-items:center;gap:8px;font-size:11px;color:var(--ink-text-2);font-family:'JetBrains Mono',monospace;flex-wrap:wrap;"
        >
          <span>{{ article.source }}</span>
          <span style="color:var(--ink-text-3);">·</span>
          <span>{{ article.created_at | date: 'dd MMM yyyy, HH:mm' }}</span>
        </div>
      </div>

      <!-- ── Tabs ── -->
      <div class="ink-tabs scrollbar-none" style="overflow-x:auto;">
        @for (tab of tabs; track tab; let i = $index) {
          <button
            [class]="'ink-tab ' + (activeTab() === i ? 'active' : '')"
            (click)="activeTab.set(i)"
          >
            {{ tab }}
          </button>
        }
      </div>

      <!-- ── Scrollable body ── -->
      <div style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:16px;">
        <!-- Overview -->
        @if (activeTab() === 0) {
          @if (article.summary) {
            <div>
              <p class="section-label">Summary</p>
              <p style="font-size:13px;color:var(--ink-text);line-height:1.65;">
                {{ article.summary }}
              </p>
            </div>
            <div style="border-top:1px solid var(--ink-border);"></div>
          }
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;">
            <div>
              <p class="section-label">Criticality Score</p>
              <p
                style="font-size:28px;font-weight:700;color:var(--ink-text-2);font-family:'JetBrains Mono',monospace;line-height:1;"
              >
                {{ article.priority_score ?? '—' }}
              </p>
            </div>
            <div>
              <p class="section-label">Publish Score</p>
              <p
                style="font-size:28px;font-weight:700;color:var(--ink-brand);font-family:'JetBrains Mono',monospace;line-height:1;"
              >
                {{ article.publish_score?.toFixed(0) ?? '—' }}
              </p>
            </div>
            <div>
              <p class="section-label">Published</p>
              <p
                style="font-size:13px;color:var(--ink-text);font-family:'JetBrains Mono',monospace;"
              >
                {{ article.published_at ? (article.published_at | date: 'dd MMM yyyy') : '—' }}
              </p>
            </div>
          </div>
          <div style="border-top:1px solid var(--ink-border);"></div>
          <div>
            <div
              style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;"
            >
              <p class="section-label" style="margin-bottom:0;">Post format</p>
              @if (
                article.recommended_format && article.post_format === article.recommended_format
              ) {
                <span
                  style="font-size:10px;color:var(--ink-standard);letter-spacing:.04em;text-transform:uppercase;font-weight:600;"
                  >✓ suggested</span
                >
              }
            </div>
            <select
              class="ink-select"
              style="width:100%;"
              [value]="article.post_format ?? article.recommended_format ?? 'image'"
              [disabled]="updatingFormat()"
              (change)="updatePostFormat($any($event.target).value)"
            >
              @for (f of FORMATS; track f) {
                <option [value]="f">{{ formatLabel(f) }}</option>
              }
            </select>
            @if (article.recommended_format && article.post_format !== article.recommended_format) {
              <p style="font-size:10px;color:var(--ink-text-3);margin-top:4px;">
                Claude suggested: {{ formatLabel(article.recommended_format) }}
              </p>
            }
          </div>
          @if ((article.tags?.length ?? 0) > 0) {
            <div style="border-top:1px solid var(--ink-border);"></div>
            <div>
              <p class="section-label">Tags</p>
              <div style="display:flex;gap:4px;flex-wrap:wrap;">
                @for (tag of article.tags; track tag) {
                  <span [class]="'ink-badge ' + tagBadgeClass(tag)">{{ tagLabel(tag) }}</span>
                }
              </div>
            </div>
          }
          <div style="border-top:1px solid var(--ink-border);"></div>
          <div>
            <p class="section-label">Editor Notes</p>
            <textarea
              class="ink-input"
              rows="3"
              style="width:100%;resize:vertical;font-size:13px;box-sizing:border-box;"
              placeholder="Add research context, angle decisions, posting notes…"
              [value]="article.editor_notes ?? ''"
              (blur)="saveEditorNotes($any($event.target).value)"
            ></textarea>
          </div>
          <div style="border-top:1px solid var(--ink-border);"></div>
          <div>
            <p class="section-label">Article ID</p>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <code
                style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--ink-text-2);background:var(--ink-raised);border:1px solid var(--ink-border);padding:4px 8px;border-radius:4px;word-break:break-all;flex:1;"
                >{{ article.id }}</code
              >
              <button
                class="btn-ink"
                style="height:28px;padding:0 10px;font-size:11px;flex-shrink:0;"
                (click)="copy(article.id)"
              >
                Copy
              </button>
            </div>
          </div>
          <div style="border-top:1px solid var(--ink-border);"></div>
          <div>
            <div
              style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;"
            >
              <p class="section-label" style="margin-bottom:0;">Source URL</p>
              @if (article.url) {
                <button
                  class="btn-ink"
                  style="height:26px;padding:0 10px;font-size:11px;"
                  (click)="copy(article.url)"
                >
                  Copy
                </button>
              }
            </div>
            @if (article.url) {
              <a
                style="font-size:13px;color:var(--ink-brand);text-decoration:none;display:inline-flex;align-items:center;gap:4px;cursor:pointer;"
                (click)="openUrl(article.url)"
              >
                Open article <span style="opacity:.6;">↗</span>
              </a>
              <p
                style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--ink-text-3);margin-top:4px;word-break:break-all;"
              >
                {{ article.url }}
              </p>
            } @else {
              <p style="font-size:13px;color:var(--ink-text-3);">No source URL available</p>
            }
          </div>
          @if (article.fb_post_id) {
            <div style="border-top:1px solid var(--ink-border);"></div>
            <div>
              <p class="section-label">Facebook Post</p>
              <a
                [href]="'https://www.facebook.com/' + article.fb_post_id"
                target="_blank"
                rel="noopener"
                style="font-size:13px;color:var(--ink-brand);text-decoration:none;display:inline-flex;align-items:center;gap:4px;"
              >
                View on Facebook <span style="opacity:.6;">↗</span>
              </a>
              <p
                style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--ink-text-3);margin-top:4px;"
              >
                {{ article.fb_post_id }}
              </p>
            </div>
          }
        }

        <!-- Caption -->
        @if (activeTab() === 1) {
          @if (article.ai_caption?.intro) {
            @if (article.story_category) {
              <div style="display:flex;align-items:center;gap:6px;">
                <span class="ink-badge ib-brand">{{ article.story_category }}</span>
              </div>
            }
            <div>
              <div
                style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;"
              >
                <p class="section-label" style="margin-bottom:0;">Intro</p>
                <button
                  class="btn-ink"
                  style="height:26px;padding:0 10px;font-size:11px;"
                  (click)="copy(article.ai_caption!.intro)"
                >
                  Copy
                </button>
              </div>
              <div
                class="ink-content-block"
                style="white-space:pre-wrap;max-height:200px;overflow-y:auto;"
              >
                {{ article.ai_caption!.intro }}
              </div>
            </div>
            <div>
              <div
                style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;"
              >
                <p class="section-label" style="margin-bottom:0;">Engagement Question</p>
                <button
                  class="btn-ink"
                  style="height:26px;padding:0 10px;font-size:11px;"
                  (click)="copy(article.ai_caption!.question)"
                >
                  Copy
                </button>
              </div>
              <div class="ink-content-block" style="white-space:pre-wrap;">
                {{ article.ai_caption!.question }}
              </div>
            </div>
            <div>
              <div
                style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;"
              >
                <p class="section-label" style="margin-bottom:0;">CTA &amp; Source</p>
                <button
                  class="btn-ink"
                  style="height:26px;padding:0 10px;font-size:11px;"
                  (click)="copy(article.ai_caption!.cta)"
                >
                  Copy
                </button>
              </div>
              <div class="ink-content-block" style="white-space:pre-wrap;">
                {{ article.ai_caption!.cta }}
              </div>
            </div>
            @if ((article.hashtags?.length ?? 0) > 0) {
              <div>
                <div
                  style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;"
                >
                  <p class="section-label" style="margin-bottom:0;">Hashtags</p>
                  <button
                    class="btn-ink"
                    style="height:26px;padding:0 10px;font-size:11px;"
                    (click)="copy(article.hashtags!.join(' '))"
                  >
                    Copy all
                  </button>
                </div>
                <div style="display:flex;gap:4px;flex-wrap:wrap;">
                  @for (tag of article.hashtags; track tag) {
                    <span
                      class="ink-badge ib-brand"
                      style="cursor:pointer;"
                      (click)="copy(tag)"
                      title="Click to copy"
                      >{{ tag }}</span
                    >
                  }
                </div>
              </div>
            }
            @if (article.seed_comment) {
              <div>
                <div
                  style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;"
                >
                  <div>
                    <p class="section-label" style="margin-bottom:2px;">Seed Comment</p>
                    <p
                      style="font-size:10px;color:var(--ink-alert);letter-spacing:.04em;text-transform:uppercase;font-weight:600;"
                    >
                      Post within 2 min of publishing
                    </p>
                  </div>
                  <button
                    class="btn-ink"
                    style="height:26px;padding:0 10px;font-size:11px;"
                    (click)="copy(article.seed_comment!)"
                  >
                    Copy
                  </button>
                </div>
                <div class="ink-content-block">{{ article.seed_comment }}</div>
              </div>
            }
            <button
              class="btn-brand"
              style="width:100%;justify-content:center;"
              (click)="copyFullPost()"
            >
              📋 Copy full post
            </button>
          } @else {
            <div class="empty-state">
              <div style="font-size:32px;opacity:.2;">✦</div>
              <p style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;">
                No caption yet — use Generate below
              </p>
            </div>
          }
        }

        <!-- SEO -->
        @if (activeTab() === 2) {
          @if (article.seo_title || article.seo_description) {
            @if (article.story_category) {
              <div style="display:flex;align-items:center;gap:6px;">
                <p class="section-label" style="margin-bottom:0;">Category</p>
                <span class="ink-badge ib-brand">{{ article.story_category }}</span>
              </div>
            }
            <div>
              <div
                style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;"
              >
                <p class="section-label" style="margin-bottom:0;">
                  SEO Title
                  <span
                    [style.color]="
                      (article.seo_title || '').length > 60
                        ? 'var(--ink-breaking)'
                        : 'var(--ink-text-3)'
                    "
                    style="font-weight:400;text-transform:none;letter-spacing:normal;"
                  >
                    {{ (article.seo_title || '').length }}/60</span
                  >
                </p>
                <button
                  class="btn-ink"
                  style="height:26px;padding:0 10px;font-size:11px;"
                  (click)="copy(article.seo_title!)"
                >
                  Copy
                </button>
              </div>
              <div class="ink-content-block">{{ article.seo_title || '—' }}</div>
            </div>
            <div>
              <div
                style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;"
              >
                <p class="section-label" style="margin-bottom:0;">
                  SEO Description
                  <span
                    [style.color]="
                      (article.seo_description || '').length > 160
                        ? 'var(--ink-breaking)'
                        : 'var(--ink-text-3)'
                    "
                    style="font-weight:400;text-transform:none;letter-spacing:normal;"
                  >
                    {{ (article.seo_description || '').length }}/160</span
                  >
                </p>
                <button
                  class="btn-ink"
                  style="height:26px;padding:0 10px;font-size:11px;"
                  (click)="copy(article.seo_description!)"
                >
                  Copy
                </button>
              </div>
              <div class="ink-content-block">{{ article.seo_description || '—' }}</div>
            </div>
          } @else {
            <div class="empty-state">
              <div style="font-size:32px;opacity:.2;">◑</div>
              <p style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;">
                No SEO content yet
              </p>
            </div>
          }
        }

        <!-- Image Prompt -->
        @if (activeTab() === 3) {
          <!-- Generate Image button — always visible -->
          <input
            type="file"
            #fileUploadInput
            accept="image/*"
            style="display:none;"
            (change)="onImageUpload($event)"
          />
          <div style="display:flex;gap:8px;">
            <button
              class="btn-brand"
              style="flex:1;justify-content:center;gap:6px;"
              [disabled]="generatingImage() || !article.image_prompt"
              [title]="!article.image_prompt ? 'Generate caption first to get an image prompt' : ''"
              (click)="generateImage()"
            >
              @if (generatingImage()) {
                <span class="loading loading-spinner loading-xs"></span>
                Generating… (up to 30s)
              } @else {
                🖼 {{ article.generated_image_url ? 'Regenerate Image' : 'Generate Image' }}
              }
            </button>
            <button
              class="btn-ink"
              style="gap:4px;flex-shrink:0;"
              (click)="fileUploadInput.click()"
            >
              ⬆ Upload
            </button>
            @if (!article.image_prompt) {
              <button
                class="btn-ink"
                style="gap:4px;"
                [disabled]="generating()"
                (click)="generate()"
              >
                @if (generating()) {
                  <span class="loading loading-spinner loading-xs"></span>
                }
                ✦ Generate Prompt First
              </button>
            }
          </div>
          @if (uploadedImageDataUrl()) {
            <div
              style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--ink-standard);"
            >
              <span>✓ Custom image uploaded</span>
              <button
                class="btn-ink"
                style="height:22px;padding:0 8px;font-size:10px;"
                (click)="uploadedImageDataUrl.set(null); compositedDataUrl.set(null)"
              >
                ✕ Remove
              </button>
            </div>
          }

          <!-- Composite & download row — shown once a base image exists -->
          @if (effectiveImageUrl) {
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <button
                class="btn-ink"
                style="gap:6px;flex:1;justify-content:center;"
                [disabled]="compositing()"
                (click)="compositeImage()"
              >
                @if (compositing()) {
                  <span class="loading loading-spinner loading-xs"></span> Compositing…
                } @else {
                  🎨 Composite (watermark + text)
                }
              </button>
              @if (compositedDataUrl()) {
                <a
                  [href]="compositedDataUrl()!"
                  [download]="'post-' + article.id.slice(0, 8) + '.png'"
                  class="btn-ink"
                  style="text-decoration:none;gap:4px;"
                >
                  ⬇ Save PNG
                </a>
              }
            </div>
          }

          <!-- Image preview -->
          @if (effectiveImageUrl) {
            @if (compositedDataUrl()) {
              <div
                style="width:100%;border-radius:8px;overflow:hidden;background:var(--ink-raised);"
              >
                <img
                  [src]="compositedDataUrl()!"
                  style="width:100%;display:block;border-radius:8px;"
                  alt="Composited post image"
                />
              </div>
            } @else {
              <div
                style="width:100%;border-radius:8px;overflow:hidden;background:var(--ink-raised);min-height:280px;position:relative;display:flex;align-items:center;justify-content:center;"
              >
                @if (!imageLoaded() && !imageError() && !uploadedImageDataUrl()) {
                  <div
                    style="display:flex;flex-direction:column;align-items:center;gap:10px;color:var(--ink-text-3);padding:40px;"
                  >
                    <span
                      class="loading loading-spinner"
                      style="width:28px;height:28px;color:var(--ink-brand);"
                    ></span>
                    <span style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;"
                      >Loading image… (up to 60s)</span
                    >
                  </div>
                }
                @if (imageError() && !uploadedImageDataUrl()) {
                  <div
                    style="display:flex;flex-direction:column;align-items:center;gap:8px;color:var(--ink-text-3);padding:40px;text-align:center;"
                  >
                    <span style="font-size:28px;opacity:.3;">▦</span>
                    <span style="font-size:11px;">Image URL expired — click Regenerate Image</span>
                  </div>
                }
                @if (!imageError() || uploadedImageDataUrl()) {
                  <div style="position:relative;width:100%;">
                    <img
                      [src]="effectiveImageUrl"
                      [style.display]="imageLoaded() || uploadedImageDataUrl() ? 'block' : 'none'"
                      style="width:100%;display:block;border-radius:8px;"
                      (load)="imageLoaded.set(true)"
                      (error)="imageError.set(true)"
                    />
                    @if (article.image_headline && (imageLoaded() || uploadedImageDataUrl())) {
                      <div
                        style="position:absolute;top:0;left:0;right:0;padding:18px 14px 48px;background:linear-gradient(rgba(0,0,0,.65) 0%,transparent 100%);text-align:center;border-radius:8px 8px 0 0;"
                      >
                        <span
                          style="font-family:'Anton','Impact',serif;font-size:clamp(16px,5.5vw,26px);color:rgba(255,255,255,.95);letter-spacing:.04em;line-height:1.2;display:block;text-shadow:1px 1px 0 rgba(0,0,0,.8),-1px -1px 0 rgba(0,0,0,.8),1px -1px 0 rgba(0,0,0,.8),-1px 1px 0 rgba(0,0,0,.8);"
                        >
                          {{ article.image_headline }}
                        </span>
                      </div>
                    }
                  </div>
                }
              </div>
            }
            @if (composeError()) {
              <p style="font-size:11px;color:var(--ink-alert);text-align:center;">
                {{ composeError() }}
              </p>
            }
          }

          <!-- Prompt details -->
          @if (article.image_prompt) {
            <div style="border-top:1px solid var(--ink-border);"></div>
            <div style="display:flex;justify-content:flex-end;">
              <button
                class="btn-ink"
                style="height:28px;padding:0 10px;font-size:11px;gap:4px;"
                [disabled]="generating()"
                (click)="generate()"
              >
                @if (generating()) {
                  <span class="loading loading-spinner loading-xs"></span>
                } @else {
                  ↻
                }
                Regenerate Prompt
              </button>
            </div>
            <div>
              <div
                style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;"
              >
                <p class="section-label" style="margin-bottom:0;">
                  Image Headline
                  <span
                    style="font-weight:400;text-transform:none;letter-spacing:normal;color:var(--ink-text-3);"
                    >(max 6 words)</span
                  >
                </p>
                @if (article.image_headline) {
                  <button
                    class="btn-ink"
                    style="height:26px;padding:0 10px;font-size:11px;"
                    (click)="copy(article.image_headline!)"
                  >
                    Copy
                  </button>
                }
              </div>
              <textarea
                class="ink-input"
                rows="2"
                placeholder="Type a short headline (max 6 words)…"
                style="width:100%;resize:vertical;font-size:15px;font-weight:700;letter-spacing:.02em;box-sizing:border-box;"
                [value]="article.image_headline ?? ''"
                (blur)="saveImageField('image_headline', $any($event.target).value)"
              ></textarea>
            </div>
            <div>
              <div
                style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;"
              >
                <p class="section-label" style="margin-bottom:0;">Raw Prompt</p>
                <button
                  class="btn-ink"
                  style="height:26px;padding:0 10px;font-size:11px;"
                  (click)="copy(article.image_prompt!)"
                >
                  Copy
                </button>
              </div>
              <textarea
                class="ink-input"
                style="width:100%;height:15rem;resize:vertical;font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--ink-text-2);box-sizing:border-box;"
                [value]="article.image_prompt ?? ''"
                (blur)="saveImageField('image_prompt', $any($event.target).value)"
              ></textarea>
            </div>
            <div>
              <p class="section-label">
                Formatted Prompt
                <span
                  style="font-weight:400;text-transform:none;letter-spacing:normal;color:var(--ink-text-3);"
                  >(Midjourney / DALL·E)</span
                >
              </p>
              <textarea
                class="ink-input"
                style="width:100%;height:15rem;resize:vertical;font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--ink-text-2);box-sizing:border-box;"
                [value]="article.formatted_image_prompt ?? ''"
                (blur)="saveImageField('formatted_image_prompt', $any($event.target).value)"
              ></textarea>
              <button
                class="btn-brand"
                style="width:100%;margin-top:8px;"
                (click)="copy(article.formatted_image_prompt!)"
              >
                📋 Copy formatted prompt
              </button>
            </div>
          } @else {
            <p
              style="font-size:11px;color:var(--ink-text-3);text-align:center;letter-spacing:.05em;"
            >
              Generate caption first to unlock image generation
            </p>
          }
        }

        <!-- Signals -->
        @if (activeTab() === 4) {
          @if (
            article.content_signals &&
            (article.content_signals.pillar_hint ||
              article.content_signals.best_format ||
              article.content_signals.protagonist_named !== undefined)
          ) {
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              <div
                class="ink-surface"
                style="padding:10px;border-radius:6px;border:1px solid var(--ink-border);"
              >
                <p class="section-label" style="margin-bottom:4px;">Binary Frame</p>
                <span
                  [class]="
                    'ink-badge ' + (article.content_signals!.binary_frame ? 'ib-breaking' : '')
                  "
                  >{{ article.content_signals!.binary_frame ? '✓ Yes' : '— No' }}</span
                >
              </div>
              <div
                class="ink-surface"
                style="padding:10px;border-radius:6px;border:1px solid var(--ink-border);"
              >
                <p class="section-label" style="margin-bottom:4px;">Poll Fit</p>
                <span
                  style="font-size:20px;font-weight:700;font-family:'JetBrains Mono',monospace;color:var(--ink-brand);"
                  >{{ article.content_signals!.poll_fit_score ?? '—'
                  }}<span style="font-size:12px;font-weight:400;color:var(--ink-text-3);"
                    >/5</span
                  ></span
                >
              </div>
              <div
                class="ink-surface"
                style="padding:10px;border-radius:6px;border:1px solid var(--ink-border);"
              >
                <p class="section-label" style="margin-bottom:4px;">Protagonist</p>
                <span style="font-size:13px;font-weight:600;color:var(--ink-text);">{{
                  article.content_signals!.protagonist_named ?? '—'
                }}</span>
              </div>
              <div
                class="ink-surface"
                style="padding:10px;border-radius:6px;border:1px solid var(--ink-border);"
              >
                <p class="section-label" style="margin-bottom:4px;">Best Format</p>
                <span class="ink-badge ib-brand">{{
                  article.content_signals!.best_format ?? '—'
                }}</span>
              </div>
              <div
                class="ink-surface"
                style="padding:10px;border-radius:6px;border:1px solid var(--ink-border);"
              >
                <p class="section-label" style="margin-bottom:4px;">Local Stake First</p>
                <span
                  [class]="
                    'ink-badge ' +
                    (article.content_signals!.fr_it_stake_first_sentence ? 'ib-standard' : '')
                  "
                  >{{
                    article.content_signals!.fr_it_stake_first_sentence ? '✓ Yes' : '— No'
                  }}</span
                >
              </div>
              <div
                class="ink-surface"
                style="padding:10px;border-radius:6px;border:1px solid var(--ink-border);"
              >
                <p class="section-label" style="margin-bottom:4px;">Pillar</p>
                <span
                  style="font-size:11px;font-weight:600;font-family:'JetBrains Mono',monospace;color:var(--ink-text);"
                  >{{ article.content_signals!.pillar_hint ?? '—' }}</span
                >
              </div>
            </div>
            @if ((article.cluster_size ?? 1) >= 2) {
              <div style="border-top:1px solid var(--ink-border);"></div>
              <div>
                <p class="section-label">Cluster</p>
                <div style="display:flex;align-items:center;gap:8px;">
                  <span class="ink-badge ib-alert">🔗 {{ article.cluster_size }} sources</span>
                  <span
                    style="font-size:11px;font-family:'JetBrains Mono',monospace;color:var(--ink-text-3);"
                    >ID: {{ article.cluster_id }}</span
                  >
                </div>
              </div>
            }
          } @else {
            <div class="empty-state">
              <div style="font-size:32px;opacity:.2;">◈</div>
              <p style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;">
                No signals yet — generate content first
              </p>
            </div>
          }
        }

        <!-- Reel -->
        @if (activeTab() === 5) {
          <div>
            <p class="section-label">Status</p>
            @if (article.reel_path) {
              <div style="display:flex;align-items:center;gap:8px;">
                <span class="ink-badge ib-standard">✓ Reel ready</span>
                @if (article.reel_duration) {
                  <span
                    class="ink-badge"
                    style="background:var(--ink-raised);color:var(--ink-text-2);"
                    >{{ article.reel_duration }}s</span
                  >
                }
              </div>
            } @else {
              <span class="ink-badge" style="background:var(--ink-raised);color:var(--ink-text-3);"
                >Not generated</span
              >
            }
          </div>
          <div style="border-top:1px solid var(--ink-border);"></div>
          <div>
            <p class="section-label">Voice</p>
            <span
              style="font-size:13px;font-family:'JetBrains Mono',monospace;color:var(--ink-text);"
            >
              {{
                article.country === 'FR' ? 'ff_siwis (French female)' : 'if_sara (Italian female)'
              }}
            </span>
          </div>
          <div>
            <p class="section-label">Post format</p>
            @if (article.post_format === 'video') {
              <span class="ink-badge ib-brand">video — reel will be used at publish time</span>
            } @else {
              <span class="ink-badge" style="background:var(--ink-raised);color:var(--ink-text-3);"
                >{{ article.post_format ?? 'image' }} — set format to "video" to publish as
                reel</span
              >
            }
          </div>
          <div style="border-top:1px solid var(--ink-border);"></div>
          <div>
            <p class="section-label">Generate reel</p>
            <p style="font-size:12px;color:var(--ink-text-2);margin-bottom:8px;">
              Run this command locally — requires Kokoro TTS + FFmpeg + Whisper + music tracks in
              assets/music/
            </p>
            <div
              style="background:var(--ink-base);border:1px solid var(--ink-border);border-radius:4px;padding:10px 12px;font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--ink-text);word-break:break-all;"
            >
              node src/scripts/generate-reel.js {{ article.id }}
            </div>
          </div>
          @if (article.reel_path) {
            <div>
              <p class="section-label">Local path</p>
              <div
                style="background:var(--ink-base);border:1px solid var(--ink-border);border-radius:4px;padding:8px 12px;font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--ink-text-2);word-break:break-all;"
              >
                {{ article.reel_path }}
              </div>
              <p style="font-size:11px;color:var(--ink-text-3);margin-top:4px;">
                Open in file explorer or VLC to preview. Local path cannot stream through the
                dashboard.
              </p>
            </div>
          }
        }
      </div>

      <!-- ── Inline toast ── -->
      @if (toast()) {
        <div
          style="position:absolute;bottom:80px;left:50%;transform:translateX(-50%);z-index:10;pointer-events:none;"
        >
          <div [class]="'toast-msg ' + (toast()!.ok ? 'toast-ok' : 'toast-err')">
            {{ toast()!.ok ? '✓' : '✗' }} {{ toast()!.msg }}
          </div>
        </div>
      }

      <!-- ── Action footer ── -->
      <div
        style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 16px;border-top:1px solid var(--ink-border);flex-shrink:0;flex-wrap:wrap;"
      >
        <button class="btn-ink" [disabled]="generating()" (click)="generate()">
          @if (generating()) {
            <span class="loading loading-spinner loading-xs"></span>
          }
          ✦ Generate
        </button>
        <div style="display:flex;align-items:center;gap:8px;margin-left:auto;flex-wrap:wrap;">
          <button
            class="btn-brand"
            [disabled]="article.status !== 'pending' || !article.ai_caption || posting()"
            style="background:var(--ink-brand);"
            (click)="postToFacebook()"
          >
            @if (posting()) {
              <span class="loading loading-spinner loading-xs"></span>
            } @else {
              <span>📤</span>
            }
            Post to Facebook
          </button>
          <button
            class="btn-brand"
            [disabled]="article.status === 'posted'"
            (click)="setStatus('posted')"
          >
            ✓ Mark Posted
          </button>
          <button class="btn-ink" (click)="closePanel.emit()">Close</button>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
      }
    `,
  ],
})
export class ArticleDetailComponent implements OnDestroy {
  @Input() article!: Article;
  @Output() closePanel = new EventEmitter<void>();
  @Output() articleUpdated = new EventEmitter<Article>();

  tabs = ['Overview', 'Caption', 'SEO', 'Image', 'Signals', 'Reel'];
  activeTab = signal(0);
  generating = signal(false);
  generatingImage = signal(false);
  imageLoaded = signal(false);
  imageError = signal(false);
  compositing = signal(false);
  compositedDataUrl = signal<string | null>(null);
  composeError = signal<string | null>(null);
  uploadedImageDataUrl = signal<string | null>(null);

  get effectiveImageUrl(): string | null {
    return this.uploadedImageDataUrl() ?? this.article.generated_image_url ?? null;
  }
  posting = signal(false);
  updatingFormat = signal(false);
  toast = signal<{ msg: string; ok: boolean } | null>(null);
  private toastTimer: any;

  readonly FORMATS = ['image', 'video', 'poll', 'carousel'];

  constructor(
    private supabase: SupabaseService,
    @Inject(PLATFORM_ID) private platformId: object,
  ) {}

  ngOnDestroy() {
    clearTimeout(this.toastTimer);
  }

  critBg(level: string): string {
    const bgs: Record<string, string> = {
      breaking: 'linear-gradient(135deg, rgba(255,54,54,.14) 0%, rgba(255,54,54,.04) 100%)',
      alert: 'linear-gradient(135deg, rgba(255,140,0,.13)  0%, rgba(255,140,0,.03)  100%)',
      trending: 'linear-gradient(135deg, rgba(30,122,255,.12) 0%, rgba(30,122,255,.03) 100%)',
      standard: 'linear-gradient(135deg, rgba(0,204,112,.12)  0%, rgba(0,204,112,.03)  100%)',
    };
    return bgs[level] ?? 'transparent';
  }

  critSigClass(level: string): string {
    return `sig sig-${level || 'standard'}`;
  }

  critBadgeClass(level: string): string {
    return (
      (
        {
          breaking: 'ib-breaking',
          alert: 'ib-alert',
          trending: 'ib-trending',
          standard: 'ib-standard',
        } as any
      )[level] ?? ''
    );
  }

  statusBadgeClass(status: string): string {
    return (
      (
        {
          pending: 'ib-pending',
          approved: 'ib-approved',
          rejected: 'ib-rejected',
          posted: 'ib-posted',
          failed: 'ib-failed',
          blocked: 'ib-breaking',
          manual_review: 'ib-alert',
        } as any
      )[status] ?? ''
    );
  }

  formatLabel(value: string): string {
    return (
      ({ image: '🖼 Image', video: '🎬 Video', poll: '📊 Poll', carousel: '🗂 Carousel' } as any)[
        value
      ] ?? value
    );
  }

  tagBadgeClass(tag: string): string {
    return (
      (
        {
          off_target: 'ib-breaking',
          patriotic: 'ib-standard',
          health: 'ib-alert',
          justice: 'ib-brand',
          prices: 'ib-trending',
          region: 'ib-ai',
          sport: 'ib-trending',
          social: 'ib-pending',
        } as any
      )[tag] ?? ''
    );
  }

  tagLabel(tag: string): string {
    return (
      (
        {
          off_target: '⛔ Off-target',
          patriotic: '🏆 Patriotic',
          health: '⚠️ Health',
          justice: '⚖️ Justice',
          prices: '💰 Prices',
          region: '🌍 Region',
          sport: '⚽ Sport',
          social: '👥 Social',
        } as any
      )[tag] ?? tag
    );
  }

  async updatePostFormat(value: string) {
    if (!this.FORMATS.includes(value) || value === this.article.post_format) return;
    const next = value as 'image' | 'video' | 'poll' | 'carousel';
    this.updatingFormat.set(true);
    try {
      await this.supabase.updateArticleFields(this.article.id, { post_format: next });
      this.article = { ...this.article, post_format: next };
      this.articleUpdated.emit(this.article);
      this.showToast(`Format set to ${next}`);
    } catch (err: any) {
      this.showToast(err.message, false);
    } finally {
      this.updatingFormat.set(false);
    }
  }

  showToast(msg: string, ok = true) {
    clearTimeout(this.toastTimer);
    this.toast.set({ msg, ok });
    this.toastTimer = setTimeout(() => this.toast.set(null), 2500);
  }

  async setStatus(status: Article['status']) {
    try {
      await this.supabase.updateArticleStatus(this.article.id, status);
      this.article = { ...this.article, status };
      this.showToast(`Article ${status}`);
      this.articleUpdated.emit(this.article);
    } catch (err: any) {
      this.showToast(err.message, false);
    }
  }

  async postToFacebook() {
    this.posting.set(true);
    try {
      const result = await this.supabase.postToFacebook([this.article.id]);
      const r = result.results[0];
      if (r?.success) {
        this.article = { ...this.article, status: 'posted', fb_post_id: r.fb_post_id ?? null };
        this.articleUpdated.emit(this.article);
        this.showToast('Posted to Facebook ✓');
      } else {
        this.showToast(r?.error ?? 'Post failed', false);
      }
    } catch (err: any) {
      this.showToast(err.message, false);
    } finally {
      this.posting.set(false);
    }
  }

  openUrl(url: string) {
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async saveEditorNotes(value: string) {
    if (value === (this.article.editor_notes ?? '')) return;
    try {
      await this.supabase.updateArticleFields(this.article.id, { editor_notes: value });
      this.article = { ...this.article, editor_notes: value };
    } catch (err: any) {
      this.showToast(err.message, false);
    }
  }

  async saveImageField(
    field: 'image_headline' | 'image_prompt' | 'formatted_image_prompt',
    value: string,
  ) {
    if (value === (this.article as any)[field]) return;
    try {
      await this.supabase.updateArticleFields(this.article.id, { [field]: value });
      this.article = { ...this.article, [field]: value };
      this.articleUpdated.emit(this.article);
    } catch (err: any) {
      this.showToast(err.message, false);
    }
  }

  onImageUpload(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      this.uploadedImageDataUrl.set(e.target!.result as string);
      this.imageLoaded.set(true);
      this.imageError.set(false);
      this.compositedDataUrl.set(null);
      this.composeError.set(null);
    };
    reader.readAsDataURL(file);
    (event.target as HTMLInputElement).value = '';
  }

  async generate() {
    this.generating.set(true);
    try {
      const result = await this.supabase.generateCaptions([this.article.id]);
      if (result.processed === 0) {
        const errMsg = result.errors?.[0]?.error ?? 'Generation failed';
        this.showToast(errMsg, false);
      } else {
        const articles = await this.supabase.getArticles();
        const updated = articles.find((a) => a.id === this.article.id);
        if (updated) {
          this.article = updated;
          this.articleUpdated.emit(this.article);
        }
        this.showToast('Content generated');
      }
    } catch (err: any) {
      this.showToast(err.message, false);
    } finally {
      this.generating.set(false);
    }
  }

  async generateImage() {
    if (!this.article.image_prompt) {
      this.showToast('Generate caption first — no image_prompt yet', false);
      return;
    }
    this.generatingImage.set(true);
    this.uploadedImageDataUrl.set(null);
    this.imageLoaded.set(false);
    this.imageError.set(false);
    this.compositedDataUrl.set(null);
    this.composeError.set(null);
    try {
      const result = await this.supabase.generateImage(this.article.id);
      this.article = { ...this.article, generated_image_url: result.url };
      this.articleUpdated.emit(this.article);
      this.showToast('Image generated ✓');
    } catch (err: any) {
      this.showToast(err.message, false);
    } finally {
      this.generatingImage.set(false);
    }
  }

  async compositeImage() {
    if (!isPlatformBrowser(this.platformId)) return;
    const url = this.effectiveImageUrl;
    if (!url) return;

    this.compositing.set(true);
    this.composeError.set(null);
    try {
      const font = new FontFace('AntonPost', "url('/fonts/Anton-Regular.ttf')");
      await font.load();
      document.fonts.add(font);

      const [baseImg, logoImg] = await Promise.all([
        this.loadImg(url),
        this.loadImg(this.logoPath()).catch(() => null as HTMLImageElement | null),
      ]);

      const TARGET = 1080;
      const w = TARGET;
      const h = TARGET;

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;

      const srcW = baseImg.naturalWidth || TARGET;
      const srcH = baseImg.naturalHeight || TARGET;
      const scale = Math.max(TARGET / srcW, TARGET / srcH);
      const drawW = srcW * scale;
      const drawH = srcH * scale;
      const offsetX = (TARGET - drawW) / 2;
      const offsetY = (TARGET - drawH) / 2;
      ctx.drawImage(baseImg, offsetX, offsetY, drawW, drawH);

      const headline = this.article.image_headline ?? '';
      if (headline) {
        const lines = this.splitHeadline(headline);
        const fontSize = Math.round(w * 0.082);
        const lineHeight = Math.round(fontSize * 1.28);
        const padV = Math.round(fontSize * 0.5);
        const boxH = padV + lines.length * lineHeight + padV;

        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(0, 0, w, boxH);

        ctx.font = `${fontSize}px AntonPost`;
        ctx.textAlign = 'center';
        ctx.lineJoin = 'round';
        ctx.lineWidth = Math.round(fontSize * 0.12);
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.fillStyle = 'white';
        lines.forEach((line, i) => {
          const y = padV + Math.round(fontSize * 0.82) + i * lineHeight;
          ctx.strokeText(line, w / 2, y);
          ctx.fillText(line, w / 2, y);
        });
      }

      if (logoImg) {
        const logoW = Math.round(w * 0.15);
        const logoH = Math.round(logoImg.naturalHeight * (logoW / logoImg.naturalWidth));
        const margin = Math.round(w * 0.02);
        ctx.globalAlpha = 0.7;
        ctx.drawImage(logoImg, w - logoW - margin, h - logoH - margin, logoW, logoH);
        ctx.globalAlpha = 1;
      }

      try {
        this.compositedDataUrl.set(canvas.toDataURL('image/png'));
      } catch {
        this.composeError.set(
          'CORS restriction — image cannot be composited from external URL. Try regenerating the image.',
        );
      }
    } catch (err: any) {
      this.composeError.set(err.message ?? 'Compositing failed');
    } finally {
      this.compositing.set(false);
    }
  }

  private logoPath(): string {
    const map: Record<string, string> = {
      FR: '/logos/FranceAujourdhui_Logo.png',
      IT: '/logos/vivere_in_italia_banner_logo.png',
    };
    return map[this.article.country] ?? `/logos/${this.article.country}_Logo.png`;
  }

  private loadImg(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  private splitHeadline(headline: string): string[] {
    if (headline.length <= 20) return [headline];
    const mid = Math.floor(headline.length / 2);
    let before = -1,
      after = -1;
    for (let i = mid; i >= 0; i--) {
      if (headline[i] === ' ') {
        before = i;
        break;
      }
    }
    for (let i = mid; i < headline.length; i++) {
      if (headline[i] === ' ') {
        after = i;
        break;
      }
    }
    if (before === -1 && after === -1) return [headline];
    const split =
      after !== -1 && (before === -1 || Math.abs(after - mid) <= Math.abs(before - mid))
        ? after
        : before;
    return [headline.slice(0, split), headline.slice(split + 1)];
  }

  copy(text: string) {
    navigator.clipboard.writeText(text).then(() => this.showToast('Copied'));
  }

  copyFullPost() {
    const cap = this.article.ai_caption;
    if (!cap?.intro) return;
    const text = [cap.intro, cap.question, cap.cta].filter(Boolean).join('\n\n');
    this.copy(text);
  }
}
