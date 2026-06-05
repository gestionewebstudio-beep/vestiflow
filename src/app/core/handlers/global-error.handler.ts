import { ErrorHandler, Injectable, inject } from '@angular/core';

import { ObservabilityService } from '@core/services/observability.service';

/**
 * Handler globale degli errori non gestiti.
 * Inoltra a ObservabilityService; non mostra UI/toast in questo step.
 *
 * NOTA: gli errori HTTP verranno normalizzati in AppError dall'error interceptor
 * (step successivo); qui resta la gestione generica degli errori non catturati.
 */
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private readonly observability = inject(ObservabilityService);

  handleError(error: unknown): void {
    try {
      this.observability.captureException(error);
    } catch (loggingError) {
      // Fallback: l'errore originale non deve mai essere perso silenziosamente.
      console.error('[global-error-handler] logging failed', loggingError);
      console.error('[global-error-handler] original error', error);
    }

    // Punto di estensione: in futuro qui si agganchera' una notifica UI non
    // bloccante (toast) per gli errori rilevanti.
  }
}
