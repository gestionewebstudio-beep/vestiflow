import { Injectable, inject } from '@angular/core';

import { APP_CONFIG } from '@core/config/app-config.token';

export type ObservabilityLevel = 'debug' | 'info' | 'warning' | 'error';

/** Contesto opzionale; NON includere mai PII o payload completi (regole-sicurezza). */
export type ObservabilityContext = Record<string, unknown>;

/**
 * Wrapper di observability. Il resto dell'app dipende SOLO da questo service,
 * mai da un SDK esterno: cosi' l'implementazione interna (Sentry / Cloud Logging
 * / Datadog) si potra' sostituire senza toccare i chiamanti.
 *
 * Implementazione attuale: inoltro a console (nessun SDK esterno in questo step).
 */
@Injectable({ providedIn: 'root' })
export class ObservabilityService {
  private readonly config = inject(APP_CONFIG);

  /** Errore non gestito o catturato. */
  captureException(error: unknown, context?: ObservabilityContext): void {
    console.error('[observability] exception', error, context ?? {});
  }

  /** Messaggio diagnostico con livello. */
  captureMessage(
    message: string,
    level: ObservabilityLevel = 'info',
    context?: ObservabilityContext,
  ): void {
    if (level === 'debug' && this.config.production) {
      return;
    }
    console.log(`[observability] ${level}: ${message}`, context ?? {});
  }

  /** Evento di business (es. login, sync Shopify, ricezione ordine). */
  trackEvent(name: string, data?: ObservabilityContext): void {
    console.log(`[observability] event: ${name}`, data ?? {});
  }
}
