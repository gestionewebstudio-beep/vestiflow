import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';

import { AppErrorKind } from '@core/models';
import { ObservabilityService } from '@core/services/observability.service';
import { mapHttpErrorToAppError } from './http-error.mapper';

// Errori da tracciare in observability (gli altri 4xx sono attesi → niente rumore).
const TRACKED_KINDS = new Set<AppErrorKind>([
  AppErrorKind.Server,
  AppErrorKind.Network,
  AppErrorKind.Unknown,
]);

/**
 * Normalizza gli errori HTTP in AppError e li rilancia (non li inghiotte).
 * Nessun redirect ne' notifica UI: la decisione resta ai componenti/feature.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const observability = inject(ObservabilityService);

  return next(req).pipe(
    catchError((error: unknown) => {
      const appError = mapHttpErrorToAppError(error);

      if (TRACKED_KINDS.has(appError.kind)) {
        observability.captureException(error, {
          url: req.url,
          method: req.method,
          status: appError.status,
        });
      }

      return throwError(() => appError);
    }),
  );
};
