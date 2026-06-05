import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';

import { AuthService } from './auth.service';

/**
 * Protegge le route applicative (/app). UX, non sicurezza reale: la vera
 * autorizzazione resta server-side. Se non autenticato, redirige al login
 * conservando l'URL richiesto in `returnUrl` (sempre interno).
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) {
    return true;
  }

  return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};
