import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';

import { AuthService } from '@core/auth';

/**
 * La password iniziale l'ha scelta chi ha creato l'account: finché l'utente
 * non la cambia, l'app lo porta alla pagina dedicata invece che alla shell.
 * È un promemoria vincolante lato UX, non un confine di sicurezza.
 */
export const mustChangePasswordGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.currentUser()?.mustChangePassword === true) {
    return router.createUrlTree(['/cambia-password']);
  }
  return true;
};
