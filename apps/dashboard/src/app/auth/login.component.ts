import { Component, OnInit, signal } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { NgIf } from '@angular/common';
import { Router } from '@angular/router';
import { SupabaseService } from '../core/supabase.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, NgIf],
  template: `
    <div class="login-bg" style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;position:relative;overflow:hidden;">

      <!-- Decorative circles -->
      <div style="position:absolute;inset:0;pointer-events:none;overflow:hidden;">
        <div style="position:absolute;top:-240px;right:-120px;width:560px;height:560px;border:1px solid rgba(99,102,241,.08);border-radius:50%;"></div>
        <div style="position:absolute;top:-100px;right:80px;width:320px;height:320px;border:1px solid rgba(99,102,241,.05);border-radius:50%;"></div>
        <div style="position:absolute;bottom:-200px;left:-120px;width:480px;height:480px;border:1px solid rgba(30,122,255,.05);border-radius:50%;"></div>
        <div style="position:absolute;bottom:100px;right:-80px;width:200px;height:200px;border:1px solid rgba(99,102,241,.06);border-radius:50%;"></div>
      </div>

      <div style="position:relative;z-index:1;width:100%;max-width:340px;">

        <!-- Brand mark -->
        <div style="text-align:center;margin-bottom:32px;">
          <div style="display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:8px;">
            <span class="sig sig-breaking" style="width:10px;height:10px;"></span>
            <span style="font-family:'Playfair Display',serif;font-weight:900;font-size:30px;letter-spacing:.06em;color:var(--ink-text);">SIGNAL</span>
          </div>
          <p style="font-size:11px;color:var(--ink-text-3);letter-spacing:.14em;text-transform:uppercase;">Editorial Console</p>
        </div>

        <!-- Form card -->
        <div class="ink-surface" style="padding:24px;">
          <form [formGroup]="form" (ngSubmit)="submit()">

            <div style="display:flex;flex-direction:column;gap:4px;margin-bottom:16px;">
              <label style="font-size:11px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--ink-text-2);">Email</label>
              <input type="email" class="ink-input" formControlName="email" autocomplete="email" placeholder="you@newsroom.com" />
              <span *ngIf="form.get('email')?.touched && form.get('email')?.invalid"
                    style="font-size:11px;color:var(--ink-breaking);margin-top:2px;">Enter a valid email</span>
            </div>

            <div style="display:flex;flex-direction:column;gap:4px;margin-bottom:20px;">
              <label style="font-size:11px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--ink-text-2);">Password</label>
              <div style="position:relative;">
                <input [type]="showPwd() ? 'text' : 'password'" class="ink-input" style="padding-right:40px;"
                       formControlName="password" autocomplete="current-password" placeholder="••••••••" />
                <button type="button" class="btn-ghost-icon"
                        style="position:absolute;right:4px;top:50%;transform:translateY(-50%);"
                        (click)="showPwd.set(!showPwd())">{{ showPwd() ? '🙈' : '👁' }}</button>
              </div>
              <span *ngIf="form.get('password')?.touched && form.get('password')?.hasError('required')"
                    style="font-size:11px;color:var(--ink-breaking);margin-top:2px;">Password required</span>
            </div>

            <div *ngIf="error()"
                 style="background:rgba(255,54,54,.1);border:1px solid rgba(255,54,54,.2);border-radius:5px;padding:10px 12px;font-size:13px;color:var(--ink-breaking);margin-bottom:16px;">
              {{ error() }}
            </div>

            <button type="submit" class="btn-brand" style="width:100%;height:42px;font-size:14px;" [disabled]="loading()">
              @if (loading()) {
                <span class="loading loading-spinner loading-sm"></span>
                Authenticating…
              } @else {
                Sign in to Console
              }
            </button>

          </form>
        </div>

        <p style="text-align:center;margin-top:20px;font-size:10px;color:var(--ink-text-3);letter-spacing:.1em;text-transform:uppercase;">
          Signal · Facebook News Pipeline
        </p>
      </div>
    </div>
  `,
})
export class LoginComponent implements OnInit {
  form: FormGroup;
  loading = signal(false);
  error = signal('');
  showPwd = signal(false);

  constructor(
    private fb: FormBuilder,
    private supabase: SupabaseService,
    private router: Router,
  ) {
    this.form = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', Validators.required],
    });
  }

  ngOnInit() {
    const theme = localStorage.getItem('theme') ?? 'dark';
    document.documentElement.setAttribute('data-theme', theme);
  }

  async submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.error.set('');
    const { email, password } = this.form.value;
    const { error } = await this.supabase.signIn(email, password);
    if (error) {
      this.error.set(error.message);
      this.loading.set(false);
    } else {
      this.router.navigate(['/articles']);
    }
  }
}
