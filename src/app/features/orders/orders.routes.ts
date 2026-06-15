import { Routes } from '@angular/router';

import { SupplierOrderDetailComponent } from './supplier-order-detail.component';
import { SupplierOrderFormComponent } from './supplier-order-form.component';
import { SupplierOrderListComponent } from './supplier-order-list.component';

export const ordersRoutes: Routes = [
  { path: '', title: 'VestiFlow · Ordini Fornitori', component: SupplierOrderListComponent },
  {
    path: 'new',
    title: 'VestiFlow · Nuovo ordine fornitore',
    component: SupplierOrderFormComponent,
  },
  {
    path: ':id',
    title: 'VestiFlow · Dettaglio ordine fornitore',
    component: SupplierOrderDetailComponent,
  },
];
