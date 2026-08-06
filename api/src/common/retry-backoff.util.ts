/**
 * Riprova un'operazione asincrona con attese crescenti. Pensata per i push
 * best-effort verso i canali (Shopify/TikTok): un errore transitorio di rete
 * non deve lasciare il canale disallineato fino al push successivo.
 *
 * È un retry IN MEMORIA: un riavvio del processo perde i tentativi residui.
 * La rete di sicurezza resta la riconciliazione (caso D webhook) e il push
 * della vendita successiva — qui si accorcia solo la finestra di stale.
 */
export interface RetryBackoffOptions {
  /** Attese tra i tentativi: la lunghezza decide quanti retry (oltre al primo). */
  readonly delaysMs: readonly number[];
  /** Notifica di ogni fallimento intermedio (log): tentativo 1-based. */
  readonly onRetry?: (attempt: number, error: unknown) => void;
}

export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: RetryBackoffOptions,
): Promise<T> {
  let lastError: unknown;
  const totalAttempts = options.delaysMs.length + 1;
  for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const delay = options.delaysMs[attempt - 1];
      if (delay === undefined) {
        break;
      }
      options.onRetry?.(attempt, error);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}
