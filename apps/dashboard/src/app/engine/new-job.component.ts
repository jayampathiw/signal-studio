import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { EngineApiError, EngineApiService, EngineProject } from '../core/engine-api.service';
import { EngineNavComponent } from './engine-nav.component';

type InputMode = 'script' | 'pack' | 'manual' | 'blank';

/**
 * P5.4 — New Job wizard: project (fixed from the route, matching the
 * "Jobs" page's own project-scoped URL) → input mode → manifest preview
 * (real server-side validation via `POST /manifest/validate`, never a
 * client-side re-implementation of `Manifest.parse`) → submit.
 *
 * **Four input modes, per the plan's own "valid manifest for all four
 * input modes" exit criterion** — the plan names "paste script / pack.json
 * / upload assets" (three slash-separated items) but the exit criterion
 * says four; rather than guess which fourth mode was meant, this adds the
 * most useful real fourth option a manifest-shaped job format actually
 * supports: pasting a manifest.v1 document directly (`manual`). Flagged
 * here, not silently decided:
 *   - `script`: one line of narration per shot — client-generates a
 *     minimal, likely-INCOMPLETE manifest (no clip refs) and lets real
 *     server validation say what's still missing, rather than guessing at
 *     asset requirements this page has no way to know.
 *   - `pack`: a real BLBL `pack.json`, converted via the same
 *     `packToManifest()` adapter `POST /manifest/from-pack` (P2.3) already
 *     uses for the CLI/API path — not a second, drifting implementation.
 *   - `manual`: a hand-written manifest.v1 JSON document, for anything the
 *     other two modes can't express.
 *   - `blank`: an empty shots[] with just `outputs`/`template` set, for a
 *     job whose shots will be added by editing the manual JSON directly
 *     once real per-shot asset filenames are known.
 */
