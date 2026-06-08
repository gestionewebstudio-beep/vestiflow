import { Routes } from '@angular/router';

import { unsavedChangesGuard } from '@core/guards/unsaved-changes.guard';

import { ProductService } from './services/product.service';
import { ProductDetailComponent } from './product-detail.component';
import { ProductFormComponent } from './product-form.component';
import { ProductListComponent } from './product-list.component';

export const productsRoutes: Routes = [
  {
    path: '',
    // ProductService scoped alla feature prodotti (fuori dal bundle root).
    providers: [ProductService],
    children: [
      { path: '', title: 'VestiFlow · Prodotti', component: ProductListComponent },
      // 'new' prima di ':id' per non interpretarlo come identificativo.
      {
        path: 'new',
        title: 'VestiFlow · Nuovo prodotto',
        component: ProductFormComponent,
        canDeactivate: [unsavedChangesGuard],
      },
      { path: ':id', title: 'VestiFlow · Dettaglio prodotto', component: ProductDetailComponent },
      {
        path: ':id/edit',
        title: 'VestiFlow · Modifica prodotto',
        component: ProductFormComponent,
        canDeactivate: [unsavedChangesGuard],
      },
    ],
  },
];
