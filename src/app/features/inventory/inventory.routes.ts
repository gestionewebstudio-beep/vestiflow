import { Routes } from '@angular/router';

import { tenantRoleGuard } from '@core/guards/tenant-role.guard';
import { TENANT_ROUTE_PERMISSION_KEY } from '@core/permissions/tenant-permissions.util';

export const inventoryRoutes: Routes = [
  {
    path: '',
    title: 'VestiFlow · Magazzino',
    loadComponent: () =>
      import('./inventory-levels.component').then((m) => m.InventoryLevelsComponent),
  },
  {
    path: 'lookup',
    title: 'VestiFlow · Cerca giacenza',
    loadComponent: () => import('./stock-lookup.component').then((m) => m.StockLookupComponent),
  },
  {
    path: 'movements',
    title: 'VestiFlow · Movimenti di magazzino',
    loadComponent: () =>
      import('./stock-movements.component').then((m) => m.StockMovementsComponent),
  },
  {
    path: 'movements/new',
    title: 'VestiFlow · Registra movimento',
    loadComponent: () => import('./movement-form.component').then((m) => m.MovementFormComponent),
  },
  {
    path: 'import',
    title: 'VestiFlow · Importa giacenze CSV',
    loadComponent: () =>
      import('./inventory-import.component').then((m) => m.InventoryImportComponent),
    canActivate: [tenantRoleGuard],
    data: { [TENANT_ROUTE_PERMISSION_KEY]: 'manager' },
  },
  {
    path: 'counts/new',
    title: 'VestiFlow · Nuovo inventario fisico',
    loadComponent: () =>
      import('./inventory-count-new.component').then((m) => m.InventoryCountNewComponent),
  },
  {
    path: 'counts/:id',
    title: 'VestiFlow · Inventario fisico',
    loadComponent: () =>
      import('./inventory-count-detail.component').then((m) => m.InventoryCountDetailComponent),
  },
  {
    path: 'counts',
    title: 'VestiFlow · Inventario fisico',
    loadComponent: () =>
      import('./inventory-count-list.component').then((m) => m.InventoryCountListComponent),
  },
];
