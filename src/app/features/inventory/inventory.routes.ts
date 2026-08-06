import { Routes } from '@angular/router';

import { tenantPermissionGuard } from '@core/guards/tenant-permission.guard';
import { unsavedChangesGuard } from '@core/guards/unsaved-changes.guard';
import { TenantPermission } from '@core/models/tenant-permission.model';
import {
  INVENTORY_SECTION_PERMISSIONS,
  REQUIRED_TENANT_PERMISSIONS_KEY,
} from '@core/permissions/tenant-permissions.util';

export const inventoryRoutes: Routes = [
  {
    path: '',
    title: 'Magazzino',
    loadComponent: () =>
      import('./inventory-levels.component').then((m) => m.InventoryLevelsComponent),
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: INVENTORY_SECTION_PERMISSIONS, reuse: true },
  },
  {
    path: 'situation',
    title: 'Situazione magazzino',
    loadComponent: () =>
      import('./inventory-situation.component').then((m) => m.InventorySituationComponent),
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: INVENTORY_SECTION_PERMISSIONS, reuse: true },
  },
  {
    path: 'lookup',
    title: 'Cerca giacenza',
    loadComponent: () => import('./stock-lookup.component').then((m) => m.StockLookupComponent),
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: INVENTORY_SECTION_PERMISSIONS, reuse: true },
  },
  {
    path: 'movements',
    title: 'Movimenti di magazzino',
    loadComponent: () =>
      import('./stock-movements.component').then((m) => m.StockMovementsComponent),
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: INVENTORY_SECTION_PERMISSIONS, reuse: true },
  },
  {
    path: 'movements/new',
    title: 'Registra movimento',
    loadComponent: () => import('./movement-form.component').then((m) => m.MovementFormComponent),
    canActivate: [tenantPermissionGuard],
    canDeactivate: [unsavedChangesGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.InventoryManage },
  },
  {
    path: 'import',
    title: 'Importa giacenze CSV',
    loadComponent: () =>
      import('./inventory-import.component').then((m) => m.InventoryImportComponent),
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.InventoryImportExport },
  },
  {
    path: 'counts/new',
    title: 'Nuovo inventario',
    loadComponent: () =>
      import('./inventory-count-new.component').then((m) => m.InventoryCountNewComponent),
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.InventoryManage },
  },
  {
    path: 'counts/:id',
    title: 'Dettaglio inventario',
    loadComponent: () =>
      import('./inventory-count-detail.component').then((m) => m.InventoryCountDetailComponent),
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.InventoryManage },
  },
  {
    path: 'counts',
    title: 'Inventario',
    loadComponent: () =>
      import('./inventory-count-list.component').then((m) => m.InventoryCountListComponent),
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.InventoryManage, reuse: true },
  },
];
