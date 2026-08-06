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

/**
 * Ordini cliente: registro generale multicanale (fase 3 §2), accessibile a
 * tutti i profili canale. L'utente deve essere autenticato (guard permessi
 * a valle verifica reports.view).
 */
export const salesHistoryGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.currentUser()) {
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
