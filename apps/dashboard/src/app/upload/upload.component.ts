import { Component, signal, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AnalyzedArticle, SupabaseService } from '../core/supabase.service';

interface EditableArticle {
  title: string;
  url: string;
  summary: string;
  source: string;
  suggested_angle: string;
  editor_notes: string;
}

@Component({
  selector: 'app-upload',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div style="min-height:100vh;background:var(--ink-bg);font-family:'Outfit',sans-serif;">

      <!-- Navbar -->
      <nav class="ink-navbar" style="display:flex;align-items:center;justify-content:space-between;padding:0 16px;height:52px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <span class="sig sig-breaking" style="width:9px;height:9px;"></span>
          <span style="font-family:'Playfair Display',serif;font-weight:900;font-size:18px;letter-spacing:.06em;color:var(--ink-text);">SIGNAL</span>
          <span style="font-size:10px;color:var(--ink-text-3);letter-spacing:.12em;text-transform:uppercase;">Upload</span>
        </div>
        <a routerLink="/articles" class="btn-ink" style="height:30px;font-size:12px;padding:0 12px;text-decoration:none;">← Articles</a>
      </nav>

      <div style="max-width:760px;margin:0 auto;padding:24px 16px 64px;">

        <!-- ── Step 1: Input ── -->
        @if (step() === 1) {
          <div style="margin-bottom:24px;">
            <h1 style="font-size:20px;font-weight:700;color:var(--ink-text);margin-bottom:4px;">Upload Research</h1>
            <p style="font-size:13px;color:var(--ink-text-2);line-height:1.5;">Paste URLs, article excerpts, tweet threads, CSV rows, or any research notes. Claude will extract and analyse each article.</p>
          </div>

          <!-- Country selector -->
          <div style="margin-bottom:16px;">
            <p class="section-label">Target country</p>
            <div style="display:flex;gap:8px;">
              @for (c of countries; track c.code) {
                <button
                  [style.background]="selectedCountry() === c.code ? 'var(--ink-brand)' : 'var(--ink-raised)'"
                  [style.color]="selectedCountry() === c.code ? '#fff' : 'var(--ink-text-2)'"
                  style="height:36px;padding:0 16px;border-radius:6px;border:1px solid var(--ink-border);font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;"
                  (click)="selectedCountry.set(c.code)">
                  {{ c.flag }} {{ c.label }}
                </button>
              }
            </div>
          </div>

          <!-- Text area -->
          <div style="margin-bottom:12px;">
            <p class="section-label">Paste your research</p>
            <textarea class="ink-input"
              style="width:100%;height:260px;resize:vertical;font-size:13px;box-sizing:border-box;line-height:1.6;"
              placeholder="Paste article URLs (one per line), excerpts, tweet threads, CSV rows, Markdown notes… Claude will extract and analyse each article automatically."
              [value]="rawText()"
              (input)="rawText.set($any($event.target).value)"></textarea>
          </div>

          <!-- File upload -->
          <input type="file" #fileInput accept=".csv,.md,.txt,.json,.text" style="display:none;" (change)="onFileUpload($event)" />
          <div style="display:flex;gap:8px;margin-bottom:24px;">
            <button class="btn-ink" style="gap:4px;font-size:12px;" (click)="fileInput.click()">
              📂 Upload file (CSV, MD, TXT)
            </button>
            @if (fileName()) {
              <span style="font-size:11px;color:var(--ink-standard);align-self:center;">✓ {{ fileName() }}</span>
            }
          </div>

          @if (error()) {
            <p style="font-size:12px;color:var(--ink-breaking);margin-bottom:12px;">{{ error() }}</p>
          }

          <button class="btn-brand" style="width:100%;justify-content:center;height:44px;font-size:14px;font-weight:700;"
                  [disabled]="!rawText().trim()"
                  (click)="analyze()">
            ✦ Analyse with Claude
          </button>
        }

        <!-- ── Step 2: Analyzing ── -->
        @if (step() === 2) {
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:320px;gap:20px;">
            <span class="loading loading-spinner" style="width:36px;height:36px;color:var(--ink-brand);"></span>
            <div style="text-align:center;">
              <p style="font-size:15px;font-weight:600;color:var(--ink-text);margin-bottom:4px;">Analysing with Claude…</p>
              <p style="font-size:12px;color:var(--ink-text-3);">Extracting articles and running policy checks</p>
            </div>
          </div>
        }

        <!-- ── Step 3: Review cards ── -->
        @if (step() === 3) {
          <div style="margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
            <div>
              <h1 style="font-size:18px;font-weight:700;color:var(--ink-text);margin-bottom:2px;">
                {{ analyzedArticles().length }} article{{ analyzedArticles().length !== 1 ? 's' : '' }} found
              </h1>
              <p style="font-size:12px;color:var(--ink-text-3);">Review, edit, and approve each article before saving to the pipeline.</p>
            </div>
            <div style="display:flex;gap:8px;align-items:center;">
              <span style="font-size:12px;color:var(--ink-text-3);">{{ savedCount() }} saved · {{ skippedCount() }} skipped</span>
              @if (allActioned()) {
                <a routerLink="/articles" class="btn-brand" style="text-decoration:none;height:32px;padding:0 14px;font-size:12px;">
                  View in Articles →
                </a>
              }
            </div>
          </div>

          @for (article of analyzedArticles(); track $index; let i = $index) {
            <div [style.opacity]="savedIndices().has(i) || skippedIndices().has(i) ? '.45' : '1'"
                 style="background:var(--ink-surface);border:1px solid var(--ink-border);border-radius:10px;margin-bottom:16px;overflow:hidden;">

              <!-- Card header -->
              <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid var(--ink-border);background:var(--ink-raised);">
                <div style="display:flex;align-items:center;gap:8px;">
                  <span style="font-size:11px;color:var(--ink-text-3);font-weight:600;letter-spacing:.06em;">#{{ i + 1 }}</span>
                  <span [class]="'ink-badge ' + critBadgeClass(article.criticality)">{{ article.criticality }}</span>
                  <span class="ink-badge" style="background:var(--ink-raised);color:var(--ink-text-2);">{{ selectedCountry() }}</span>
                  @for (tag of article.tags.slice(0, 3); track tag) {
                    <span class="ink-badge" style="font-size:9px;">{{ tag }}</span>
                  }
                </div>
                @if (savedIndices().has(i)) {
                  <span style="font-size:11px;color:var(--ink-standard);font-weight:600;">✓ Saved</span>
                } @else if (skippedIndices().has(i)) {
                  <span style="font-size:11px;color:var(--ink-text-3);font-weight:600;">✕ Skipped</span>
                }
              </div>

              <!-- Card body -->
              <div style="padding:14px;display:flex;flex-direction:column;gap:12px;">

                <!-- Policy flags -->
                @if (article.policy_flags.length > 0) {
                  <div style="background:rgba(255,54,54,.08);border:1px solid rgba(255,54,54,.25);border-radius:6px;padding:10px 12px;">
                    <p style="font-size:11px;font-weight:700;color:var(--ink-breaking);letter-spacing:.06em;text-transform:uppercase;margin-bottom:6px;">⚠️ Policy flags</p>
                    @for (flag of article.policy_flags; track flag) {
                      <p style="font-size:12px;color:var(--ink-breaking);margin-bottom:2px;">• {{ flag }}</p>
                    }
                  </div>
                }

                <!-- Title -->
                <div>
                  <p class="section-label" style="margin-bottom:4px;">Title</p>
                  <input class="ink-input" type="text" style="width:100%;box-sizing:border-box;font-size:14px;font-weight:600;"
                         [value]="editedData[i].title"
                         (input)="editedData[i].title = $any($event.target).value" />
                </div>

                <!-- URL + Source row -->
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                  <div>
                    <p class="section-label" style="margin-bottom:4px;">URL</p>
                    <input class="ink-input" type="text" style="width:100%;box-sizing:border-box;font-size:11px;font-family:'JetBrains Mono',monospace;"
                           [value]="editedData[i].url"
                           (input)="editedData[i].url = $any($event.target).value" />
                  </div>
                  <div>
                    <p class="section-label" style="margin-bottom:4px;">Source</p>
                    <input class="ink-input" type="text" style="width:100%;box-sizing:border-box;font-size:13px;"
                           [value]="editedData[i].source"
                           (input)="editedData[i].source = $any($event.target).value" />
                  </div>
                </div>

                <!-- Summary -->
                <div>
                  <p class="section-label" style="margin-bottom:4px;">Summary</p>
                  <textarea class="ink-input" rows="4" style="width:100%;resize:vertical;font-size:13px;box-sizing:border-box;line-height:1.55;"
                            [value]="editedData[i].summary"
                            (input)="editedData[i].summary = $any($event.target).value"></textarea>
                </div>

                <!-- Suggested angle (only when flagged) -->
                @if (article.policy_flags.length > 0) {
                  <div>
                    <p class="section-label" style="margin-bottom:4px;">💡 Suggested safe angle <span style="font-weight:400;text-transform:none;letter-spacing:normal;">(editable)</span></p>
                    <textarea class="ink-input" rows="3" style="width:100%;resize:vertical;font-size:13px;box-sizing:border-box;line-height:1.55;border-color:rgba(255,140,0,.4);"
                              [value]="editedData[i].suggested_angle"
                              (input)="editedData[i].suggested_angle = $any($event.target).value"></textarea>
                  </div>
                }

                <!-- Editor notes -->
                <div>
                  <p class="section-label" style="margin-bottom:4px;">📝 Editor notes</p>
                  <textarea class="ink-input" rows="2" style="width:100%;resize:vertical;font-size:12px;box-sizing:border-box;"
                            placeholder="Add research context, angle decisions, posting notes…"
                            [value]="editedData[i].editor_notes"
                            (input)="editedData[i].editor_notes = $any($event.target).value"></textarea>
                </div>

                <!-- Actions -->
                @if (!savedIndices().has(i) && !skippedIndices().has(i)) {
                  <div style="display:flex;gap:8px;padding-top:4px;border-top:1px solid var(--ink-border);">
                    <button class="btn-brand" style="flex:1;justify-content:center;gap:5px;"
                            [disabled]="savingIndex() === i"
                            (click)="saveArticle(i)">
                      @if (savingIndex() === i) {
                        <span class="loading loading-spinner loading-xs"></span> Saving…
                      } @else {
                        ✓ Save as Pending
                      }
                    </button>
                    <button class="btn-ink" style="gap:4px;" (click)="skipArticle(i)">
                      ✕ Skip
                    </button>
                  </div>
                }

              </div>
            </div>
          }

          <!-- Completion banner -->
          @if (allActioned() && analyzedArticles().length > 0) {
            <div style="background:var(--ink-surface);border:1px solid var(--ink-border);border-radius:10px;padding:20px;text-align:center;margin-top:8px;">
              <p style="font-size:16px;font-weight:700;color:var(--ink-text);margin-bottom:6px;">
                {{ savedCount() }} of {{ analyzedArticles().length }} articles saved to pending
              </p>
              <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
                <a routerLink="/articles" class="btn-brand" style="text-decoration:none;">View in Articles →</a>
                <button class="btn-ink" (click)="reset()">Upload more</button>
              </div>
            </div>
          }
        }

      </div>
    </div>
  `,
})
export class UploadComponent {
  private supabase = inject(SupabaseService);

  countries = [
    { code: 'IT', flag: '🇮🇹', label: 'IT' },
    { code: 'FR', flag: '🇫🇷', label: 'FR' },
  ];

  step             = signal<1 | 2 | 3>(1);
  rawText          = signal('');
  fileName         = signal('');
  selectedCountry  = signal('IT');
  analyzing        = signal(false);
  analyzedArticles = signal<AnalyzedArticle[]>([]);
  savedIndices     = signal<Set<number>>(new Set());
  skippedIndices   = signal<Set<number>>(new Set());
  savingIndex      = signal<number | null>(null);
  error            = signal<string | null>(null);

  editedData: EditableArticle[] = [];

  savedCount()  { return this.savedIndices().size; }
  skippedCount() { return this.skippedIndices().size; }
  allActioned() {
    const total = this.analyzedArticles().length;
    return total > 0 && (this.savedIndices().size + this.skippedIndices().size) >= total;
  }

  onFileUpload(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.fileName.set(file.name);
    const reader = new FileReader();
    reader.onload = (e) => this.rawText.set(e.target!.result as string);
    reader.readAsText(file);
    (event.target as HTMLInputElement).value = '';
  }

  async analyze() {
    const text = this.rawText().trim();
    if (!text) return;
    this.error.set(null);
    this.step.set(2);
    try {
      const result = await this.supabase.analyzeUpload(text, this.selectedCountry());
      const articles = result.articles ?? [];
      this.analyzedArticles.set(articles);
      this.editedData = articles.map(a => ({
        title:           a.title,
        url:             a.url,
        summary:         a.summary,
        source:          a.source,
        suggested_angle: a.suggested_angle ?? '',
        editor_notes:    '',
      }));
      this.savedIndices.set(new Set());
      this.skippedIndices.set(new Set());
      this.step.set(3);
    } catch (err: any) {
      this.error.set(err.message ?? 'Analysis failed');
      this.step.set(1);
    }
  }

  async saveArticle(i: number) {
    this.savingIndex.set(i);
    try {
      const ai = this.analyzedArticles()[i];
      const ed = this.editedData[i];
      await this.supabase.insertArticle({
        title:          ed.title || ai.title,
        url:            ed.url   || ai.url,
        summary:        ed.summary || ai.summary,
        source:         ed.source  || ai.source,
        country:        this.selectedCountry(),
        criticality:    ai.criticality,
        priority_score: ai.priority_score,
        tags:           ai.tags,
        pillar:         ai.pillar ?? null,
        status:         'pending',
        editor_notes:   ed.editor_notes || null,
        boost_eligible: true,
        cluster_size:   1,
      });
      const next = new Set(this.savedIndices());
      next.add(i);
      this.savedIndices.set(next);
    } catch (err: any) {
      alert(`Save failed: ${err.message}`);
    } finally {
      this.savingIndex.set(null);
    }
  }

  skipArticle(i: number) {
    const next = new Set(this.skippedIndices());
    next.add(i);
    this.skippedIndices.set(next);
  }

  reset() {
    this.rawText.set('');
    this.fileName.set('');
    this.error.set(null);
    this.analyzedArticles.set([]);
    this.editedData = [];
    this.savedIndices.set(new Set());
    this.skippedIndices.set(new Set());
    this.step.set(1);
  }

  critBadgeClass(level: string): string {
    return ({ breaking: 'ib-breaking', alert: 'ib-alert', trending: 'ib-trending', standard: 'ib-standard' } as any)[level] ?? '';
  }
}
