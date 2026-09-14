import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';

import { AuthService } from '@core/auth';
import { canReachShopifySettings } from '@core/permissions/tenant-permissions.util';

/**
 * Impostazioni → Shopify: la pagina dei comandi generali di sincronizzazione.
 *
 * ⭐ Passa chi ha il permesso di almeno UN comando (o gestisce la connessione),
 * su un tenant con Shopify nel profilo — senza pretendere `section.settings`,
 * che apre il resto delle Impostazioni e qui non c’entra. È solo UX: ogni
 * comando ha il proprio cancello sull’API.
 */
export const shopifySettingsGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (canReachShopifySettings(auth.currentUser())) {
    return true;
  }
  return router.createUrlTree(['/app/dashboard']);
};
