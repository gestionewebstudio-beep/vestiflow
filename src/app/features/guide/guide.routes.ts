import { Routes } from '@angular/router';

export const guideRoutes: Routes = [
  {
    path: '',
    title: 'Guida',
    loadComponent: () => import('./guide.component').then((m) => m.GuideComponent),
    data: { guideVariant: 'user', reuse: true },
  },
];
