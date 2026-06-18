import { Routes } from '@angular/router';

import { tenantRoleGuard } from '@core/guards/tenant-role.guard';
import { unsavedChangesGuard } from '@core/guards/unsaved-changes.guard';
import { TENANT_ROUTE_PERMISSION_KEY } from '@core/permissions/tenant-permissions.util';

import { ProductDetailComponent } from './product-detail.component';
import { ProductFormComponent } from './product-form.component';
import { ProductImportComponent } from './product-import.component';
import { ProductListComponent } from './product-list.component';

// ProductService e' providedIn 'root' (catalogo condiviso cross-feature).
export const productsRoutes: Routes = [
  {
    path: '',
    children: [
      { path: '', title: 'VestiFlow · Prodotti', component: ProductListComponent },
      // 'new' prima di ':id' per non interpretarlo come identificativo.
      {
        path: 'new',
        title: 'VestiFlow · Nuovo prodotto',
        component: ProductFormComponent,
        canActivate: [tenantRoleGuard],
        data: { [TENANT_ROUTE_PERMISSION_KEY]: 'manager' },
        canDeactivate: [unsavedChangesGuard],
      },
      {
        path: 'import',
        title: 'VestiFlow · Importa prodotti CSV',
        component: ProductImportComponent,
        canActivate: [tenantRoleGuard],
        data: { [TENANT_ROUTE_PERMISSION_KEY]: 'manager' },
      },
      { path: ':id', title: 'VestiFlow · Dettaglio prodotto', component: ProductDetailComponent },
      {
        path: ':id/edit',
        title: 'VestiFlow · Modifica prodotto',
        component: ProductFormComponent,
        canActivate: [tenantRoleGuard],
        data: { [TENANT_ROUTE_PERMISSION_KEY]: 'manager' },
        canDeactivate: [unsavedChangesGuard],
      },
    ],
  },
];
