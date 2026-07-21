import { Routes } from '@angular/router';

import { tenantPermissionGuard } from '@core/guards/tenant-permission.guard';
import { unsavedChangesGuard } from '@core/guards/unsaved-changes.guard';
import { TenantPermission } from '@core/models/tenant-permission.model';
import { REQUIRED_TENANT_PERMISSIONS_KEY } from '@core/permissions/tenant-permissions.util';

import {
  retailSalesRegisterGuard,
  salesHistoryGuard,
  shopifyOrdersGuard,
} from './guards/retail-sales.guard';

export const salesOrdersRoutes: Routes = [
  {
    path: '',
    title: 'VestiFlow · Ordini cliente',
    loadComponent: () =>
      import('./sales-order-list.component').then((m) => m.SalesOrderListComponent),
    canActivate: [salesHistoryGuard, tenantPermissionGuard],
    data: {
      [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.ReportsView,
      salesListProfile: 'customer-orders',
    },
  },
  {
    path: 'shopify',
    title: 'VestiFlow · Ordini Shopify',
    loadComponent: () =>
      import('./sales-order-list.component').then((m) => m.SalesOrderListComponent),
    canActivate: [shopifyOrdersGuard, tenantPermissionGuard],
    data: {
      [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.ReportsView,
      salesListProfile: 'shopify-orders',
    },
  },
  {
    path: 'online',
    title: 'VestiFlow · Vendite online',
    loadComponent: () =>
      import('@features/online-sales/online-sale-list.component').then(
        (m) => m.OnlineSaleListComponent,
      ),
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.ReportsView },
  },
  {
    path: 'online/:id',
    title: 'VestiFlow · Dettaglio vendita online',
    loadComponent: () =>
      import('@features/online-sales/online-sale-detail.component').then(
        (m) => m.OnlineSaleDetailComponent,
      ),
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.ReportsView },
  },
  {
    path: 'corrispettivi',
    title: 'VestiFlow · Corrispettivi',
    loadComponent: () =>
      import('@features/online-sales/corrispettivi-register.component').then(
        (m) => m.CorrispettiviRegisterComponent,
      ),
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.ReportsView },
  },
  {
    path: 'register',
    title: 'VestiFlow · Vendita/Reso in negozio',
    canActivate: [retailSalesRegisterGuard],
    // Uscita con carrello/reso in corso: conferma a tre scelte (salva, esci,
    // annulla) delegata al componente tramite CanComponentDeactivate.
    canDeactivate: [unsavedChangesGuard],
    // Fase 3 §7: cassa a carrello (sostituisce lo scan singolo per il negozio).
    loadComponent: () =>
      import('@features/store-sales/store-sale-register.component').then(
        (m) => m.StoreSaleRegisterComponent,
      ),
  },
  {
    path: 'new',
    title: 'VestiFlow · Nuovo ordine cliente',
    loadComponent: () =>
      import('./customer-order-form.component').then((m) => m.CustomerOrderFormComponent),
    canActivate: [salesHistoryGuard, tenantPermissionGuard],
    canDeactivate: [unsavedChangesGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.DocumentsManage },
  },
  {
    path: ':id/edit',
    title: 'VestiFlow · Modifica ordine cliente',
    loadComponent: () =>
      import('./customer-order-form.component').then((m) => m.CustomerOrderFormComponent),
    canActivate: [salesHistoryGuard, tenantPermissionGuard],
    canDeactivate: [unsavedChangesGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.DocumentsManage },
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
