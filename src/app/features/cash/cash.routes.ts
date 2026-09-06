import type { Routes } from '@angular/router';

import { tenantPermissionGuard } from '@core/guards/tenant-permission.guard';
import { TenantPermission } from '@core/models/tenant-permission.model';
import { REQUIRED_TENANT_PERMISSIONS_KEY } from '@core/permissions/tenant-permissions.util';

/**
 * Le rotte della Cassa (`docs/25` §3).
 *
 * ⛔ **Tre aree, non di più**: Vendita · Operazioni · Sessioni. Reso e chiusura
 * sono **subordinati** — si raggiungono da un'operazione e da una sessione — e
 * non compaiono nel menu: sono gesti su qualcosa, non destinazioni.
 *
 * ⚠️ **L'ordine conta**: i segmenti statici prima di `:id`, o il dettaglio
 * catturerebbe «operazioni» come identificativo.
 *
 * ⭐ **I permessi sono quelli dell'API**, non una seconda tabella: la guardia
 * rimbalza chi l'API rifiuterebbe, invece di far arrivare a una schermata che
 * poi fallisce ogni chiamata.
 */
export const cashRoutes: Routes = [
  {
    path: 'operazioni',
    title: 'Operazioni di cassa',
    loadComponent: () =>
      import('./pages/cash-operations.component').then((m) => m.CashOperationsComponent),
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.RetailRegister, reuse: true },
  },
  {
    path: 'operazioni/:id/reso',
    title: 'Reso di cassa',
    loadComponent: () => import('./pages/cash-return.component').then((m) => m.CashReturnComponent),
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.RetailCashReturn },
  },
  {
    path: 'operazioni/:id',
    title: 'Dettaglio operazione',
    loadComponent: () =>
      import('./pages/cash-operation-detail.component').then((m) => m.CashOperationDetailComponent),
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.RetailRegister },
  },
  {
    path: 'sessioni',
    title: 'Sessioni di cassa',
    loadComponent: () =>
      import('./pages/cash-sessions.component').then((m) => m.CashSessionsComponent),
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.RetailRegister, reuse: true },
  },
  {
    path: 'sessioni/:id/chiusura',
    title: 'Chiusura di cassa',
    loadComponent: () =>
      import('./pages/cash-closing.component').then((m) => m.CashClosingComponent),
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.RetailCashSession },
  },
  {
    path: 'sessioni/:id',
    title: 'Dettaglio sessione',
    loadComponent: () =>
      import('./pages/cash-session-detail.component').then((m) => m.CashSessionDetailComponent),
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.RetailRegister },
  },
  {
    path: '',
    title: 'Cassa',
    loadComponent: () => import('./cash-register.component').then((m) => m.CashRegisterComponent),
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.RetailRegister },
  },
];
