import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';

import { AppErrorKind } from '@core/models';
import { SILENT_HTTP_ERROR } from '@core/http/http-context.util';
import { ObservabilityService } from '@core/services/observability.service';
import { ToastService } from '@core/services/toast.service';
import { mapHttpErrorToAppError } from './http-error.mapper';

// Errori da tracciare in observability (gli altri 4xx sono attesi → niente rumore).
const TRACKED_KINDS = new Set<AppErrorKind>([
  AppErrorKind.Server,
  AppErrorKind.Network,
  AppErrorKind.Unknown,
]);

// Errori HTTP che meritano un toast globale (5xx / rete / imprevisti).
const TOAST_KINDS = new Set<AppErrorKind>([
  AppErrorKind.Server,
  AppErrorKind.Network,
  AppErrorKind.Timeout,
  AppErrorKind.Unknown,
]);

/**
 * Normalizza gli errori HTTP in AppError e li rilancia (non li inghiotte).
 * Per errori server/rete mostra anche un toast non bloccante.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const observability = inject(ObservabilityService);
  const toast = inject(ToastService);

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

      if (TOAST_KINDS.has(appError.kind) && !req.context.get(SILENT_HTTP_ERROR)) {
        toast.showError(appError.message);
      }

      return throwError(() => appError);
    }),
  );
};
