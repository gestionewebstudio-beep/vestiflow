import { Routes } from '@angular/router';

import { tenantPermissionGuard } from '@core/guards/tenant-permission.guard';
import { unsavedChangesGuard } from '@core/guards/unsaved-changes.guard';
import { TenantPermission } from '@core/models/tenant-permission.model';
import {
  REQUIRED_TENANT_PERMISSIONS_KEY,
  SUPPLIER_ORDERS_VIEW_PERMISSIONS,
} from '@core/permissions/tenant-permissions.util';

export const suppliersRoutes: Routes = [
  {
    path: '',
    title: 'Fornitori',
    loadComponent: () => import('./supplier-list.component').then((m) => m.SupplierListComponent),
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: SUPPLIER_ORDERS_VIEW_PERMISSIONS, reuse: true },
  },
  {
    path: 'new',
    title: 'Nuovo fornitore',
    loadComponent: () => import('./supplier-form.component').then((m) => m.SupplierFormComponent),
    canActivate: [tenantPermissionGuard],
    canDeactivate: [unsavedChangesGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.SupplierOrdersManage },
  },
  {
    path: ':id/edit',
    title: 'Modifica fornitore',
    loadComponent: () => import('./supplier-form.component').then((m) => m.SupplierFormComponent),
    canActivate: [tenantPermissionGuard],
    canDeactivate: [unsavedChangesGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.SupplierOrdersManage },
  },
  {
    path: ':id',
    title: 'Dettaglio fornitore',
    loadComponent: () =>
      import('./supplier-detail.component').then((m) => m.SupplierDetailComponent),
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: SUPPLIER_ORDERS_VIEW_PERMISSIONS },
  },
];
