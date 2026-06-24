import { Routes } from '@angular/router';

import { retailSalesRegisterGuard, salesHistoryGuard } from './guards/retail-sales.guard';
import { SalesOrderDetailComponent } from './sales-order-detail.component';
import { SalesOrderListComponent } from './sales-order-list.component';

export const salesOrdersRoutes: Routes = [
  {
    path: '',
    title: 'VestiFlow · Vendite',
    component: SalesOrderListComponent,
    canActivate: [salesHistoryGuard],
  },
  {
    path: 'register',
    title: 'VestiFlow · Registra vendita',
    canActivate: [retailSalesRegisterGuard],
    loadComponent: () =>
      import('./retail-sale-register.component').then((m) => m.RetailSaleRegisterComponent),
  },
  {
    path: ':id',
    title: 'VestiFlow · Dettaglio vendita',
    component: SalesOrderDetailComponent,
    canActivate: [salesHistoryGuard],
  },
];
