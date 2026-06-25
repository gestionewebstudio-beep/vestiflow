import { Routes } from '@angular/router';

import { tenantPermissionGuard } from '@core/guards/tenant-permission.guard';
import { TenantPermission } from '@core/models/tenant-permission.model';
import {
  REQUIRED_TENANT_PERMISSIONS_KEY,
  SUPPLIER_ORDERS_VIEW_PERMISSIONS,
} from '@core/permissions/tenant-permissions.util';

import { SupplierOrderDetailComponent } from './supplier-order-detail.component';
import { SupplierOrderFormComponent } from './supplier-order-form.component';
import { SupplierOrderListComponent } from './supplier-order-list.component';

export const ordersRoutes: Routes = [
  {
    path: '',
    title: 'VestiFlow · Ordini Fornitori',
    component: SupplierOrderListComponent,
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: SUPPLIER_ORDERS_VIEW_PERMISSIONS },
  },
  {
    path: 'new',
    title: 'VestiFlow · Nuovo ordine fornitore',
    component: SupplierOrderFormComponent,
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.SupplierOrdersManage },
  },
  {
    path: ':id/edit',
    title: 'VestiFlow · Modifica ordine fornitore',
    component: SupplierOrderFormComponent,
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.SupplierOrdersManage },
  },
  {
    path: ':id',
    title: 'VestiFlow · Dettaglio ordine fornitore',
    component: SupplierOrderDetailComponent,
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: SUPPLIER_ORDERS_VIEW_PERMISSIONS },
  },
];
