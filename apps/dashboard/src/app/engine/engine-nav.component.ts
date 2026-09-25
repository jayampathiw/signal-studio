import { Component } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { EngineAuthService } from '../core/engine-auth.service';

/**
 * P5.1 — shared top nav for every /engine/* page, so the console reads as
 * one coherent app rather than N standalone pages each re-implementing
 * their own header.
 */
@Component({
  selector: 'app-engine-nav',
  standalone: true,
  imports: [RouterLink],
  template: `
    <nav
      class="ink-navbar"
      style="display:flex;align-items:center;justify-content:space-between;padding:0 16px;height:52px;"
    >
      <div style="display:flex;align-items:center;gap:10px;">
        <span
          style="font-family:'Playfair Display',serif;font-weight:900;font-size:16px;letter-spacing:.06em;color:var(--ink-text);"
          >ENGINE</span
        >
        <a
          routerLink="/engine/projects"
          style="font-size:11px;font-weight:600;color:var(--ink-text-2);text-decoration:none;padding:3px 8px;border-radius:4px;background:var(--ink-raised);"
          >Projects</a
        >
        <a
          routerLink="/engine/generation-attempts"
          style="font-size:11px;font-weight:600;color:var(--ink-text-2);text-decoration:none;padding:3px 8px;border-radius:4px;background:var(--ink-raised);"
          >Attempts</a
        >
        <a
          routerLink="/articles"
          style="font-size:11px;font-weight:600;color:var(--ink-text-3);text-decoration:none;padding:3px 8px;"
          >&larr; Legacy console</a
        >
      </div>
      <button
        class="btn-ink"
        style="height:30px;font-size:12px;padding:0 12px;"
        (click)="signOut()"
      >
        Sign out
      </button>
    </nav>
  `,
})
export class EngineNavComponent {
  constructor(
    private auth: EngineAuthService,
    private router: Router,
  ) {}

  async signOut() {
    await this.auth.signOut();
    this.router.navigate(['/engine/login']);
  }
}
