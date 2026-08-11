import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';

import { AuthService } from '@core/auth';
import { TenantChannelProfile } from '@core/models/tenant-channel-profile.model';
import { canOpenRetailRegister } from '@core/permissions/tenant-permissions.util';

/** Route vendita al banco: canale + sezione Vendite + permesso retail.register. */
export const retailSalesRegisterGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const user = auth.currentUser();

  if (canOpenRetailRegister(user)) {
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
