import { Routes } from '@angular/router';

import { tenantRoleGuard } from '@core/guards/tenant-role.guard';
import { unsavedChangesGuard } from '@core/guards/unsaved-changes.guard';
import { TENANT_ROUTE_PERMISSION_KEY } from '@core/permissions/tenant-permissions.util';

// ProductService e' providedIn 'root' (catalogo condiviso cross-feature).
export const productsRoutes: Routes = [
  {
    path: '',
    children: [
      {
        path: '',
        title: 'VestiFlow · Prodotti',
        loadComponent: () => import('./product-list.component').then((m) => m.ProductListComponent),
      },
      {
        path: 'new',
        title: 'VestiFlow · Nuovo prodotto',
        loadComponent: () => import('./product-form.component').then((m) => m.ProductFormComponent),
        canActivate: [tenantRoleGuard],
        data: { [TENANT_ROUTE_PERMISSION_KEY]: 'manager' },
        canDeactivate: [unsavedChangesGuard],
      },
      {
        path: 'import',
        title: 'VestiFlow · Importa prodotti CSV',
        loadComponent: () =>
          import('./product-import.component').then((m) => m.ProductImportComponent),
        canActivate: [tenantRoleGuard],
        data: { [TENANT_ROUTE_PERMISSION_KEY]: 'manager' },
      },
      {
        path: ':id/print-label',
        title: 'VestiFlow · Stampa etichetta',
        loadComponent: () =>
          import('./product-label-print.component').then((m) => m.ProductLabelPrintComponent),
      },
      {
        path: ':id',
        title: 'VestiFlow · Dettaglio prodotto',
        loadComponent: () =>
          import('./product-detail.component').then((m) => m.ProductDetailComponent),
      },
      {
        path: ':id/edit',
        title: 'VestiFlow · Modifica prodotto',
        loadComponent: () => import('./product-form.component').then((m) => m.ProductFormComponent),
        canActivate: [tenantRoleGuard],
        data: { [TENANT_ROUTE_PERMISSION_KEY]: 'manager' },
        canDeactivate: [unsavedChangesGuard],
      },
    ],
  },
];
