import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';
import { engineAuthGuard } from './core/engine-auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'articles', pathMatch: 'full' },
  {
    path: 'login',
    loadComponent: () => import('./auth/login.component').then((m) => m.LoginComponent),
  },
  // P5 — the new engine-backed console, additive alongside the legacy
  // pages below (see refactor-plan.md's P5.7 entry for why those aren't
  // retired yet — both consoles are real, live UI right now).
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
  {
    path: 'articles',
    loadComponent: () =>
      import('./articles/article-list.component').then((m) => m.ArticleListComponent),
    canActivate: [authGuard],
  },
  {
    path: 'metrics',
    loadComponent: () => import('./metrics/metrics.component').then((m) => m.MetricsComponent),
    canActivate: [authGuard],
  },
  {
    path: 'upload',
    loadComponent: () => import('./upload/upload.component').then((m) => m.UploadComponent),
    canActivate: [authGuard],
  },
  {
    path: 'reels',
    loadComponent: () => import('./reels/reel-list.component').then((m) => m.ReelListComponent),
    canActivate: [authGuard],
  },
  {
    path: 'on-this-day',
    loadComponent: () =>
      import('./on-this-day/on-this-day.component').then((m) => m.OnThisDayComponent),
    canActivate: [authGuard],
  },
  {
    path: 'longform',
    loadComponent: () =>
      import('./longform/longform-list.component').then((m) => m.LongformListComponent),
    canActivate: [authGuard],
  },
  {
    path: 'longform/channel/:slug',
    loadComponent: () =>
      import('./longform/longform-videos.component').then((m) => m.LongformVideosComponent),
    canActivate: [authGuard],
  },
  {
    path: 'longform/video/:id',
    loadComponent: () =>
      import('./longform/longform-detail.component').then((m) => m.LongformDetailComponent),
    canActivate: [authGuard],
  },
  { path: '**', redirectTo: 'articles' },
];
