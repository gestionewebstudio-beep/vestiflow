import { Routes } from '@angular/router';

import { shopifySettingsGuard } from '@core/guards/shopify-settings.guard';
import { tenantOwnerGuard } from '@core/guards/tenant-owner.guard';
import { tenantPermissionGuard } from '@core/guards/tenant-permission.guard';
import { unsavedChangesGuard } from '@core/guards/unsaved-changes.guard';
import { TenantPermission } from '@core/models/tenant-permission.model';
import { REQUIRED_TENANT_PERMISSIONS_KEY } from '@core/permissions/tenant-permissions.util';

// La vecchia apertura senza gate (decisione documentata) è stata risolta dal
// modello «sezioni + documenti» (2026-08-11): la sezione Impostazioni è una
// chiave (`section.settings`), concessa a tutti gli utenti storici dalla
// migration e presente in ogni preset di ruolo — il titolare può revocarla.
export const settingsRoutes: Routes = [
  {
    path: '',
    title: 'Impostazioni',
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.SectionSettings },
    loadComponent: () => import('./settings.component').then((m) => m.SettingsComponent),
  },
  {
    path: 'codici-iva',
    title: 'Codici IVA',
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.SectionSettings },
    loadComponent: () =>
      import('./pages/vat-codes/vat-codes-page.component').then((m) => m.VatCodesPageComponent),
  },
  {
    path: 'pagamenti',
    title: 'Pagamenti',
    canActivate: [tenantPermissionGuard],
    data: { [REQUIRED_TENANT_PERMISSIONS_KEY]: TenantPermission.SectionSettings },
    loadComponent: () =>
      import('./pages/payment-options/payment-options-page.component').then(
        (m) => m.PaymentOptionsPageComponent,
      ),
  },
  {
    // ⭐ La sola sede dei comandi generali Shopify (11/09/2026). Guardia propria:
    // la raggiunge chi ha il permesso di almeno un comando, senza
    // `section.settings` — che apre il resto delle Impostazioni e qui non
    // c'entra. Ogni comando tiene il proprio cancello sull'API.
    //
    // ⛔ Non è una seconda rotta con lo stesso componente: era così, e passare da
    //    `shopify` a `shopify/:scheda` RICREAVA la pagina — il banner del ritorno
    //    OAuth (`?shopify=setup`) nasceva nella prima istanza e moriva con lei
    //    (misurato in `prima-connessione.spec`, 13/09/2026). Il segmento «auto»
    //    dice al pannello «scegli tu la scheda per lo stato», e la sostituisce.
    path: 'shopify',
    pathMatch: 'full',
    redirectTo: 'shopify/auto',
  },
  {
    // ⭐ Le cinque SCHEDE della pagina Shopify (`docs/29` §3, deciso il 13/09/2026):
    //    prima-connessione · sincronizzazione · operazioni · problemi · connessione.
    //    Il segmento dice quale scheda è aperta, così le schede condivise
    //    (`app-nav-tabs`) si evidenziano dalla rotta; «auto» è la predefinita.
    path: 'shopify/:scheda',
    title: 'Shopify',
    canActivate: [shopifySettingsGuard],
    loadComponent: () =>
      import('./pages/shopify/shopify-settings-page.component').then(
        (m) => m.ShopifySettingsPageComponent,
      ),
  },
  {
    // Riservata al titolare, come «Utenti»: è l'identità fiscale dell'azienda,
    // non una preferenza operativa (2026-08-14). Il confine vero è il
    // TenantOwnerGuard dell'API.
    path: 'azienda',
    title: 'Dati azienda',
    canActivate: [tenantOwnerGuard],
    canDeactivate: [unsavedChangesGuard],
    loadComponent: () =>
      import('./pages/company/company-page.component').then((m) => m.CompanyPageComponent),
  },
  {
    // Riservata al titolare per scelta di prodotto (2026-08-11). Il confine
    // vero è il TenantOwnerGuard dell'API.
    path: 'utenti',
    title: 'Utenti',
    canActivate: [tenantOwnerGuard],
    loadComponent: () =>
      import('./pages/users/users-page.component').then((m) => m.UsersPageComponent),
  },
];
