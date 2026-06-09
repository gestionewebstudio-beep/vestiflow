import { Routes } from '@angular/router';

import { SupplierOrderDetailComponent } from './supplier-order-detail.component';
import { SupplierOrderListComponent } from './supplier-order-list.component';

export const ordersRoutes: Routes = [
  { path: '', title: 'VestiFlow · Ordini Fornitori', component: SupplierOrderListComponent },
  {
    path: ':id',
    title: 'VestiFlow · Dettaglio ordine fornitore',
    component: SupplierOrderDetailComponent,
  },
];
