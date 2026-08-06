import { Routes } from '@angular/router';

import { tenantPermissionGuard } from '@core/guards/tenant-permission.guard';
import { unsavedChangesGuard } from '@core/guards/unsaved-changes.guard';
import { TenantPermission } from '@core/models/tenant-permission.model';
import {
  CATALOG_SECTION_PERMISSIONS,
  REQUIRED_TENANT_PERMISSIONS_KEY,
} from '@core/permissions/tenant-permissions.util';

// ProductService e' providedIn 'root' (catalogo condiviso cross-feature).
export const productsRoutes: Routes = [
  {
    path: '',
    title: 'Prodotti',
    loadComponent: () => import('./product-list.component').then((m) => m.ProductListComponent),
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: CATALOG_SECTION_PERMISSIONS, reuse: true },
  },
  {
    path: 'new',
    title: 'Anagrafica prodotto',
    loadComponent: () =>
      import('@domain/products/product-form.component').then((m) => m.ProductFormComponent),
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.CatalogManage },
    canDeactivate: [unsavedChangesGuard],
  },
  {
    path: 'import',
    title: 'Importa prodotti CSV',
    loadComponent: () => import('./product-import.component').then((m) => m.ProductImportComponent),
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.CatalogImportExport },
  },
  {
    path: ':id/print-label',
    title: 'Stampa etichetta',
    loadComponent: () =>
      import('./product-label-print.component').then((m) => m.ProductLabelPrintComponent),
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: CATALOG_SECTION_PERMISSIONS },
  },
  {
    path: ':id',
    title: 'Dettaglio prodotto',
    loadComponent: () => import('./product-detail.component').then((m) => m.ProductDetailComponent),
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: CATALOG_SECTION_PERMISSIONS },
  },
  {
    path: ':id/edit',
    title: 'Anagrafica prodotto',
    loadComponent: () =>
      import('@domain/products/product-form.component').then((m) => m.ProductFormComponent),
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.CatalogManage },
    canDeactivate: [unsavedChangesGuard],
  },
];
