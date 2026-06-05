import { HttpContextToken, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize } from 'rxjs';

import { LoadingService } from '@core/services/loading.service';

/**
 * Opt-out dal loading globale per singola richiesta.
 * Uso lato chiamante:
 *   http.get(url, { context: new HttpContext().set(SKIP_LOADING, true) });
 */
export const SKIP_LOADING = new HttpContextToken<boolean>(() => false);

/**
 * Incrementa/decrementa il contatore globale attorno a ogni richiesta.
 * `finalize` garantisce il decremento su successo, errore e cancellazione.
 */
export const loadingInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.context.get(SKIP_LOADING)) {
    return next(req);
  }

  const loading = inject(LoadingService);
  loading.start();

  return next(req).pipe(finalize(() => loading.stop()));
};
