import { Routes } from '@angular/router';

import { tenantPermissionGuard } from '@core/guards/tenant-permission.guard';
import {
  ONLINE_SALES_VIEW_GROUPS,
  REQUIRED_TENANT_PERMISSION_GROUPS_KEY,
} from '@core/permissions/tenant-permissions.util';

// Le pagine appartengono a questa feature ma i path stanno nell'area Vendite:
// il composition root (app.routes.ts) le monta sotto /app/sales/online e
// /app/sales/corrispettivi, così sales-orders non deve importare da qui.
export const onlineSalesRoutes: Routes = [
  {
    path: '',
    title: 'Vendite online',
    loadComponent: () =>
      import('./online-sale-list.component').then((m) => m.OnlineSaleListComponent),
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSION_GROUPS_KEY]: ONLINE_SALES_VIEW_GROUPS, reuse: true },
  },
  {
    path: ':id',
    title: 'Dettaglio vendita online',
    loadComponent: () =>
      import('./online-sale-detail.component').then((m) => m.OnlineSaleDetailComponent),
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSION_GROUPS_KEY]: ONLINE_SALES_VIEW_GROUPS },
  },
];

export const corrispettiviRegisterRoutes: Routes = [
  {
    path: '',
    title: 'Corrispettivi',
    loadComponent: () =>
      import('./corrispettivi-register.component').then((m) => m.CorrispettiviRegisterComponent),
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSION_GROUPS_KEY]: ONLINE_SALES_VIEW_GROUPS, reuse: true },
  },
];
