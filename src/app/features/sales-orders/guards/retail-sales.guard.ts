import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';

import { AuthService } from '@core/auth';
import { TenantChannelProfile } from '@core/models/tenant-channel-profile.model';

/** Route vendita al banco: solo tenant con profilo solo gestionale. */
export const gestionaleRetailGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const profile = auth.currentUser()?.tenantChannelProfile;

  if (profile === TenantChannelProfile.Gestionale) {
    return true;
  }

  return router.createUrlTree(['/app/sales']);
};

/** Storico vendite Shopify/TikTok: reindirizza il profilo gestionale al banco. */
export const salesHistoryGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const profile = auth.currentUser()?.tenantChannelProfile;

  if (profile !== TenantChannelProfile.Gestionale) {
    return true;
  }

  return router.createUrlTree(['/app/sales/register']);
};
