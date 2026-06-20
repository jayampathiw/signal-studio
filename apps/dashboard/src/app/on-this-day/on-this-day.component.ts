import { Component, OnInit, signal, computed, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { OnThisDayPost, OnThisDayEvent, SupabaseService } from '../core/supabase.service';

@Component({
  selector: 'app-on-this-day',
  standalone: true,
  imports: [DatePipe, RouterLink],
  template: `
    <!-- Navbar -->
    <nav class="ink-navbar" style="display:flex;align-items:center;justify-content:space-between;padding:0 16px;height:52px;">
      <div style="display:flex;align-items:center;gap:10px;">
        <span class="sig sig-breaking" style="width:9px;height:9px;"></span>
        <span style="font-family:'Playfair Display',serif;font-weight:900;font-size:18px;letter-spacing:.06em;color:var(--ink-text);">SIGNAL</span>
        <span class="hidden sm:inline" style="font-size:10px;color:var(--ink-text-3);letter-spacing:.12em;text-transform:uppercase;">Console</span>
        <a routerLink="/articles" style="font-size:11px;font-weight:600;color:var(--ink-text-2);text-decoration:none;padding:3px 8px;border-radius:4px;background:var(--ink-raised);letter-spacing:.05em;">Articles</a>
        <a routerLink="/reels" style="font-size:11px;font-weight:600;color:var(--ink-text-2);text-decoration:none;padding:3px 8px;border-radius:4px;background:var(--ink-raised);letter-spacing:.05em;">▶ Reels</a>
        <a routerLink="/on-this-day" style="font-size:11px;font-weight:600;color:#b47828;text-decoration:none;padding:3px 8px;border-radius:4px;background:rgba(180,120,40,0.12);letter-spacing:.05em;">📅 On This Day</a>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <span class="hidden sm:inline" style="font-size:11px;color:var(--ink-text-3);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{{ userEmail() }}</span>
        <button class="btn-theme" (click)="toggleTheme()" [title]="isDark() ? 'Switch to light' : 'Switch to dark'">{{ isDark() ? '☀' : '🌙' }}</button>
        <button class="btn-ink" style="height:30px;font-size:12px;padding:0 12px;" (click)="signOut()">Sign out</button>
      </div>
    </nav>

    <div style="min-height:calc(100vh - 52px);">
      <div style="max-width:960px;margin:0 auto;padding:16px 12px 64px;">

        <!-- Header -->
        <div style="margin-bottom:20px;">
          <h1 style="font-size:20px;font-weight:700;color:var(--ink-text);margin:0 0 4px;">📅 On This Day</h1>
          <p style="font-size:12px;color:var(--ink-text-3);margin:0;">Multi-photo historical posts for Italy &amp; France — Wikipedia events, AI-selected, AI-written</p>
        </div>

        <!-- Generate panel -->
        <div class="ink-surface" style="border-radius:10px;border:1px solid var(--ink-border);padding:16px;margin-bottom:16px;">
          <p class="section-label" style="margin-bottom:10px;">Generate content</p>
          <div style="display:flex;gap:6px;margin-bottom:12px;">
            @for (c of ['IT','FR']; track c) {
              <button class="country-pill" [class.active]="generateCountry() === c" (click)="generateCountry.set(c)">
                {{ c === 'IT' ? '🇮🇹 Italy' : '🇫🇷 France' }}
              </button>
            }
          </div>
          <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
            @for (m of dateModes; track m.key) {
              <button class="btn-ink" [style]="dateMode()===m.key ? 'background:var(--ink-brand-glow);color:var(--ink-brand);' : ''"
                      style="height:28px;padding:0 12px;font-size:12px;" (click)="dateMode.set(m.key)">{{ m.label }}</button>
            }
          </div>
          @if (dateMode() === 'custom') {
            <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;">
              <input type="date" class="ink-input" style="width:180px;height:32px;font-size:13px;"
                     [value]="customDate()" (change)="customDate.set($any($event.target).value)" />
            </div>
          }
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <button class="btn-brand" style="gap:6px;" [disabled]="generating()" (click)="runGenerate()">
              @if (generating()) { <span class="loading loading-spinner" style="width:14px;height:14px;"></span> Generating… }
              @else { ✦ Generate {{ generateCountry() }} — {{ dateModeLabel() }} }
            </button>
            <span style="font-size:11px;color:var(--ink-text-3);">Content only · add images via CLI afterwards</span>
          </div>
          @if (genResults().length > 0) {
            <div style="margin-top:12px;border-top:1px solid var(--ink-border);padding-top:10px;">
              @for (r of genResults(); track r.date) {
                <div style="display:flex;align-items:center;gap:8px;font-size:12px;padding:3px 0;">
                  <span>{{ r.success ? (r.skipped ? '↩' : '✓') : '✗' }}</span>
                  <span style="font-family:'JetBrains Mono',monospace;color:var(--ink-text-2);">{{ r.date }}</span>
                  @if (r.skipped) { <span style="color:var(--ink-text-3);">already queued</span> }
                  @else if (r.success) { <span style="color:var(--ink-standard);">{{ r.events_count }} events · add images via CLI</span> }
                  @else { <span style="color:#e05050;">{{ r.error }}</span> }
                </div>
              }
              @if (newPostDates().length > 0) {
                <div style="margin-top:8px;padding:8px 10px;background:rgba(180,120,40,0.08);border-radius:6px;font-size:11px;color:#b47828;font-family:'JetBrains Mono',monospace;">
                  node src/scripts/queue-on-this-day.js {{ generateCountry() }} {{ newPostDates().join(' ') }}
                </div>
              }
            </div>
          }
        </div>

        @if (toast()) {
          <div [style]="'margin-bottom:12px;padding:10px 14px;border-radius:6px;font-size:13px;background:' + (toastOk() ? 'rgba(0,200,100,.12)' : 'rgba(220,50,50,.12)') + ';color:' + (toastOk() ? 'var(--ink-standard)' : '#e05050') + ';'">
            {{ toast() }}
          </div>
        }

        <!-- Country filter -->
        <div style="display:flex;gap:6px;margin-bottom:16px;">
          @for (c of ['', 'IT', 'FR']; track c) {
            <button class="country-pill" [class.active]="filterCountry() === c" (click)="filterCountry.set(c)">
              {{ c === '' ? '🌍 All' : c === 'IT' ? '🇮🇹 Italy' : '🇫🇷 France' }}
            </button>
          }
        </div>

        @if (loading()) {
          <div style="text-align:center;padding:40px;color:var(--ink-text-3);">Loading posts…</div>
        } @else if (filtered().length === 0) {
          <div style="text-align:center;padding:60px 20px;color:var(--ink-text-3);">
            <div style="font-size:32px;margin-bottom:12px;">📅</div>
            <div style="font-size:14px;">No posts yet. Use the Generate panel above.</div>
          </div>
        } @else {
          <div style="display:flex;flex-direction:column;gap:12px;">
            @for (post of filtered(); track post.id) {
              <div class="ink-surface" style="border-radius:10px;border:1px solid var(--ink-border);overflow:hidden;">

                <!-- Card header -->
                <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--ink-border);flex-wrap:wrap;gap:8px;">
                  <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                    <span style="font-size:16px;">{{ post.country === 'IT' ? '🇮🇹' : '🇫🇷' }}</span>
                    <div>
                      <div style="font-size:14px;font-weight:600;color:var(--ink-text);">{{ post.title }}</div>
                      <div style="font-size:11px;color:var(--ink-text-3);margin-top:2px;">
                        {{ post.post_date | date:'EEEE, d MMMM yyyy' }} · {{ post.events.length }} events · {{ imageCount(post) }}/{{ post.events.length }} images
                      </div>
                    </div>
                    <span [class]="statusClass(post.status)" style="font-size:10px;padding:2px 8px;border-radius:20px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;">{{ post.status }}</span>
                    @if (imageCount(post) < post.events.length && post.status !== 'posted') {
                      <span style="font-size:10px;color:#b47828;background:rgba(180,120,40,0.1);padding:2px 8px;border-radius:20px;">⚠ images missing</span>
                    }
                  </div>
                  <div style="display:flex;gap:6px;align-items:center;">
                    @if (post.status !== 'posted') {
                      <button class="btn-brand" style="height:28px;padding:0 12px;font-size:12px;" [disabled]="posting() === post.id" (click)="postToFacebook(post)">
                        @if (posting() === post.id) { <span class="loading loading-spinner" style="width:12px;height:12px;"></span> } 📤 Post
                      </button>
                    } @else {
                      <a (click)="openUrl('https://www.facebook.com/' + post.fb_post_id)"
                         style="font-size:12px;color:var(--ink-brand);text-decoration:none;padding:0 8px;height:28px;display:flex;align-items:center;gap:4px;cursor:pointer;">View on FB ↗</a>
                    }
                    <button class="btn-ink" style="height:28px;padding:0 10px;font-size:12px;color:#e05050;" (click)="deletePost(post)">Delete</button>
                  </div>
                </div>

                <!-- Image strip -->
                @if (post.events.length > 0) {
                  <div style="display:flex;gap:4px;padding:10px 12px;overflow-x:auto;" class="scrollbar-none">
                    @for (ev of post.events; track ev.year; let idx = $index) {
                      <div style="flex-shrink:0;width:110px;position:relative;cursor:pointer;"
                           (click)="toggleEvent(post.id, idx)"
                           [title]="'Click to edit image for ' + ev.year">
                        @if (ev.image_url) {
                          <img [src]="compositeResults()[eventKey(post.id, idx)] || ev.image_url"
                               alt="{{ ev.title }}"
                               style="width:110px;height:110px;object-fit:cover;border-radius:6px;display:block;"
                               [style.outline]="activeKey() === eventKey(post.id, idx) ? '2px solid var(--ink-brand)' : 'none'" />
                        } @else {
                          <div [style.outline]="activeKey() === eventKey(post.id, idx) ? '2px solid var(--ink-brand)' : 'none'"
                               style="width:110px;height:110px;border-radius:6px;background:var(--ink-raised);border:1px dashed var(--ink-border);display:flex;align-items:center;justify-content:center;color:var(--ink-text-3);font-size:10px;text-align:center;padding:6px;box-sizing:border-box;">
                            No image<br/>click to upload
                          </div>
                        }
                        <!-- Download overlay -->
                        @if (ev.image_url) {
                          <a [href]="ev.image_url" [download]="ev.year + '-' + post.country + '.png'" target="_blank"
                             style="position:absolute;top:4px;right:4px;width:22px;height:22px;border-radius:4px;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;text-decoration:none;"
                             (click)="$event.stopPropagation()" title="Download">⬇</a>
                        }
                        <div style="position:absolute;bottom:0;left:0;right:0;background:linear-gradient(transparent,rgba(0,0,0,.75));border-radius:0 0 6px 6px;padding:4px 5px;">
                          <div style="font-size:10px;font-weight:700;color:#fff;line-height:1.2;">{{ ev.year }}</div>
                        </div>
                      </div>
                    }
                  </div>
                }

                <!-- Per-event edit panel -->
                @for (ev of post.events; track ev.year; let idx = $index) {
                  @if (activeKey() === eventKey(post.id, idx)) {
                    <div style="margin:0 12px 12px;border:1px solid var(--ink-border);border-radius:8px;overflow:hidden;background:var(--ink-raised);">

                      <!-- Panel header -->
                      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid var(--ink-border);">
                        <span style="font-size:13px;font-weight:600;color:var(--ink-text);">🏛 {{ ev.year }} — {{ ev.title }}</span>
                        <button class="btn-ink" style="height:24px;padding:0 8px;font-size:11px;" (click)="activeKey.set(null)">✕ Close</button>
                      </div>

                      <div style="display:flex;gap:0;flex-wrap:wrap;">
                        <!-- Left: image preview -->
                        <div style="flex:0 0 280px;padding:12px;border-right:1px solid var(--ink-border);">
                          @if (compositeResults()[eventKey(post.id, idx)]) {
                            <img [src]="compositeResults()[eventKey(post.id, idx)]"
                                 style="width:100%;border-radius:6px;display:block;aspect-ratio:1;" alt="Composited" />
                            <div style="display:flex;gap:6px;margin-top:8px;">
                              <a [href]="compositeResults()[eventKey(post.id, idx)]"
                                 [download]="ev.year + '-' + post.country + '-composited.png'"
                                 class="btn-ink" style="height:28px;padding:0 10px;font-size:11px;flex:1;justify-content:center;display:flex;align-items:center;text-decoration:none;">
                                ⬇ Download
                              </a>
                              <button class="btn-brand" style="height:28px;padding:0 10px;font-size:11px;flex:1;"
                                      [disabled]="saving() === eventKey(post.id, idx)"
                                      (click)="saveToDb(post, idx)">
                                @if (saving() === eventKey(post.id, idx)) { <span class="loading loading-spinner" style="width:11px;height:11px;"></span> }
                                @else { 💾 Save to DB }
                              </button>
                            </div>
                          } @else if (uploadedImages()[eventKey(post.id, idx)]) {
                            <img [src]="uploadedImages()[eventKey(post.id, idx)]"
                                 style="width:100%;border-radius:6px;display:block;aspect-ratio:1;object-fit:cover;" alt="Uploaded" />
                            <div style="display:flex;gap:6px;margin-top:8px;">
                              <button class="btn-ink" style="height:28px;padding:0 10px;font-size:11px;flex:1;"
                                      [disabled]="compositing() === eventKey(post.id, idx)"
                                      (click)="compositeEvent(post, idx)">
                                @if (compositing() === eventKey(post.id, idx)) { <span class="loading loading-spinner" style="width:11px;height:11px;"></span> }
                                @else { 🎨 Add watermark }
                              </button>
                              <button class="btn-brand" style="height:28px;padding:0 10px;font-size:11px;flex:1;"
                                      [disabled]="saving() === eventKey(post.id, idx)"
                                      (click)="saveToDb(post, idx)">
                                @if (saving() === eventKey(post.id, idx)) { <span class="loading loading-spinner" style="width:11px;height:11px;"></span> }
                                @else { 💾 Save to DB }
                              </button>
                            </div>
                          } @else if (ev.image_url) {
                            <img [src]="ev.image_url"
                                 style="width:100%;border-radius:6px;display:block;aspect-ratio:1;object-fit:cover;" alt="{{ ev.title }}" />
                            <div style="display:flex;gap:6px;margin-top:8px;">
                              <button class="btn-ink" style="height:28px;padding:0 10px;font-size:11px;flex:1;"
                                      [disabled]="compositing() === eventKey(post.id, idx)"
                                      (click)="compositeEvent(post, idx)">
                                @if (compositing() === eventKey(post.id, idx)) { <span class="loading loading-spinner" style="width:11px;height:11px;"></span> Compositing… }
                                @else { 🎨 Add watermark }
                              </button>
                            </div>
                          } @else {
                            <div style="width:100%;aspect-ratio:1;border-radius:6px;background:var(--ink-surface);border:2px dashed var(--ink-border);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:var(--ink-text-3);">
                              <span style="font-size:28px;">🖼</span>
                              <span style="font-size:12px;">No image yet</span>
                            </div>
                          }

                          <!-- Compose error -->
                          @if (composeErrors()[eventKey(post.id, idx)]) {
                            <div style="margin-top:6px;font-size:11px;color:#e05050;">{{ composeErrors()[eventKey(post.id, idx)] }}</div>
                          }

                          <!-- Upload button -->
                          <label style="margin-top:8px;display:flex;align-items:center;justify-content:center;gap:6px;height:28px;border-radius:6px;border:1px solid var(--ink-border);font-size:11px;color:var(--ink-text-2);cursor:pointer;background:var(--ink-surface);">
                            📁 Upload custom image
                            <input type="file" accept="image/*" style="display:none;" (change)="onUpload($event, post.id, idx)" />
                          </label>
                          @if (uploadedImages()[eventKey(post.id, idx)]) {
                            <button class="btn-ink" style="width:100%;margin-top:4px;height:24px;font-size:10px;color:var(--ink-text-3);"
                                    (click)="clearUpload(post.id, idx)">✕ Remove upload</button>
                          }
                        </div>

                        <!-- Right: image prompt -->
                        <div style="flex:1;min-width:200px;padding:12px;">
                          <p class="section-label" style="margin-bottom:6px;">Image prompt</p>
                          <div style="position:relative;">
                            <textarea rows="6" readonly
                                      style="width:100%;box-sizing:border-box;font-size:11px;font-family:'JetBrains Mono',monospace;line-height:1.5;resize:vertical;padding:8px;border-radius:6px;border:1px solid var(--ink-border);background:var(--ink-surface);color:var(--ink-text-2);">{{ ev.image_prompt }}</textarea>
                            <button class="btn-ink" style="position:absolute;top:6px;right:6px;height:22px;padding:0 8px;font-size:10px;"
                                    (click)="copyText(ev.image_prompt)">Copy</button>
                          </div>
                          <p style="font-size:10px;color:var(--ink-text-3);margin-top:4px;">Paste into Midjourney / DALL-E / Flux. Then upload the result above.</p>
                        </div>
                      </div>

                    </div>
                  }
                }

                <!-- Events list -->
                <div style="padding:0 16px 12px;">
                  @for (ev of post.events; track ev.year; let idx = $index) {
                    <div style="padding:7px 0;border-top:1px solid var(--ink-border);display:flex;gap:10px;align-items:flex-start;">
                      <span style="font-size:11px;font-weight:700;color:#b47828;min-width:40px;padding-top:1px;">{{ ev.year }}</span>
                      <div style="flex:1;min-width:0;">
                        <div style="font-size:13px;font-weight:600;color:var(--ink-text);">{{ ev.title }}</div>
                        <div style="font-size:12px;color:var(--ink-text-2);margin-top:2px;line-height:1.5;">{{ ev.summary }}</div>
                      </div>
                      <button class="btn-ink" style="height:24px;padding:0 8px;font-size:10px;flex-shrink:0;"
                              (click)="toggleEvent(post.id, idx)">
                        {{ activeKey() === eventKey(post.id, idx) ? '✕' : '🖼 Edit image' }}
                      </button>
                    </div>
                  }
                </div>

                <!-- Caption + actions -->
                @if (post.ai_caption?.intro) {
                  <div style="margin:0 16px 12px;">
                    <div style="display:flex;gap:6px;margin-bottom:6px;flex-wrap:wrap;">
                      <button class="btn-ink" style="height:26px;padding:0 10px;font-size:11px;" (click)="copyCaption(post)">
                        {{ copied() === post.id ? '✓ Copied' : '⎘ Copy caption' }}
                      </button>
                      @if (imageCount(post) > 0) {
                        <button class="btn-ink" style="height:26px;padding:0 10px;font-size:11px;" (click)="downloadAll(post)">
                          ⬇ Download all images ({{ imageCount(post) }})
                        </button>
                      }
                    </div>
                    <div style="padding:10px 12px;background:var(--ink-raised);border-radius:6px;font-size:12px;color:var(--ink-text-2);white-space:pre-wrap;max-height:160px;overflow-y:auto;line-height:1.6;">{{ fullCaption(post) }}</div>
                  </div>
                }

                <!-- CLI hint for missing images -->
                @if (imageCount(post) < post.events.length && post.status !== 'posted') {
                  <div style="margin:0 16px 12px;padding:8px 10px;background:rgba(180,120,40,0.08);border-radius:6px;font-size:11px;color:#b47828;font-family:'JetBrains Mono',monospace;">
                    node src/scripts/queue-on-this-day.js {{ post.country }} {{ post.post_date }}
                  </div>
                }

              </div>
            }
          </div>
        }
      </div>
    </div>
  `,
  styles: [`:host { display: flex; flex-direction: column; min-height: 100vh; }`],
})
export class OnThisDayComponent implements OnInit {
  posts      = signal<OnThisDayPost[]>([]);
  loading    = signal(true);
  generating = signal(false);
  posting    = signal<string | null>(null);
  copied     = signal<string | null>(null);
  toast      = signal<string | null>(null);
  toastOk    = signal(true);

  filterCountry   = signal('');
  generateCountry = signal('IT');
  dateMode        = signal<string>('today');
  customDate      = signal(new Date().toISOString().slice(0, 10));
  genResults      = signal<any[]>([]);

  // Per-event image editing state
  activeKey       = signal<string | null>(null);
  uploadedImages  = signal<Record<string, string>>({});
  compositeResults = signal<Record<string, string>>({});
  composeErrors   = signal<Record<string, string>>({});
  compositing     = signal<string | null>(null);
  saving          = signal<string | null>(null);

  readonly dateModes = [
    { key: 'today',  label: 'Today' },
    { key: 'next7',  label: 'Next 7 days' },
    { key: 'next30', label: 'Next 30 days' },
    { key: 'custom', label: 'Custom date' },
  ];

  filtered = computed(() => {
    const c = this.filterCountry();
    return c ? this.posts().filter(p => p.country === c) : this.posts();
  });

  dateModeLabel = computed(() => {
    const m = this.dateModes.find(x => x.key === this.dateMode());
    return this.dateMode() === 'custom' ? this.customDate() : (m?.label ?? 'today');
  });

  newPostDates = computed(() =>
    this.genResults().filter(r => r.success && !r.skipped).map(r => r.date),
  );

  isDark    = signal(typeof document !== 'undefined' ? document.documentElement.getAttribute('data-theme') !== 'light' : true);
  userEmail = signal('');

  constructor(
    private router: Router,
    private svc: SupabaseService,
    @Inject(PLATFORM_ID) private platformId: object,
  ) {}

  async ngOnInit() {
    const session = await this.svc.getSession();
    this.userEmail.set(session?.user?.email ?? '');
    await this.reload();
  }

  async reload() {
    this.loading.set(true);
    try {
      this.posts.set(await this.svc.getOnThisDayPosts());
    } catch (err: any) {
      this.showToast(err.message, false);
    } finally {
      this.loading.set(false);
    }
  }

  buildDates(): string[] {
    switch (this.dateMode()) {
      case 'today':  return [new Date().toISOString().slice(0, 10)];
      case 'next7':  return Array.from({ length: 7 },  (_, i) => this.offsetDate(i));
      case 'next30': return Array.from({ length: 30 }, (_, i) => this.offsetDate(i));
      case 'custom': return [this.customDate()];
      default:       return [new Date().toISOString().slice(0, 10)];
    }
  }

  private offsetDate(days: number): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  async runGenerate() {
    this.generating.set(true);
    this.genResults.set([]);
    try {
      const res = await this.svc.queueOnThisDay(this.generateCountry(), this.buildDates());
      this.genResults.set(res.results);
      const ok = res.results.filter(r => r.success && !r.skipped).length;
      const skipped = res.results.filter(r => r.skipped).length;
      this.showToast(`${ok} queued, ${skipped} skipped.`, ok > 0 || skipped > 0);
      await this.reload();
    } catch (err: any) {
      this.showToast(err.message, false);
    } finally {
      this.generating.set(false);
    }
  }

  async postToFacebook(post: OnThisDayPost) {
    this.posting.set(post.id);
    try {
      await this.svc.postOnThisDay(post.id);
      this.showToast('Posted to Facebook!', true);
      await this.reload();
    } catch (err: any) {
      this.showToast(err.message, false);
    } finally {
      this.posting.set(null);
    }
  }

  async deletePost(post: OnThisDayPost) {
    if (!confirm(`Delete "${post.title}"?`)) return;
    try {
      await this.svc.deleteOnThisDayPost(post.id);
      this.posts.update(list => list.filter(p => p.id !== post.id));
    } catch (err: any) {
      this.showToast(err.message, false);
    }
  }

  // ─── Per-event image editing ──────────────────────────────────────────────

  eventKey(postId: string, idx: number): string {
    return `${postId}-${idx}`;
  }

  toggleEvent(postId: string, idx: number) {
    const k = this.eventKey(postId, idx);
    this.activeKey.set(this.activeKey() === k ? null : k);
  }

  onUpload(event: Event, postId: string, idx: number) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const key = this.eventKey(postId, idx);
    const reader = new FileReader();
    reader.onload = e => {
      this.uploadedImages.update(m => ({ ...m, [key]: e.target!.result as string }));
      this.compositeResults.update(m => { const n = { ...m }; delete n[key]; return n; });
      this.composeErrors.update(m => { const n = { ...m }; delete n[key]; return n; });
    };
    reader.readAsDataURL(file);
    (event.target as HTMLInputElement).value = '';
  }

  clearUpload(postId: string, idx: number) {
    const key = this.eventKey(postId, idx);
    this.uploadedImages.update(m => { const n = { ...m }; delete n[key]; return n; });
    this.compositeResults.update(m => { const n = { ...m }; delete n[key]; return n; });
  }

  async compositeEvent(post: OnThisDayPost, idx: number) {
    if (!isPlatformBrowser(this.platformId)) return;
    const key = this.eventKey(post.id, idx);
    const ev  = post.events[idx];
    const baseUrl = this.uploadedImages()[key] || ev.image_url;
    if (!baseUrl) return;

    this.compositing.set(key);
    this.composeErrors.update(m => { const n = { ...m }; delete n[key]; return n; });
    try {
      const font = new FontFace('AntonPost', "url('/fonts/Anton-Regular.ttf')");
      await font.load();
      document.fonts.add(font);

      const logoPath = post.country === 'IT'
        ? '/logos/vivere_in_italia_banner_logo.png'
        : '/logos/FranceAujourdhui_Logo.png';

      const [baseImg, logoImg] = await Promise.all([
        this.loadImg(baseUrl),
        this.loadImg(logoPath).catch(() => null as HTMLImageElement | null),
      ]);

      const TARGET = 1080;
      const canvas = document.createElement('canvas');
      canvas.width = TARGET;
      canvas.height = TARGET;
      const ctx = canvas.getContext('2d')!;

      const srcW = baseImg.naturalWidth || TARGET;
      const srcH = baseImg.naturalHeight || TARGET;
      const scale = Math.max(TARGET / srcW, TARGET / srcH);
      const drawW = srcW * scale;
      const drawH = srcH * scale;
      ctx.drawImage(baseImg, (TARGET - drawW) / 2, (TARGET - drawH) / 2, drawW, drawH);

      if (logoImg) {
        const logoW  = Math.round(TARGET * 0.15);
        const logoH  = Math.round(logoImg.naturalHeight * (logoW / logoImg.naturalWidth));
        const margin = Math.round(TARGET * 0.02);
        ctx.globalAlpha = 0.7;
        ctx.drawImage(logoImg, TARGET - logoW - margin, TARGET - logoH - margin, logoW, logoH);
        ctx.globalAlpha = 1;
      }

      try {
        this.compositeResults.update(m => ({ ...m, [key]: canvas.toDataURL('image/png') }));
      } catch {
        this.composeErrors.update(m => ({ ...m, [key]: 'CORS restriction — try uploading the image manually instead.' }));
      }
    } catch (err: any) {
      this.composeErrors.update(m => ({ ...m, [key]: err.message ?? 'Compositing failed' }));
    } finally {
      this.compositing.set(null);
    }
  }

  async saveToDb(post: OnThisDayPost, idx: number) {
    const key = this.eventKey(post.id, idx);
    const dataUrl = this.compositeResults()[key] || this.uploadedImages()[key];
    if (!dataUrl) return;

    this.saving.set(key);
    try {
      const newUrl = await this.svc.uploadOnThisDayEventImage(post.id, idx, dataUrl);
      const updatedEvents = post.events.map((ev, i) =>
        i === idx ? { ...ev, image_url: newUrl } : ev,
      );
      await this.svc.updateOnThisDayEvents(post.id, updatedEvents);
      this.showToast('Image saved ✓', true);
      this.compositeResults.update(m => { const n = { ...m }; delete n[key]; return n; });
      this.uploadedImages.update(m => { const n = { ...m }; delete n[key]; return n; });
      this.activeKey.set(null);
      await this.reload();
    } catch (err: any) {
      this.showToast(err.message, false);
    } finally {
      this.saving.set(null);
    }
  }

  // ─── Caption helpers ──────────────────────────────────────────────────────

  fullCaption(post: OnThisDayPost): string {
    const c = post.ai_caption;
    if (!c) return '';
    return [c['intro'], c['question'], c['cta']].filter(Boolean).join('\n\n');
  }

  async copyCaption(post: OnThisDayPost) {
    try {
      await navigator.clipboard.writeText(this.fullCaption(post));
      this.copied.set(post.id);
      setTimeout(() => this.copied.set(null), 2500);
    } catch {
      this.showToast('Could not copy — select the text manually', false);
    }
  }

  async copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      this.showToast('Copied ✓', true);
    } catch {
      this.showToast('Copy failed', false);
    }
  }

  async downloadAll(post: OnThisDayPost) {
    const events = post.events.filter(e => e.image_url);
    for (const ev of events) {
      try {
        const res = await fetch(ev.image_url!);
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = `${post.post_date}-${post.country}-${ev.year}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(objectUrl);
      } catch {
        window.open(ev.image_url!, '_blank', 'noopener,noreferrer');
      }
      await new Promise(r => setTimeout(r, 300));
    }
  }

  imageCount(post: OnThisDayPost) {
    return post.events.filter(e => e.image_url).length;
  }

  openUrl(url: string) {
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  statusClass(status: string) {
    if (status === 'posted') return 'ink-badge ib-standard';
    if (status === 'failed') return 'ink-badge ib-breaking';
    return 'ink-badge ib-ai';
  }

  toggleTheme() {
    const next = this.isDark() ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    this.isDark.set(!this.isDark());
  }

  async signOut() {
    await this.svc.signOut();
    this.router.navigate(['/login']);
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

  private showToast(msg: string, ok = true) {
    this.toast.set(msg);
    this.toastOk.set(ok);
    setTimeout(() => this.toast.set(null), 6000);
  }
}
