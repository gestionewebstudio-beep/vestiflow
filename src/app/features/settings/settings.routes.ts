import { Routes } from '@angular/router';

// Unica feature di business senza tenantPermissionGuard: oggi codici-iva e
// pagamenti sono raggiungibili da ogni utente autenticato del tenant. Il gate
// candidato è TenantPermission.SettingsCompany («preferenze generali del
// negozio»), ma escluderebbe i manager: applicarlo è una scelta di prodotto,
// non un dettaglio tecnico — finché non viene presa, l'apertura è documentata.
export const settingsRoutes: Routes = [
  {
    path: '',
    title: 'Impostazioni',
    loadComponent: () => import('./settings.component').then((m) => m.SettingsComponent),
  },
  {
    path: 'codici-iva',
    title: 'Codici IVA',
    loadComponent: () =>
      import('./pages/vat-codes/vat-codes-page.component').then((m) => m.VatCodesPageComponent),
  },
  {
    path: 'pagamenti',
    title: 'Pagamenti',
    loadComponent: () =>
      import('./pages/payment-options/payment-options-page.component').then(
        (m) => m.PaymentOptionsPageComponent,
      ),
  },
];
