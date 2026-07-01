import { Routes } from '@angular/router';

import { tenantPermissionGuard } from '@core/guards/tenant-permission.guard';
import { TenantPermission } from '@core/models/tenant-permission.model';
import {
  REQUIRED_TENANT_PERMISSIONS_KEY,
  SUPPLIER_ORDERS_VIEW_PERMISSIONS,
} from '@core/permissions/tenant-permissions.util';

export const suppliersRoutes: Routes = [
  {
    path: '',
    title: 'VestiFlow · Fornitori',
    loadComponent: () => import('./supplier-list.component').then((m) => m.SupplierListComponent),
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: SUPPLIER_ORDERS_VIEW_PERMISSIONS },
  },
  {
    path: 'new',
    title: 'VestiFlow · Nuovo fornitore',
    loadComponent: () => import('./supplier-form.component').then((m) => m.SupplierFormComponent),
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: [TenantPermission.SupplierOrdersManage] },
  },
  {
    path: ':id/edit',
    title: 'VestiFlow · Modifica fornitore',
    loadComponent: () => import('./supplier-form.component').then((m) => m.SupplierFormComponent),
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: [TenantPermission.SupplierOrdersManage] },
  },
  {
    path: ':id',
    title: 'VestiFlow · Dettaglio fornitore',
    loadComponent: () =>
      import('./supplier-detail.component').then((m) => m.SupplierDetailComponent),
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: SUPPLIER_ORDERS_VIEW_PERMISSIONS },
  },
];
