import { Routes } from '@angular/router';

import { platformAdminGuard } from './guards/platform-admin.guard';

export const adminRoutes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'clients' },
  {
    path: 'clients',
    title: 'VestiFlow · Clienti',
    canActivate: [platformAdminGuard],
    loadComponent: () =>
      import('./pages/create-client/create-client.component').then((m) => m.CreateClientComponent),
  },
  {
    path: 'clients/new',
    title: 'VestiFlow · Nuovo cliente',
    canActivate: [platformAdminGuard],
    loadComponent: () =>
      import('./pages/create-client/create-client.component').then((m) => m.CreateClientComponent),
  },
  {
    path: 'clients/:tenantId',
    title: 'VestiFlow · Modifica cliente',
    canActivate: [platformAdminGuard],
    loadComponent: () =>
      import('./pages/edit-client/edit-client.component').then((m) => m.EditClientComponent),
  },
  {
    path: 'account',
    title: 'VestiFlow · Account operatore',
    canActivate: [platformAdminGuard],
    loadComponent: () =>
      import('./pages/operator-account/operator-account.component').then(
        (m) => m.OperatorAccountComponent,
      ),
  },
  {
    path: 'guide',
    title: 'VestiFlow · Guida tecnica',
    canActivate: [platformAdminGuard],
    loadComponent: () => import('@features/guide/guide.component').then((m) => m.GuideComponent),
    data: { guideVariant: 'admin' },
  },
];
