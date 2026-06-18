import { Routes } from '@angular/router';

export const guideRoutes: Routes = [
  {
    path: '',
    title: 'VestiFlow · Guida',
    loadComponent: () => import('./guide.component').then((m) => m.GuideComponent),
    data: { guideVariant: 'user' },
  },
];
