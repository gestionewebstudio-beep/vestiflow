import { Routes } from '@angular/router';

import { retailSalesRegisterGuard } from '@core/guards/retail-sales.guard';
import { unsavedChangesGuard } from '@core/guards/unsaved-changes.guard';

// Montata dal composition root (app.routes.ts) sotto /app/sales/register:
// la cassa appartiene a questa feature, il path all'area Vendite.
export const storeSalesRegisterRoutes: Routes = [
  {
    path: '',
    title: 'Vendita al banco',
    canActivate: [retailSalesRegisterGuard],
    // Uscita con carrello/reso in corso: conferma a tre scelte (salva, esci,
    // annulla) delegata al componente tramite CanComponentDeactivate.
    canDeactivate: [unsavedChangesGuard],
    // Fase 3 §7: cassa a carrello (sostituisce lo scan singolo per il negozio).
    loadComponent: () =>
      import('./store-sale-register.component').then((m) => m.StoreSaleRegisterComponent),
  },
];
