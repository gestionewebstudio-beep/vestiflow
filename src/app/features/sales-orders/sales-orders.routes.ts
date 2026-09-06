import { Routes } from '@angular/router';

import { shopifyOrdersGuard } from '@core/guards/retail-sales.guard';
import { tenantPermissionGuard } from '@core/guards/tenant-permission.guard';
import { unsavedChangesGuard } from '@core/guards/unsaved-changes.guard';
import {
  REQUIRED_TENANT_PERMISSION_GROUPS_KEY,
  SALES_ORDERS_MANAGE_GROUPS,
  SALES_ORDERS_VIEW_GROUPS,
} from '@core/permissions/tenant-permissions.util';

// Le sorelle /app/sales/online, /app/sales/corrispettivi e /app/sales/register
// appartengono alle feature online-sales e store-sales: le monta il composition
// root (app.routes.ts), non questo file — nessun import cross-feature.
export const salesOrdersRoutes: Routes = [
  {
    path: '',
    title: 'Ordini cliente',
    loadComponent: () =>
      import('./sales-order-list.component').then((m) => m.SalesOrderListComponent),
    canActivate: [tenantPermissionGuard],
    data: {
      [REQUIRED_TENANT_PERMISSION_GROUPS_KEY]: SALES_ORDERS_VIEW_GROUPS,
      salesListProfile: 'customer-orders',
      reuse: true,
    },
  },
  {
    path: 'shopify',
    title: 'Ordini Shopify',
    loadComponent: () =>
      import('./sales-order-list.component').then((m) => m.SalesOrderListComponent),
    canActivate: [shopifyOrdersGuard, tenantPermissionGuard],
    data: {
      [REQUIRED_TENANT_PERMISSION_GROUPS_KEY]: SALES_ORDERS_VIEW_GROUPS,
      salesListProfile: 'shopify-orders',
      reuse: true,
    },
  },
  {
    path: 'new',
    title: 'Nuovo ordine cliente',
    loadComponent: () =>
      import('./customer-order-form.component').then((m) => m.CustomerOrderFormComponent),
    canActivate: [tenantPermissionGuard],
    canDeactivate: [unsavedChangesGuard],
    data: { [REQUIRED_TENANT_PERMISSION_GROUPS_KEY]: SALES_ORDERS_MANAGE_GROUPS },
  },
  {
    path: ':id/edit',
    title: 'Ordine cliente',
    loadComponent: () =>
      import('./customer-order-form.component').then((m) => m.CustomerOrderFormComponent),
    canActivate: [tenantPermissionGuard],
    canDeactivate: [unsavedChangesGuard],
    // Vista consentita a chi consulta i report; la modifica è gated nel form
    // (sblocco solo per chi gestisce i documenti). Sostituisce la vecchia
    // schermata Dettaglio: ogni ordine si apre nel form (bloccato).
    data: { [REQUIRED_TENANT_PERMISSION_GROUPS_KEY]: SALES_ORDERS_VIEW_GROUPS },
  },
  {
    path: ':id',
    title: 'Ordine cliente',
    loadComponent: () =>
      import('./customer-order-form.component').then((m) => m.CustomerOrderFormComponent),
    canActivate: [tenantPermissionGuard],
    canDeactivate: [unsavedChangesGuard],
    data: { [REQUIRED_TENANT_PERMISSION_GROUPS_KEY]: SALES_ORDERS_VIEW_GROUPS },
  },
];
