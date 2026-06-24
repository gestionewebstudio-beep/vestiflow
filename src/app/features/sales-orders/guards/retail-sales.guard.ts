import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';

import { AuthService } from '@core/auth';
import {
  TenantChannelProfile,
  showRetailSalesRegister,
} from '@core/models/tenant-channel-profile.model';

/** Route vendita al banco: tutti i profili canale (gestionale, Shopify, TikTok). */
export const retailSalesRegisterGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (showRetailSalesRegister(auth.currentUser()?.tenantChannelProfile)) {
    return true;
  }

  return router.createUrlTree(['/app/sales']);
};

/** Storico vendite Shopify: reindirizza il profilo gestionale al banco. */
export const salesHistoryGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const profile = auth.currentUser()?.tenantChannelProfile;

  if (profile !== TenantChannelProfile.Gestionale) {
    return true;
  }

  return router.createUrlTree(['/app/sales/register']);
};

/** @deprecated Usare retailSalesRegisterGuard */
export const gestionaleRetailGuard = retailSalesRegisterGuard;
