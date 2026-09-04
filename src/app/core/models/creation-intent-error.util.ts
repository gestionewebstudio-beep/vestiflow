import { HttpErrorResponse } from '@angular/common/http';

import type { AppError } from './app-error.model';

/**
 * Gli esiti che il registro degli intenti di creazione può restituire in un 409
 * (T15). Non sono tutti la stessa cosa, ed è la ragione per cui questo file
 * esiste: **due di essi dicono che un record È STATO CREATO**, e trattarli come
 * un errore qualunque riporterebbe il difetto che T15 chiude.
 *
 * ```text
 * creation_intent_mismatch     l'intento è già stato usato per un'operazione
 *                              DIVERSA → un record esiste (o sta nascendo)
 * creation_intent_in_progress  la prima richiesta ha rivendicato e non ha
 *                              ancora finito → l'intento è OCCUPATO
 * creation_intent_vanished     chi aveva rivendicato ha fatto rollback →
 *                              l'intento è di nuovo libero
 * creation_intent_result_missing  il record c'era e non c'è più
 * ```
 */
export type CreationIntentErrorCode =
  | 'creation_intent_mismatch'
  | 'creation_intent_in_progress'
  | 'creation_intent_vanished'
  | 'creation_intent_result_missing';

export interface CreationIntentError {
  readonly code: CreationIntentErrorCode;
  /**
   * Riferimento opaco al record già creato con questo intento, quando c'è.
   *
   * `null` quando il record non esiste (ancora, o più): la prima richiesta ha
   * rivendicato senza finire, oppure il documento è stato eliminato.
   *
   * ⚠️ **La sua assenza non significa «si può creare di nuovo»**: significa solo
   * che non c'è un documento da mostrare. Chi decide se l'intento è riusabile è
   * il `code`, non questo campo.
   */
  readonly resultRef?: string | null;
}

const CODICI: readonly string[] = [
  'creation_intent_mismatch',
  'creation_intent_in_progress',
  'creation_intent_vanished',
  'creation_intent_result_missing',
];

function isIntentPayload(value: unknown): value is CreationIntentError {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as { code?: unknown };
  return typeof candidate.code === 'string' && CODICI.includes(candidate.code);
}

/**
 * Estrae l'esito del registro intenti da un errore. `null` se l'errore è di
 * altra natura.
 *
 * ⚠️ **Stessa forma di estrazione di `documentNumberConflictOf`**, gotcha
 * compreso: il payload viaggia nel corpo della risposta, e **Nest lo annida in
 * `message` quando l'eccezione riceve un oggetto**. Guardare solo il primo
 * livello lo troverebbe a volte sì e a volte no, che è il modo peggiore di
 * sbagliare.
 */
export function creationIntentErrorOf(error: unknown): CreationIntentError | null {
  const details =
    typeof error === 'object' && error !== null && 'details' in error
      ? (error as AppError).details
      : error;

  const body: unknown = details instanceof HttpErrorResponse ? details.error : details;
  if (isIntentPayload(body)) {
    return body;
  }
  if (typeof body === 'object' && body !== null && 'message' in body) {
    const message = (body as { message?: unknown }).message;
    if (isIntentPayload(message)) {
      return message;
    }
  }
  return null;
}

/**
 * ⛔ **L'intento è ancora OCCUPATO: chiuderlo permetterebbe una seconda
 * creazione inconsapevole.**
 *
 * È la domanda che la gestione errori deve porsi, e la ragione per cui non basta
 * guardare lo stato HTTP: un 409 può dire «il numero era già preso, non ho
 * creato niente» — e allora l'intento si chiude — oppure «questo intento ha già
 * prodotto un documento», e allora chiuderlo è il difetto.
 */
export function creationIntentStillHeld(error: unknown): boolean {
  const esito = creationIntentErrorOf(error);
  if (!esito) {
    return false;
  }
  // `vanished` e `result_missing` lasciano l'intento inservibile ma NON dicono
  // che esiste un record da proteggere: lì rigenerare è l'unica via d'uscita.
  return esito.code === 'creation_intent_mismatch' || esito.code === 'creation_intent_in_progress';
}
