import { Routes } from '@angular/router';

import { SalesOrderDetailComponent } from './sales-order-detail.component';
import { SalesOrderListComponent } from './sales-order-list.component';

export const salesOrdersRoutes: Routes = [
  { path: '', title: 'VestiFlow · Vendite', component: SalesOrderListComponent },
  { path: ':id', title: 'VestiFlow · Dettaglio vendita', component: SalesOrderDetailComponent },
];
