import { Routes } from '@angular/router';

import { CustomerDetailComponent } from './customer-detail.component';
import { CustomerListComponent } from './customer-list.component';

export const customersRoutes: Routes = [
  { path: '', title: 'VestiFlow · Clienti', component: CustomerListComponent },
  { path: ':id', title: 'VestiFlow · Dettaglio cliente', component: CustomerDetailComponent },
];
