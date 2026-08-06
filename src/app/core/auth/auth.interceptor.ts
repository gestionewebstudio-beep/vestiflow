import { DOCUMENT } from '@angular/common';
import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { switchMap, take } from 'rxjs';

import { APP_CONFIG } from '@core/config/app-config.token';
import { isApiRequest } from '@core/http/api-url.util';

import { AuthService } from './auth.service';

/**
 * Allega `Authorization: Bearer <token>` SOLO alle richieste verso l'origine
 * fidata (apiBaseUrl). Token letto on-demand dal layer auth, mai persistito.
 * Nessun refresh, nessun redirect: solo aggiunta dell'header quando lecito.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const config = inject(APP_CONFIG);
  const auth = inject(AuthService);
  const document = inject(DOCUMENT);

  if (!isApiRequest(req.url, config.apiBaseUrl, document)) {
    return next(req);
  }

  return auth.getToken().pipe(
    take(1),
    switchMap((token) => {
      if (!token) {
        // Token assente: la richiesta prosegue senza header (degrada bene).
        return next(req);
      }
      const authReq = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
      return next(authReq);
    }),
  );
};
