import { Routes } from '@angular/router';

import { tenantPermissionGuard } from '@core/guards/tenant-permission.guard';
import { unsavedChangesGuard } from '@core/guards/unsaved-changes.guard';
import {
  REQUIRED_TENANT_PERMISSION_GROUPS_KEY,
  SUPPLIER_ORDERS_MANAGE_GROUPS,
  SUPPLIER_ORDERS_VIEW_GROUPS,
} from '@core/permissions/tenant-permissions.util';

export const ordersRoutes: Routes = [
  {
    path: '',
    title: 'Ordini Fornitori',
    loadComponent: () =>
      import('./supplier-order-list.component').then((m) => m.SupplierOrderListComponent),
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSION_GROUPS_KEY]: SUPPLIER_ORDERS_VIEW_GROUPS, reuse: true },
  },
  {
    path: 'new',
    title: 'Nuovo ordine fornitore',
    loadComponent: () =>
      import('./supplier-order-form.component').then((m) => m.SupplierOrderFormComponent),
    canActivate: [tenantPermissionGuard],
    canDeactivate: [unsavedChangesGuard],
    data: { [REQUIRED_TENANT_PERMISSION_GROUPS_KEY]: SUPPLIER_ORDERS_MANAGE_GROUPS },
  },
  {
    path: ':id/edit',
    title: 'Modifica ordine fornitore',
    loadComponent: () =>
      import('./supplier-order-form.component').then((m) => m.SupplierOrderFormComponent),
    canActivate: [tenantPermissionGuard],
    canDeactivate: [unsavedChangesGuard],
    data: { [REQUIRED_TENANT_PERMISSION_GROUPS_KEY]: SUPPLIER_ORDERS_MANAGE_GROUPS },
  },
  {
    path: ':id',
    title: 'Dettaglio ordine fornitore',
    loadComponent: () =>
      import('./supplier-order-detail.component').then((m) => m.SupplierOrderDetailComponent),
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSION_GROUPS_KEY]: SUPPLIER_ORDERS_VIEW_GROUPS },
  },
];
