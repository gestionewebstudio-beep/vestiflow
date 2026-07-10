import { Routes } from '@angular/router';

import { tenantPermissionGuard } from '@core/guards/tenant-permission.guard';
import { TenantPermission } from '@core/models/tenant-permission.model';
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
    path: 'new',
    title: 'VestiFlow · Nuovo cliente',
    loadComponent: () => import('./customer-form.component').then((m) => m.CustomerFormComponent),
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: [TenantPermission.CustomersManage] },
  },
  {
    path: ':id/edit',
    title: 'VestiFlow · Modifica cliente',
    loadComponent: () => import('./customer-form.component').then((m) => m.CustomerFormComponent),
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: [TenantPermission.CustomersManage] },
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
