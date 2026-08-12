import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';

import { AuthService } from '@core/auth';
import { hasFullTenantAccess } from '@core/permissions/user-permissions.util';

/**
 * Rotte riservate al titolare (es. Impostazioni → Utenti). È solo UX: il
 * confine vero è il TenantOwnerGuard dell'API. Le sessioni assistenza passano
 * (hasFullTenantAccess le include).
 */
export const tenantOwnerGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (hasFullTenantAccess(auth.currentUser())) {
    return true;
  }
  return router.createUrlTree(['/app/settings']);
};
