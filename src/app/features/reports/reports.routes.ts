import { Routes } from '@angular/router';

import { tenantPermissionGuard } from '@core/guards/tenant-permission.guard';
import { TenantPermission } from '@core/models/tenant-permission.model';
import { REQUIRED_TENANT_PERMISSIONS_KEY } from '@core/permissions/tenant-permissions.util';

export const reportsRoutes: Routes = [
  {
    path: '',
    title: 'Report',
    loadComponent: () => import('./reports.component').then((m) => m.ReportsComponent),
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.ReportsView, reuse: true },
  },
  {
    path: 'corrispettivi',
    title: 'Corrispettivi',
    loadComponent: () =>
      import('./pages/corrispettivi-report/corrispettivi-report.component').then(
        (m) => m.CorrispettiviReportComponent,
      ),
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.ReportsView, reuse: true },
  },
  {
    path: 'corrispettivi/print',
    title: 'Stampa corrispettivi',
    loadComponent: () =>
      import('./pages/corrispettivi-print/corrispettivi-print.component').then(
        (m) => m.CorrispettiviPrintComponent,
      ),
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.ReportsView },
  },
  {
    path: 'accountant-register',
    title: 'Registro commercialista',
    loadComponent: () =>
      import('./pages/accountant-register/accountant-register.component').then(
        (m) => m.AccountantRegisterComponent,
      ),
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.ReportsView, reuse: true },
  },
];
