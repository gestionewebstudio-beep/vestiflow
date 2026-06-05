import { Routes } from '@angular/router';

import { ProductService } from './services/product.service';
import { ProductDetailComponent } from './product-detail.component';
import { ProductListComponent } from './product-list.component';

export const productsRoutes: Routes = [
  {
    path: '',
    // ProductService scoped alla feature prodotti (fuori dal bundle root).
    providers: [ProductService],
    children: [
      { path: '', title: 'VestiFlow · Prodotti', component: ProductListComponent },
      { path: ':id', title: 'VestiFlow · Dettaglio prodotto', component: ProductDetailComponent },
    ],
  },
];
