import { Routes } from '@angular/router';

import { retailSalesRegisterGuard } from '@core/guards/retail-sales.guard';
import { unsavedChangesGuard } from '@core/guards/unsaved-changes.guard';

import {
  STORE_SALE_EDIT_SEGMENT,
  STORE_SALE_MODE_ROUTE_DATA_KEY,
  STORE_SALE_ROUTE_SEGMENT,
} from '@domain/store-sales/models/store-sale-routing.util';

/**
 * Le rotte della Vendita al banco, montate dal composition root
 * (`app.routes.ts`) sotto `/app/vendita-al-banco`.
 *
 * ⭐ **Dal 21/08/2026 portano alla maschera documentale nuova**
 * (`StoreSaleDocumentFormComponent`): testata con sede, cliente, data, numero e
 * serie, righe sulle celle comuni, netto/ivato, piede con totali e note. La
 * vecchia `StoreSaleRegisterComponent` — il carrello — è stata eliminata con lo
 * stesso commit: non aveva altri consumatori.
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
      import('./store-sale-document-form.component').then((m) => m.StoreSaleDocumentFormComponent),
  },
  {
    path: STORE_SALE_ROUTE_SEGMENT.return,
    title: 'Nuovo reso al banco',
    canActivate: [retailSalesRegisterGuard],
    canDeactivate: [unsavedChangesGuard],
    data: { [STORE_SALE_MODE_ROUTE_DATA_KEY]: 'return' },
    loadComponent: () =>
      import('./store-sale-document-form.component').then((m) => m.StoreSaleDocumentFormComponent),
  },
  // ── Modifica di un documento esistente (`11` C 3b) ──────────────────────
  //
  // ⛔ STESSO componente e STESSE guardie della creazione: la maschera è una,
  // e ciò che cambia è che parte da un documento invece che da zero.
  //
  // ⚠️ Il tipo sta nei `data` anche qui, e NON si deduce dal documento
  // caricato: è la regola comune, nata dal difetto misurato in `07` §18 —
  // finché la rotta di modifica era una sola e senza tipo, la maschera si
  // comportava da proforma fino alla risposta della lettura.
  {
    path: `${STORE_SALE_EDIT_SEGMENT.sale}/:id/edit`,
    title: 'Modifica vendita al banco',
    canActivate: [retailSalesRegisterGuard],
    canDeactivate: [unsavedChangesGuard],
    data: { [STORE_SALE_MODE_ROUTE_DATA_KEY]: 'sale' },
    loadComponent: () =>
      import('./store-sale-document-form.component').then((m) => m.StoreSaleDocumentFormComponent),
  },
  {
    path: `${STORE_SALE_EDIT_SEGMENT.return}/:id/edit`,
    title: 'Modifica reso al banco',
    canActivate: [retailSalesRegisterGuard],
    canDeactivate: [unsavedChangesGuard],
    data: { [STORE_SALE_MODE_ROUTE_DATA_KEY]: 'return' },
    loadComponent: () =>
      import('./store-sale-document-form.component').then((m) => m.StoreSaleDocumentFormComponent),
  },
];
