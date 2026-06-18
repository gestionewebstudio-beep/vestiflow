import { Routes } from '@angular/router';

import { InventoryCountDetailComponent } from './inventory-count-detail.component';
import { InventoryCountListComponent } from './inventory-count-list.component';
import { InventoryCountNewComponent } from './inventory-count-new.component';
import { InventoryImportComponent } from './inventory-import.component';
import { InventoryLevelsComponent } from './inventory-levels.component';
import { MovementFormComponent } from './movement-form.component';
import { StockLookupComponent } from './stock-lookup.component';
import { StockMovementsComponent } from './stock-movements.component';

export const inventoryRoutes: Routes = [
  { path: '', title: 'VestiFlow · Magazzino', component: InventoryLevelsComponent },
  {
    path: 'lookup',
    title: 'VestiFlow · Cerca giacenza',
    component: StockLookupComponent,
  },
  {
    path: 'movements',
    title: 'VestiFlow · Movimenti di magazzino',
    component: StockMovementsComponent,
  },
  {
    path: 'movements/new',
    title: 'VestiFlow · Registra movimento',
    component: MovementFormComponent,
  },
  {
    path: 'import',
    title: 'VestiFlow · Importa giacenze CSV',
    component: InventoryImportComponent,
  },
  {
    path: 'counts/new',
    title: 'VestiFlow · Nuovo inventario fisico',
    component: InventoryCountNewComponent,
  },
  {
    path: 'counts/:id',
    title: 'VestiFlow · Inventario fisico',
    component: InventoryCountDetailComponent,
  },
  {
    path: 'counts',
    title: 'VestiFlow · Inventario fisico',
    component: InventoryCountListComponent,
  },
];
