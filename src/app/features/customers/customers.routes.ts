import { Routes } from '@angular/router';

import { tenantPermissionGuard } from '@core/guards/tenant-permission.guard';
import {
  CUSTOMERS_VIEW_PERMISSIONS,
  REQUIRED_TENANT_PERMISSIONS_KEY,
} from '@core/permissions/tenant-permissions.util';

export const customersRoutes: Routes = [
  {
    path: '',
    title: 'VestiFlow · Clienti',
    loadComponent: () => import('./customer-list.component').then((m) => m.CustomerListComponent),
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: CUSTOMERS_VIEW_PERMISSIONS },
  },
  {
    path: ':id',
    title: 'VestiFlow · Dettaglio cliente',
    loadComponent: () =>
      import('./customer-detail.component').then((m) => m.CustomerDetailComponent),
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: CUSTOMERS_VIEW_PERMISSIONS },
  },
];
