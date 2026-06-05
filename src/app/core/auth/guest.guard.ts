import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';

import { AuthService } from './auth.service';

/**
 * Tiene gli utenti gia' autenticati fuori dalle route "guest" (es. /login),
 * reindirizzandoli alla dashboard. Evita di mostrare il login a chi e' loggato.
 */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) {
    return router.createUrlTree(['/app/dashboard']);
  }

  return true;
};
