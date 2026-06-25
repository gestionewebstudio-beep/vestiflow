import { Routes } from '@angular/router';

import { tenantPermissionGuard } from '@core/guards/tenant-permission.guard';
import {
  CUSTOMERS_VIEW_PERMISSIONS,
  REQUIRED_TENANT_PERMISSIONS_KEY,
} from '@core/permissions/tenant-permissions.util';

import { CustomerDetailComponent } from './customer-detail.component';
import { CustomerListComponent } from './customer-list.component';

export const customersRoutes: Routes = [
  {
    path: '',
    title: 'VestiFlow · Clienti',
    component: CustomerListComponent,
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: CUSTOMERS_VIEW_PERMISSIONS },
  },
  {
    path: ':id',
    title: 'VestiFlow · Dettaglio cliente',
    component: CustomerDetailComponent,
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: CUSTOMERS_VIEW_PERMISSIONS },
  },
];
