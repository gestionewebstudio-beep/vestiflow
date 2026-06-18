import { Routes } from '@angular/router';

import { platformAdminGuard } from './guards/platform-admin.guard';

export const adminRoutes: Routes = [
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
];
