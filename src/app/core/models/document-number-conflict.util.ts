import { HttpErrorResponse } from '@angular/common/http';

import type { AppError } from './app-error.model';

/**
 * Conflitto sul numero documento restituito dal server (409): il numero che il
 * salvataggio ha tentato di scrivere è già usato in quella serie. Il vincolo
 * unico del database è l'unica verità — non esiste un «mantieni il numero»: si
 * corregge il numero in testata e si risalva.
 */
export interface DocumentNumberConflict {
  readonly code: 'document_number_taken';
  /**
   * Numero RIFIUTATO: quello che l'operatore ha in testata, digitato da lui o
   * già scritto sul documento in modifica. È l'unico numero che ha senso
   * nominargli — non l'ultimo occupato della serie, che non ha mai visto.
   */
  readonly number: number;
  /** Primo numero libero della serie, da suggerire all'operatore. */
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
 * Avviso di presa d'atto, non una domanda: il documento NON è stato salvato, e
 * **il numero in testata è stato aggiornato** (specifica numerazione §3).
 * Nomina entrambi i numeri — quello rifiutato e quello nuovo — così l'operatore
 * sa cos'è cambiato sotto i suoi occhi.
 *
 * "Il numero 7 della serie A è già stato assegnato a un altro documento: il
 *  documento non è stato salvato. In testata è stato messo il 44, il prossimo
 *  numero della serie: premi Salva per confermarlo, o scrivine un altro."
 *
 * **Perché si aggiorna.** Il numero digitato è comunque perso: quel treno è
 * passato. Lasciare il campo com'era costringe a ridigitare una cosa che il
 * sistema già sa — e lavorando in più persone l'operatore non può nemmeno
 * sapere quale sia il prossimo libero. Chi voleva un altro buco lo scrive: il
 * campo resta suo, e la frase glielo dice.
 *
 * «PROSSIMO numero», non «primo libero»: `nextAvailable` è massimo + 1, e su una
 * serie con buchi il primo libero è il buco, non la coda. Chiamarlo «primo
 * libero» direbbe all'operatore l'esatto contrario di quello che gli dice la
 * scheda dei numeratori, che i buchi glieli elenca.
 */
export function documentNumberConflictMessage(conflict: DocumentNumberConflict): string {
  const seriePart = conflict.series ? ` della serie ${conflict.series}` : '';
  const seriePartNext = conflict.series ? ' della serie' : '';
  return (
    `Il numero ${conflict.number}${seriePart} è già stato assegnato a un altro documento: ` +
    `il documento non è stato salvato. In testata è stato messo il ` +
    `${conflict.nextAvailable}, il prossimo numero${seriePartNext}: premi Salva per ` +
    `confermarlo, o scrivine un altro.`
  );
}
