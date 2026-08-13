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
   *
   * `null` quando il numero era stato assegnato d'ufficio e il server non sa
   * dire quale fosse: in quel caso non se ne nomina nessuno.
   */
  readonly number: number | null;
  /** Primo numero libero della serie alla data del documento (regola §2). */
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
 * **«primo libero», non «prossimo numero»** _(corretto il 13/08/2026)_. Qui c'era
 * scritto il contrario, con la motivazione «`nextAvailable` è massimo + 1»: era
 * vera fino alla regola del §2, che l'ha sostituita. Oggi `nextAvailable` è il
 * primo libero sopra i documenti di data anteriore, e su una serie con buchi
 * **è il buco**. Chiamarlo «il prossimo numero della serie» mentre gli si
 * propone il 12 con l'ultimo documento al 13 è dirgli una cosa falsa proprio
 * nel momento in cui sta guardando il campo.
 *
 * Se il numero rifiutato non è noto (assegnato d'ufficio, perso col rollback)
 * non se ne nomina nessuno: la frase dice cos'è successo senza inventare cifre.
 */
export function documentNumberConflictMessage(conflict: DocumentNumberConflict): string {
  const seriePart = conflict.series ? ` della serie ${conflict.series}` : '';
  const seriePartNext = conflict.series ? ' della serie' : '';
  const rifiutato =
    conflict.number != null
      ? `Il numero ${conflict.number}${seriePart} è già stato assegnato a un altro documento`
      : `Il numero assegnato${seriePart} è stato preso da un altro documento`;
  return (
    `${rifiutato}: il documento non è stato salvato. In testata è stato messo il ` +
    `${conflict.nextAvailable}, il primo numero libero${seriePartNext}: premi Salva per ` +
    `confermarlo, o scrivine un altro.`
  );
}
