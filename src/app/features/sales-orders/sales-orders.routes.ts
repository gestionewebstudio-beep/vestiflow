import { Routes } from '@angular/router';

import { tenantPermissionGuard } from '@core/guards/tenant-permission.guard';
import { TenantPermission } from '@core/models/tenant-permission.model';
import { REQUIRED_TENANT_PERMISSIONS_KEY } from '@core/permissions/tenant-permissions.util';

import {
  onlineSalesRegisterGuard,
  retailSalesRegisterGuard,
  salesHistoryGuard,
} from './guards/retail-sales.guard';

export const salesOrdersRoutes: Routes = [
  {
    path: '',
    title: 'VestiFlow · Vendite',
    loadComponent: () =>
      import('./sales-order-list.component').then((m) => m.SalesOrderListComponent),
    canActivate: [salesHistoryGuard, tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.ReportsView },
  },
  {
    path: 'register',
    title: 'VestiFlow · Registra vendita',
    canActivate: [retailSalesRegisterGuard],
    data: { channel: 'in_store' },
    loadComponent: () =>
      import('./retail-sale-register.component').then((m) => m.RetailSaleRegisterComponent),
  },
  {
    path: 'register-online',
    title: 'VestiFlow · Registra vendita online',
    canActivate: [onlineSalesRegisterGuard],
    data: { channel: 'online' },
    loadComponent: () =>
      import('./retail-sale-register.component').then((m) => m.RetailSaleRegisterComponent),
  },
  {
    path: ':id',
    title: 'VestiFlow · Dettaglio vendita',
    loadComponent: () =>
      import('./sales-order-detail.component').then((m) => m.SalesOrderDetailComponent),
    canActivate: [salesHistoryGuard, tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.ReportsView },
  },
];
