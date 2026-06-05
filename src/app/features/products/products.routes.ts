import { Routes } from '@angular/router';

import { ProductDetailComponent } from './product-detail.component';
import { ProductListComponent } from './product-list.component';

export const productsRoutes: Routes = [
  { path: '', title: 'VestiFlow · Prodotti', component: ProductListComponent },
  { path: ':id', title: 'VestiFlow · Dettaglio prodotto', component: ProductDetailComponent },
];
