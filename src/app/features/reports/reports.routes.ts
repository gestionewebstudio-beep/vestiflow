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
];
