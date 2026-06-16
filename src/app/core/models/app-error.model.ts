// Errore di dominio normalizzato. L'interceptor HTTP mappa gli errori grezzi in
// AppError; i `details` restano per log/observability, non per l'utente finale.

export const AppErrorKind = {
  Network: 'network',
  Timeout: 'timeout',
  Unauthorized: 'unauthorized',
  Forbidden: 'forbidden',
  NotFound: 'not_found',
  Validation: 'validation',
  Conflict: 'conflict',
  RateLimited: 'rate_limited',
  MfaRequired: 'mfa_required',
  Server: 'server',
  Unknown: 'unknown',
} as const;
export type AppErrorKind = (typeof AppErrorKind)[keyof typeof AppErrorKind];

export interface AppError {
  readonly kind: AppErrorKind;
  /** Messaggio generico mostrabile all'utente. */
  readonly message: string;
  /** Status HTTP, se applicabile. */
  readonly status?: number;
  /** Dettagli tecnici: solo log/observability, mai esposti in UI. */
  readonly details?: unknown;
}

/** Type guard: restringe un errore sconosciuto a AppError. */
export function isAppError(value: unknown): value is AppError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    'message' in value &&
    typeof (value as { message: unknown }).message === 'string'
  );
}
