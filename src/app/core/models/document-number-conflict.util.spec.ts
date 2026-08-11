import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it } from 'vitest';

import {
  documentNumberConflictMessage,
  documentNumberConflictOf,
  type DocumentNumberConflict,
} from './document-number-conflict.util';

function conflict(over: Partial<DocumentNumberConflict> = {}): DocumentNumberConflict {
  return {
    code: 'document_number_taken',
    number: 7,
    nextAvailable: 44,
    series: 'A',
    ...over,
  };
}

describe('documentNumberConflictMessage', () => {
  /**
   * Lo scenario che ha fatto nascere questi test: la serie arriva a 43, il 7 è
   * un buco. L'operatore digita 7 per tapparlo, un collega lo prende un istante
   * prima. Il messaggio deve parlare del 7 — l'unico numero che l'operatore ha
   * scritto — e dire qual è il prossimo numero della serie.
   */
  it('nomina il numero rifiutato, non l’ultimo occupato della serie', () => {
    const message = documentNumberConflictMessage(conflict({ number: 7, nextAvailable: 44 }));

    expect(message).toContain('Il numero 7 della serie A');
    expect(message).toContain('è già stato assegnato a un altro documento');
    expect(message).not.toContain('numero 43');
  });

  // «Prossimo numero», non «primo libero»: `nextAvailable` è massimo + 1, e su
  // una serie con buchi il primo libero è il buco. Chiamarlo «primo libero»
  // contraddirebbe la scheda dei numeratori, che i buchi li elenca.
  it('nomina il prossimo numero della serie, non lo chiama «primo libero»', () => {
    const message = documentNumberConflictMessage(conflict({ number: 7, nextAvailable: 44 }));

    expect(message).toContain('Il prossimo numero della serie è il 44');
    expect(message).not.toContain('primo numero libero');
  });

  // Il documento non è salvato e la testata non è stata toccata: entrambe le
  // cose vanno dette, o l'operatore non sa in che stato si trova.
  it('dichiara che il documento non è salvato e che la testata non è cambiata', () => {
    const message = documentNumberConflictMessage(conflict());

    expect(message).toContain('il documento non è stato salvato');
    expect(message).toContain('Il numero in testata non è stato modificato');
  });

  it('senza serie non la nomina in nessuna delle due frasi', () => {
    const message = documentNumberConflictMessage(conflict({ series: null }));

    expect(message).toContain('Il numero 7 è già stato assegnato');
    expect(message).toContain('Il prossimo numero è il 44');
    expect(message).not.toContain('serie');
  });
});

describe('documentNumberConflictOf', () => {
  it('estrae il conflitto dal corpo della 409', () => {
    const error = new HttpErrorResponse({ status: 409, error: conflict() });

    expect(documentNumberConflictOf(error)).toEqual(conflict());
  });

  // Nest annida il payload in `message` quando l'eccezione riceve un oggetto.
  it('estrae il conflitto annidato in message', () => {
    const error = new HttpErrorResponse({
      status: 409,
      error: { statusCode: 409, message: conflict() },
    });

    expect(documentNumberConflictOf(error)).toEqual(conflict());
  });

  it('null per un errore di altra natura', () => {
    const error = new HttpErrorResponse({ status: 500, error: { message: 'boom' } });

    expect(documentNumberConflictOf(error)).toBeNull();
  });
});
