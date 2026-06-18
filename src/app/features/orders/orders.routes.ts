import { Routes } from '@angular/router';

import { tenantRoleGuard } from '@core/guards/tenant-role.guard';
import { TENANT_ROUTE_PERMISSION_KEY } from '@core/permissions/tenant-permissions.util';

import { SupplierOrderDetailComponent } from './supplier-order-detail.component';
import { SupplierOrderFormComponent } from './supplier-order-form.component';
import { SupplierOrderListComponent } from './supplier-order-list.component';

export const ordersRoutes: Routes = [
  { path: '', title: 'VestiFlow · Ordini Fornitori', component: SupplierOrderListComponent },
  {
    path: 'new',
    title: 'VestiFlow · Nuovo ordine fornitore',
    component: SupplierOrderFormComponent,
    canActivate: [tenantRoleGuard],
    data: { [TENANT_ROUTE_PERMISSION_KEY]: 'manager' },
  },
  {
    path: ':id',
    title: 'VestiFlow · Dettaglio ordine fornitore',
    component: SupplierOrderDetailComponent,
  },
];
