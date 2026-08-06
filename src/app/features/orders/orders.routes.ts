import { Routes } from '@angular/router';

import { tenantPermissionGuard } from '@core/guards/tenant-permission.guard';
import { unsavedChangesGuard } from '@core/guards/unsaved-changes.guard';
import { TenantPermission } from '@core/models/tenant-permission.model';
import {
  REQUIRED_TENANT_PERMISSIONS_KEY,
  SUPPLIER_ORDERS_VIEW_PERMISSIONS,
} from '@core/permissions/tenant-permissions.util';

export const ordersRoutes: Routes = [
  {
    path: '',
    title: 'VestiFlow · Ordini Fornitori',
    loadComponent: () =>
      import('./supplier-order-list.component').then((m) => m.SupplierOrderListComponent),
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: SUPPLIER_ORDERS_VIEW_PERMISSIONS },
  },
  {
    path: 'new',
    title: 'VestiFlow · Nuovo ordine fornitore',
    loadComponent: () =>
      import('./supplier-order-form.component').then((m) => m.SupplierOrderFormComponent),
    canActivate: [tenantPermissionGuard],
    canDeactivate: [unsavedChangesGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.SupplierOrdersManage },
  },
  {
    path: ':id/edit',
    title: 'VestiFlow · Modifica ordine fornitore',
    loadComponent: () =>
      import('./supplier-order-form.component').then((m) => m.SupplierOrderFormComponent),
    canActivate: [tenantPermissionGuard],
    canDeactivate: [unsavedChangesGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.SupplierOrdersManage },
  },
  {
    path: ':id',
    title: 'VestiFlow · Dettaglio ordine fornitore',
    loadComponent: () =>
      import('./supplier-order-detail.component').then((m) => m.SupplierOrderDetailComponent),
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: SUPPLIER_ORDERS_VIEW_PERMISSIONS },
  },
];
