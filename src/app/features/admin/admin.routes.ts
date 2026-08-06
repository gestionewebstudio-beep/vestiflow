import { Routes } from '@angular/router';

import { platformAdminGuard } from './guards/platform-admin.guard';

export const adminRoutes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'clients' },
  {
    path: 'clients',
    title: 'Clienti',
    canActivate: [platformAdminGuard],
    loadComponent: () =>
      import('./pages/create-client/create-client.component').then((m) => m.CreateClientComponent),
  },
  {
    path: 'clients/new',
    title: 'Nuovo cliente',
    canActivate: [platformAdminGuard],
    loadComponent: () =>
      import('./pages/create-client/create-client.component').then((m) => m.CreateClientComponent),
  },
  {
    path: 'clients/:tenantId',
    title: 'Modifica cliente',
    canActivate: [platformAdminGuard],
    loadComponent: () =>
      import('./pages/edit-client/edit-client.component').then((m) => m.EditClientComponent),
  },
  {
    path: 'account',
    title: 'Impostazioni',
    canActivate: [platformAdminGuard],
    loadComponent: () =>
      import('./pages/operator-account/operator-account.component').then(
        (m) => m.OperatorAccountComponent,
      ),
  },
  // La rotta 'guide' (variante admin di features/guide) è montata dal
  // composition root in app.routes.ts: importarla da qui violerebbe il
  // confine tra feature.
];
