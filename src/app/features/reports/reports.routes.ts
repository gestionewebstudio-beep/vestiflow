import { Routes } from '@angular/router';

import { tenantPermissionGuard } from '@core/guards/tenant-permission.guard';
import { TenantPermission } from '@core/models/tenant-permission.model';
import { REQUIRED_TENANT_PERMISSIONS_KEY } from '@core/permissions/tenant-permissions.util';

export const reportsRoutes: Routes = [
  {
    path: '',
    title: 'VestiFlow · Report',
    loadComponent: () => import('./reports.component').then((m) => m.ReportsComponent),
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.ReportsView },
  },
  {
    path: 'corrispettivi',
    title: 'VestiFlow · Corrispettivi',
    loadComponent: () =>
      import('./pages/corrispettivi-report/corrispettivi-report.component').then(
        (m) => m.CorrispettiviReportComponent,
      ),
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.ReportsView },
  },
  {
    path: 'corrispettivi/print',
    title: 'VestiFlow · Stampa corrispettivi',
    loadComponent: () =>
      import('./pages/corrispettivi-print/corrispettivi-print.component').then(
        (m) => m.CorrispettiviPrintComponent,
      ),
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.ReportsView },
  },
  {
    path: 'accountant-register',
    title: 'VestiFlow · Registro commercialista',
    loadComponent: () =>
      import('./pages/accountant-register/accountant-register.component').then(
        (m) => m.AccountantRegisterComponent,
      ),
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.ReportsView },
  },
];
