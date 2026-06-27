import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';

import { AuthService } from '@core/auth';
import {
  TenantChannelProfile,
  showOnlineSalesRegister,
  showRetailSalesRegister,
} from '@core/models/tenant-channel-profile.model';
import {
  canRegisterOnlineSales,
  canRegisterRetailSales,
} from '@core/permissions/tenant-permissions.util';

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

/** Route vendita online: profilo canale + permesso retail.register_online. */
export const onlineSalesRegisterGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const user = auth.currentUser();

  if (showOnlineSalesRegister(user?.tenantChannelProfile) && canRegisterOnlineSales(user)) {
    return true;
  }

  return router.createUrlTree(['/app/dashboard']);
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
