import { Routes } from '@angular/router';

import { tenantPermissionGuard } from '@core/guards/tenant-permission.guard';
import { TenantPermission } from '@core/models/tenant-permission.model';
import {
  ONLINE_SALES_VIEW_GROUPS,
  REQUIRED_TENANT_PERMISSION_GROUPS_KEY,
  REQUIRED_TENANT_PERMISSIONS_KEY,
} from '@core/permissions/tenant-permissions.util';

/**
 * Il registro corrispettivi **canonico**, montato su `/app/sales/corrispettivi`.
 *
 * Sta qui e non sotto `online-sales` perché il componente vive in questa
 * feature; la rotta la dichiara `app.routes.ts`, che è la radice e può
 * comporre.
 *
 * **Permessi: quelli delle vendite online**, non quelli dei Report — sono gli
 * stessi che l'API `/corrispettivi/*` richiede. La vecchia rotta sotto Report
 * chiedeva `SectionReports`, e chi aveva solo quello apriva una pagina che poi
 * riceveva 403 dalle sue stesse chiamate.
 */
export const corrispettiviRegisterRoutes: Routes = [
  {
    path: '',
    title: 'Corrispettivi',
    loadComponent: () =>
      import('./pages/corrispettivi-report/corrispettivi-report.component').then(
        (m) => m.CorrispettiviReportComponent,
      ),
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSION_GROUPS_KEY]: ONLINE_SALES_VIEW_GROUPS, reuse: true },
  },
  {
    path: 'print',
    title: 'Stampa corrispettivi',
    loadComponent: () =>
      import('./pages/corrispettivi-print/corrispettivi-print.component').then(
        (m) => m.CorrispettiviPrintComponent,
      ),
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSION_GROUPS_KEY]: ONLINE_SALES_VIEW_GROUPS },
  },
];

export const reportsRoutes: Routes = [
  {
    path: '',
    title: 'Report',
    loadComponent: () => import('./reports.component').then((m) => m.ReportsComponent),
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.SectionReports, reuse: true },
  },
  // Non devono esistere due indirizzi «Corrispettivi»: chi ha un segnalibro
  // sul vecchio finisce sul canonico invece di vedere una pagina gemella.
  { path: 'corrispettivi/print', redirectTo: '/app/sales/corrispettivi/print' },
  { path: 'corrispettivi', redirectTo: '/app/sales/corrispettivi' },
];
