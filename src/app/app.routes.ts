import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./pages/login/login.component').then(m => m.LoginComponent),
  },
  {
    path: 'board',
    loadComponent: () =>
      import('./pages/board/board.component').then(m => m.BoardComponent),
    canActivate: [authGuard],
  },
  { path: '', redirectTo: '/board', pathMatch: 'full' },
  { path: '**', redirectTo: '/board' },
];
