import { HttpErrorResponse } from '@angular/common/http';

import type { AppError } from './app-error.model';

/**
 * Conflitto sul numero documento restituito dal server (409): il numero
 * scelto è già usato in quella serie/anno. Il vincolo unico del database è
 * l'unica verità — non esiste un «mantieni il numero», si può solo prendere
 * il primo libero proposto oppure annullare e correggere a mano.
 */
export interface DocumentNumberConflict {
  readonly code: 'document_number_taken';
  /** Numero rifiutato (già assegnato a un altro documento). */
  readonly number: number;
  /** Primo numero libero della serie, da proporre all'operatore. */
  readonly nextAvailable: number;
  /** null = senza serie. */
  readonly series: string | null;
}

function isConflictPayload(value: unknown): value is DocumentNumberConflict {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<DocumentNumberConflict>;
  return candidate.code === 'document_number_taken' && typeof candidate.nextAvailable === 'number';
}

/**
 * Estrae il conflitto numero da un AppError (il payload viaggia nel corpo
 * della risposta 409). null se l'errore è di altra natura.
 */
export function documentNumberConflictOf(error: unknown): DocumentNumberConflict | null {
  const details =
    typeof error === 'object' && error !== null && 'details' in error
      ? (error as AppError).details
      : error;

  const body: unknown = details instanceof HttpErrorResponse ? details.error : details;
  if (isConflictPayload(body)) {
    return body;
  }
  // Nest annida il payload in `message` quando l'eccezione riceve un oggetto.
  if (typeof body === 'object' && body !== null && 'message' in body) {
    const message = (body as { message?: unknown }).message;
    if (isConflictPayload(message)) {
      return message;
    }
  }
  return null;
}

/**
 * Avviso di presa d'atto, non una domanda: il numero è già stato aggiornato
 * nella testata e il documento NON è stato salvato. Il salvataggio resta una
 * pressione esplicita di Salva da parte dell'operatore.
 *
 * "Il numero 5 della serie A nel frattempo è stato assegnato a un altro
 *  documento. Il numero è stato aggiornato al 7: il documento non è ancora
 *  salvato, premi Salva per confermare."
 */
export function documentNumberConflictMessage(conflict: DocumentNumberConflict): string {
  const seriePart = conflict.series ? ` della serie ${conflict.series}` : '';
  return (
    `Il numero ${conflict.number}${seriePart} nel frattempo è stato assegnato a un altro ` +
    `documento. Il numero è stato aggiornato al ${conflict.nextAvailable}: il documento non ` +
    `è ancora salvato, premi Salva per confermare.`
  );
}
