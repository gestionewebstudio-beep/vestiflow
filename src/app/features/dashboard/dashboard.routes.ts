import { Routes } from '@angular/router';

export const dashboardRoutes: Routes = [
  {
    path: '',
    title: 'Dashboard',
    loadComponent: () => import('./dashboard.component').then((m) => m.DashboardComponent),
    data: { reuse: true },
  },
];
