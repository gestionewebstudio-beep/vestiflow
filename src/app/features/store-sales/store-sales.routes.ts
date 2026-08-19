import { Routes } from '@angular/router';

import { retailSalesRegisterGuard } from '@core/guards/retail-sales.guard';
import { unsavedChangesGuard } from '@core/guards/unsaved-changes.guard';

import {
  STORE_SALE_MODE_ROUTE_DATA_KEY,
  STORE_SALE_ROUTE_SEGMENT,
} from '@domain/store-sales/models/store-sale-routing.util';

/**
 * Le due creazioni della Vendita al banco, montate dal composition root
 * (`app.routes.ts`) sotto `/app/vendita-al-banco`.
 *
 * ⛔ **Due voci di rotta distinte, un solo componente.** Il modo iniziale arriva
 * dai `data:` — è il pattern già usato dalla famiglia Fattura con
 * `salesDocumentType` — e `requireStoreSaleMode` lancia se manca: i due modi
 * hanno effetti di magazzino opposti, e un fallback silenzioso farebbe
 * compilare una vendita a chi ha aperto un reso.
 *
 * ⚠️ **Perché DUE rotte e non una con un parametro.** Solo così
 * `TabRouteReuseStrategy.shouldReuseRoute` (che confronta `routeConfig`) vede
 * due configurazioni diverse e **ricrea il componente**: con una sola rotta
 * l'istanza sarebbe riusata e il modo non cambierebbe. Ne discende anche che
 * `unsavedChangesGuard` scatta passando dall'una all'altra — voluto, `11`.
 *
 * ⚠️ **Entrambe le guardie su ENTRAMBE le rotte.** Se una perde
 * `retailSalesRegisterGuard` la cassa si apre a chi non ha `retail.register`;
 * se perde `unsavedChangesGuard` si esce da un carrello in corso senza
 * conferma. Sono quattro dichiarazioni, e nessuna è ridondante.
 */
export const storeSalesRegisterRoutes: Routes = [
  {
    path: STORE_SALE_ROUTE_SEGMENT.sale,
    title: 'Nuova vendita al banco',
    canActivate: [retailSalesRegisterGuard],
    canDeactivate: [unsavedChangesGuard],
    data: { [STORE_SALE_MODE_ROUTE_DATA_KEY]: 'sale' },
    loadComponent: () =>
      import('./store-sale-register.component').then((m) => m.StoreSaleRegisterComponent),
  },
  {
    path: STORE_SALE_ROUTE_SEGMENT.return,
    title: 'Nuovo reso al banco',
    canActivate: [retailSalesRegisterGuard],
    canDeactivate: [unsavedChangesGuard],
    data: { [STORE_SALE_MODE_ROUTE_DATA_KEY]: 'return' },
    loadComponent: () =>
      import('./store-sale-register.component').then((m) => m.StoreSaleRegisterComponent),
  },
];
