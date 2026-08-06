import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';

import { AuthService } from '@core/auth';
import {
  isPlatformOperator,
  PLATFORM_OPERATOR_HOME,
} from '@core/permissions/platform-operator.util';

/**
 * Blocca l'accesso al gestionale negozio per gli operatori piattaforma.
 * Reindirizza all'area provisioning clienti.
 */
export const tenantWorkspaceGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (isPlatformOperator(auth.currentUser())) {
    return router.createUrlTree([PLATFORM_OPERATOR_HOME]);
  }

  return true;
};
