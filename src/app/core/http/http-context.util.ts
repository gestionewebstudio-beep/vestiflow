import { HttpContext, HttpContextToken } from '@angular/common/http';

/**
 * Quando true, l'error interceptor non mostra toast: la UI locale (error-state,
 * submitError, alert form) gestisce già il messaggio all'utente.
 */
export const SILENT_HTTP_ERROR = new HttpContextToken<boolean>(() => false);

/** Opzioni HttpClient con toast HTTP disattivato (errori gestiti inline in UI). */
export function withSilentHttpError<T extends { context?: HttpContext }>(
  options: T = {} as T,
): T & { context: HttpContext } {
  const context = (options.context ?? new HttpContext()).set(SILENT_HTTP_ERROR, true);
  return { ...options, context };
}
