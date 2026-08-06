import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';

import { AuthService } from '@core/auth';
import {
  TenantChannelProfile,
  showRetailSalesRegister,
} from '@core/models/tenant-channel-profile.model';
import { canRegisterRetailSales, canViewReports } from '@core/permissions/tenant-permissions.util';

/** Route vendita al banco: profilo canale + permesso retail.register. */
export const retailSalesRegisterGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const user = auth.currentUser();

  if (showRetailSalesRegister(user?.tenantChannelProfile) && canRegisterRetailSales(user)) {
    return true;
  }

  return router.createUrlTree(['/app/dashboard']);
};

/**
 * Chiusure di cassa: stesse sedi della cassa, ma la consultazione spetta
 * anche a chi legge i report (il titolare che controlla le differenze).
 */
export const cashSessionsGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const user = auth.currentUser();

  if (
    showRetailSalesRegister(user?.tenantChannelProfile) &&
    (canRegisterRetailSales(user) || canViewReports(user))
  ) {
    return true;
  }

  return router.createUrlTree(['/app/dashboard']);
};

/** Ordini Shopify (fase 3 §3): solo profilo canale Shopify. */
export const shopifyOrdersGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const profile = auth.currentUser()?.tenantChannelProfile;

  if (profile === TenantChannelProfile.Shopify) {
    return true;
  }

  return router.createUrlTree(['/app/sales']);
};
