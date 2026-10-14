import { NgIf } from '@angular/common';
import { Component, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { EngineAuthService } from '../core/engine-auth.service';

@Component({
  selector: 'app-engine-login',
  standalone: true,
  imports: [ReactiveFormsModule, NgIf],
  template: `
    <div
      style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;"
    >
      <div style="width:100%;max-width:340px;">
        <div style="text-align:center;margin-bottom:24px;">
          <span
            style="font-family:'Playfair Display',serif;font-weight:900;font-size:26px;letter-spacing:.06em;color:var(--ink-text);"
            >ENGINE</span
          >
          <p
            style="font-size:11px;color:var(--ink-text-3);letter-spacing:.14em;text-transform:uppercase;"
          >
            Console
          </p>
        </div>
        <div class="ink-surface" style="padding:24px;">
          <form [formGroup]="form" (ngSubmit)="submit()">
            <div style="display:flex;flex-direction:column;gap:4px;margin-bottom:16px;">
              <label style="font-size:11px;font-weight:600;color:var(--ink-text-2);">Email</label>
              <input type="email" class="ink-input" formControlName="email" autocomplete="email" />
            </div>
            <div style="display:flex;flex-direction:column;gap:4px;margin-bottom:20px;">
              <label style="font-size:11px;font-weight:600;color:var(--ink-text-2);"
                >Password</label
              >
              <input
                type="password"
                class="ink-input"
                formControlName="password"
                autocomplete="current-password"
              />
            </div>
            <div
              *ngIf="error()"
              style="background:rgba(255,54,54,.1);border:1px solid rgba(255,54,54,.2);border-radius:5px;padding:10px 12px;font-size:13px;color:var(--ink-breaking);margin-bottom:16px;"
            >
              {{ error() }}
            </div>
            <button
              type="submit"
              class="btn-brand"
              style="width:100%;height:42px;font-size:14px;"
              [disabled]="loading()"
            >
              {{ loading() ? 'Signing in…' : 'Sign in' }}
            </button>
          </form>
        </div>
      </div>
    </div>
  `,
})
export class EngineLoginComponent {
  form: FormGroup;
  loading = signal(false);
  error = signal('');

  constructor(
    private fb: FormBuilder,
    private auth: EngineAuthService,
    private router: Router,
  ) {
    this.form = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', Validators.required],
    });
  }

  async submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.error.set('');
    const { email, password } = this.form.value;
    const { error } = await this.auth.signIn(email, password);
    if (error) {
      this.error.set(error.message);
      this.loading.set(false);
    } else {
      this.router.navigate(['/engine/projects']);
    }
  }
}
