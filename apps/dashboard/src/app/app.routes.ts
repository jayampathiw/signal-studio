import { Routes } from '@angular/router';
import { engineAuthGuard } from './core/engine-auth.guard';

// P3.7/P5.7 (2026-09-28) — the legacy news/video console (articles, reels,
// on-this-day, longform, metrics, upload) and its login/auth surface were
// retired here: both pipelines it reviewed (Wild Eye reels, news posting)
// are permanently stopped, so the review UI for them had no reason left to
// exist. The engine console below is now the only app.
export const routes: Routes = [
  { path: '', redirectTo: 'engine/projects', pathMatch: 'full' },
  {
    path: 'engine/login',
    loadComponent: () =>
      import('./engine/engine-login.component').then((m) => m.EngineLoginComponent),
  },
  {
    path: 'engine/projects',
    loadComponent: () =>
      import('./engine/project-list.component').then((m) => m.ProjectListComponent),
    canActivate: [engineAuthGuard],
  },
  {
    path: 'engine/projects/:slug',
    loadComponent: () =>
      import('./engine/project-detail.component').then((m) => m.ProjectDetailComponent),
    canActivate: [engineAuthGuard],
  },
  {
    path: 'engine/projects/:slug/jobs',
    loadComponent: () => import('./engine/job-list.component').then((m) => m.JobListComponent),
    canActivate: [engineAuthGuard],
  },
  {
    path: 'engine/projects/:slug/jobs/new',
    loadComponent: () => import('./engine/new-job.component').then((m) => m.NewJobComponent),
    canActivate: [engineAuthGuard],
  },
  {
    path: 'engine/jobs/:id',
    loadComponent: () => import('./engine/job-detail.component').then((m) => m.JobDetailComponent),
    canActivate: [engineAuthGuard],
  },
  {
    path: 'engine/generation-attempts',
    loadComponent: () =>
      import('./engine/generation-attempts.component').then((m) => m.GenerationAttemptsComponent),
    canActivate: [engineAuthGuard],
  },
  { path: '**', redirectTo: 'engine/projects' },
];