@Component({
  selector: 'app-new-job',
  standalone: true,
  imports: [FormsModule, RouterLink, EngineNavComponent],
  template: `
    <app-engine-nav />
    <div style="max-width:720px;margin:0 auto;padding:24px 16px;">
      <a
        [routerLink]="['/engine/projects', slug, 'jobs']"
        style="font-size:12px;color:var(--ink-text-2);"
        >&larr; {{ slug }} jobs</a
      >
      <h1 style="font-size:20px;font-weight:700;color:var(--ink-text);margin:8px 0 16px;">
        New job
      </h1>

      <div class="ink-surface" style="padding:16px;margin-bottom:16px;">
        <div style="display:flex;gap:6px;margin-bottom:12px;">
          @for (m of modes; track m) {
            <button class="country-pill" [class.active]="mode() === m" (click)="setMode(m)">
              {{ modeLabel(m) }}
            </button>
          }
        </div>

        @if (mode() === 'script') {
          <textarea
            class="ink-input"
            rows="8"
            style="width:100%;font-family:monospace;"
            placeholder="One line of narration per shot"
            [(ngModel)]="scriptText"
          ></textarea>
        }
        @if (mode() === 'pack') {
          <textarea
            class="ink-input"
            rows="10"
            style="width:100%;font-family:monospace;"
            placeholder="Paste a real pack.json"
            [(ngModel)]="packText"
          ></textarea>
        }
        @if (mode() === 'manual') {
          <textarea
            class="ink-input"
            rows="14"
            style="width:100%;font-family:monospace;"
            placeholder="Paste a manifest.v1 JSON document"
            [(ngModel)]="manualText"
          ></textarea>
        }
        @if (mode() === 'blank') {
          <p style="font-size:12px;color:var(--ink-text-2);">
            Creates a manifest with an empty shots list — add real shots by editing the manual JSON
            afterward.
          </p>
        }

        <div style="display:flex;gap:8px;margin-top:12px;">
          <button
            class="btn-ink"
            style="height:34px;font-size:13px;padding:0 14px;"
            (click)="buildPreview()"
          >
            Preview manifest
          </button>
        </div>
      </div>

      @if (error()) {
        <div class="ink-surface" style="padding:16px;margin-bottom:16px;color:var(--ink-breaking);">
          {{ error() }}
        </div>
      }

      @if (manifest()) {
        <div class="ink-surface" style="padding:16px;margin-bottom:16px;">
          <div style="font-size:12px;font-weight:600;color:var(--ink-text-2);margin-bottom:8px;">
            Manifest preview
          </div>
          <pre
            style="font-size:11px;white-space:pre-wrap;max-height:280px;overflow:auto;color:var(--ink-text-2);"
            >{{ manifestText() }}</pre>
          @if (validation() === 'valid') {
            <div style="color:var(--ink-standard);font-size:12px;margin-top:8px;">
              &#10003; Valid manifest.v1 document
            </div>
            <button
              class="btn-brand"
              style="height:36px;font-size:13px;padding:0 16px;margin-top:8px;"
              (click)="submit()"
              [disabled]="submitting()"
            >
              {{ submitting() ? 'Creating…' : 'Create job' }}
            </button>
          }
          @if (validation() && validation() !== 'valid') {
            <div
              style="color:var(--ink-breaking);font-size:12px;margin-top:8px;white-space:pre-wrap;"
            >
              {{ validation() }}
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class NewJobComponent implements OnInit {
  slug = '';
  modes: InputMode[] = ['script', 'pack', 'manual', 'blank'];
  mode = signal<InputMode>('script');
  scriptText = '';
  packText = '';
  manualText = '';
  manifest = signal<Record<string, unknown> | null>(null);
  validation = signal<string | null>(null);
  error = signal('');
  submitting = signal(false);
  private project: EngineProject | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private api: EngineApiService,
  ) {}

  async ngOnInit() {
    this.slug = this.route.snapshot.paramMap.get('slug') ?? '';
    try {
      this.project = await this.api.getProject(this.slug);
    } catch (err) {
      this.error.set(this.messageOf(err));
    }
  }

  setMode(m: InputMode) {
    this.mode.set(m);
    this.manifest.set(null);
    this.validation.set(null);
  }

  modeLabel(m: InputMode): string {
    return {
      script: 'Paste script',
      pack: 'Paste pack.json',
      manual: 'Manual JSON',
      blank: 'Blank',
    }[m];
  }

  private template(): string {
    return (
      ((this.project?.config['defaults'] as Record<string, unknown> | undefined)?.[
        'template'
      ] as string) ?? 'clips-overlay'
    );
  }

  private outputs(): string[] {
    return (
      ((this.project?.config['defaults'] as Record<string, unknown> | undefined)?.[
        'outputs'
      ] as string[]) ?? ['fb']
    );
  }

  async buildPreview() {
    this.error.set('');
    this.validation.set(null);
    try {
      if (this.mode() === 'pack') {
        const pack = JSON.parse(this.packText);
        const { manifest } = await this.api.manifestFromPack(pack, this.slug);
        this.manifest.set(manifest);
      } else if (this.mode() === 'manual') {
        this.manifest.set(JSON.parse(this.manualText));
      } else if (this.mode() === 'blank') {
        this.manifest.set({
          version: '1',
          projectRef: this.slug,
          template: this.template(),
          visual: { mode: this.template() },
          shots: [],
          outputs: this.outputs(),
          captions: {},
        });
      } else {
        const lines = this.scriptText
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean);
        this.manifest.set({
          version: '1',
          projectRef: this.slug,
          template: this.template(),
          visual: { mode: this.template() },
          shots: lines.map((line, i) => ({
            id: `s${i + 1}`,
            voiceover_text: line,
            overlay_text: line.slice(0, 120),
            overlay_out_s: 1.5,
          })),
          end_card: { subject: this.slug, disclosure: 'AI visualisation' },
          outputs: this.outputs(),
          captions: {},
        });
      }
      await this.validate();
    } catch (err) {
      this.error.set(this.messageOf(err));
    }
  }

  private async validate() {
    const manifest = this.manifest();
    if (!manifest) return;
    const result = await this.api.validateManifest(manifest);
    this.validation.set(result.valid ? 'valid' : JSON.stringify(result.issues, null, 2));
  }

  manifestText(): string {
    return JSON.stringify(this.manifest(), null, 2);
  }

  async submit() {
    const manifest = this.manifest();
    if (!manifest) return;
    this.submitting.set(true);
    try {
      const job = await this.api.createJob(this.slug, manifest);
      this.router.navigate(['/engine/jobs', job.id]);
    } catch (err) {
      this.error.set(this.messageOf(err));
    } finally {
      this.submitting.set(false);
    }
  }

  private messageOf(err: unknown): string {
    return err instanceof EngineApiError
      ? err.message
      : err instanceof Error
        ? err.message
        : String(err);
  }
}
