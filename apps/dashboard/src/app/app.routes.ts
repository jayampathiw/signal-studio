import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'articles', pathMatch: 'full' },
  {
    path: 'login',
    loadComponent: () =>
      import('./auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'articles',
    loadComponent: () =>
      import('./articles/article-list.component').then(
        (m) => m.ArticleListComponent
      ),
    canActivate: [authGuard],
  },
  {
    path: 'metrics',
    loadComponent: () =>
      import('./metrics/metrics.component').then((m) => m.MetricsComponent),
    canActivate: [authGuard],
  },
  {
    path: 'upload',
    loadComponent: () =>
      import('./upload/upload.component').then((m) => m.UploadComponent),
    canActivate: [authGuard],
  },
  {
    path: 'reels',
    loadComponent: () =>
      import('./reels/reel-list.component').then((m) => m.ReelListComponent),
    canActivate: [authGuard],
  },
  {
    path: 'on-this-day',
    loadComponent: () =>
      import('./on-this-day/on-this-day.component').then(
        (m) => m.OnThisDayComponent
      ),
    canActivate: [authGuard],
  },
  { path: '**', redirectTo: 'articles' },
];
