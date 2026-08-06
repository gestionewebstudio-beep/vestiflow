import { Routes } from '@angular/router';

export const settingsRoutes: Routes = [
  {
    path: '',
    title: 'VestiFlow · Impostazioni',
    loadComponent: () => import('./settings.component').then((m) => m.SettingsComponent),
  },
  {
    path: 'codici-iva',
    title: 'VestiFlow · Codici IVA',
    loadComponent: () =>
      import('./pages/vat-codes/vat-codes-page.component').then((m) => m.VatCodesPageComponent),
  },
  {
    path: 'pagamenti',
    title: 'VestiFlow · Pagamenti',
    loadComponent: () =>
      import('./pages/payment-options/payment-options-page.component').then(
        (m) => m.PaymentOptionsPageComponent,
      ),
  },
];
