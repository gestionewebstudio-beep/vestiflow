import { ErrorHandler, Injectable, inject } from '@angular/core';

import { isAppError } from '@core/models/app-error.model';
import { ObservabilityService } from '@core/services/observability.service';
import { ToastService } from '@core/services/toast.service';

const UNEXPECTED_ERROR_MESSAGE = 'Si è verificato un errore imprevisto.';

/**
 * Handler globale degli errori non gestiti.
 * Logga in observability e mostra un toast non bloccante all'utente.
 */
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private readonly observability = inject(ObservabilityService);
  private readonly toast = inject(ToastService);

  handleError(error: unknown): void {
    try {
      this.observability.captureException(error);
    } catch (loggingError) {
      console.error('[global-error-handler] logging failed', loggingError);
      console.error('[global-error-handler] original error', error);
    }

    this.toast.showError(this.resolveUserMessage(error));
  }

  private resolveUserMessage(error: unknown): string {
    if (isAppError(error)) {
      return error.message;
    }
    return UNEXPECTED_ERROR_MESSAGE;
  }
}
