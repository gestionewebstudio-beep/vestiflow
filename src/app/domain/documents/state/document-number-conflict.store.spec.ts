import { describe, expect, it } from 'vitest';

import type { DocumentNumberConflict } from '@core/models/document-number-conflict.util';

import { DocumentNumberConflictStore } from './document-number-conflict.store';

function conflict(over: Partial<DocumentNumberConflict> = {}): DocumentNumberConflict {
  return {
    code: 'document_number_taken',
    number: 5,
    nextAvailable: 7,
    series: 'A',
    ...over,
  };
}

describe('DocumentNumberConflictStore', () => {
  it('parte chiuso e senza conflitto', () => {
    const store = new DocumentNumberConflictStore();

    expect(store.isOpen()).toBe(false);
    expect(store.conflict()).toBeNull();
    expect(store.message()).toBe('');
  });

  describe('open', () => {
    it('espone il conflitto e apre l’avviso', () => {
      const store = new DocumentNumberConflictStore();

      store.open(conflict());

      expect(store.isOpen()).toBe(true);
      expect(store.conflict()).toEqual(conflict());
    });

    // Il testo è un'informazione su un fatto già avvenuto, non una domanda:
    // dice che il numero è STATO aggiornato e che il documento NON è salvato.
    it('il messaggio dichiara il numero aggiornato e il documento non salvato', () => {
      const store = new DocumentNumberConflictStore();

      store.open(conflict({ number: 5, nextAvailable: 7, series: 'A' }));

      expect(store.message()).toContain('Il numero 5 della serie A');
      expect(store.message()).toContain('è stato aggiornato al 7');
      expect(store.message()).toContain('non è ancora salvato');
    });

    it('senza serie il messaggio non la nomina', () => {
      const store = new DocumentNumberConflictStore();

      store.open(conflict({ series: null }));

      expect(store.message()).not.toContain('serie');
    });

    it('un secondo conflitto sostituisce il precedente', () => {
      const store = new DocumentNumberConflictStore();
      store.open(conflict({ number: 5, nextAvailable: 7 }));

      store.open(conflict({ number: 9, nextAvailable: 11 }));

      expect(store.message()).toContain('è stato aggiornato al 11');
      expect(store.acknowledge()).toBe(11);
    });
  });

  describe('acknowledge', () => {
    it('restituisce il primo numero libero e azzera lo stato', () => {
      const store = new DocumentNumberConflictStore();
      store.open(conflict({ nextAvailable: 12 }));

      expect(store.acknowledge()).toBe(12);
      expect(store.isOpen()).toBe(false);
      expect(store.conflict()).toBeNull();
      expect(store.message()).toBe('');
    });

    it('senza conflitto aperto restituisce null e non rompe nulla', () => {
      const store = new DocumentNumberConflictStore();

      expect(store.acknowledge()).toBeNull();
      expect(store.isOpen()).toBe(false);
    });

    // Non esiste un percorso «annulla»: l'avviso dichiara che il numero è già
    // stato aggiornato, quindi qualunque chiusura deve applicarlo. Il form
    // collega allo stesso gestore sia OK sia la chiusura con Esc.
    it('è l’unica uscita: non c’è un percorso che scarta il numero', () => {
      const store = new DocumentNumberConflictStore();

      expect(store).not.toHaveProperty('dismiss');
      expect(store).not.toHaveProperty('confirm');
    });
  });
});
