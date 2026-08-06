import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';

import { AuthService } from '@core/auth';

/** Protegge le route di provisioning clienti (solo operatori piattaforma). */
export const platformAdminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.currentUser()?.isPlatformAdmin) {
    return true;
  }

  return router.createUrlTree(['/app/dashboard']);
};
