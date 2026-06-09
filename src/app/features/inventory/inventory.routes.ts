import { Routes } from '@angular/router';

import { InventoryLevelsComponent } from './inventory-levels.component';
import { MovementFormComponent } from './movement-form.component';
import { StockMovementsComponent } from './stock-movements.component';

export const inventoryRoutes: Routes = [
  { path: '', title: 'VestiFlow · Magazzino', component: InventoryLevelsComponent },
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
];
