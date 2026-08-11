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

    // Il testo nomina DUE numeri: quello rifiutato — che è quello digitato in
    // testata dall'operatore — e il primo libero, che gli serve per correggere.
    it('il messaggio nomina il numero rifiutato e il primo libero', () => {
      const store = new DocumentNumberConflictStore();

      store.open(conflict({ number: 7, nextAvailable: 44, series: 'A' }));

      expect(store.message()).toContain('Il numero 7 della serie A');
      expect(store.message()).toContain('è il 44');
      expect(store.message()).toContain('non è stato salvato');
    });

    // Il difetto storico: il payload portava l'ultimo numero occupato della
    // serie, e il messaggio nominava all'operatore un numero mai digitato.
    it('non nomina l’ultimo numero occupato al posto di quello digitato', () => {
      const store = new DocumentNumberConflictStore();

      store.open(conflict({ number: 7, nextAvailable: 44, series: null }));

      expect(store.message()).toContain('Il numero 7');
      expect(store.message()).not.toContain('numero 43');
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

      expect(store.message()).toContain('Il numero 9');
      expect(store.message()).toContain('è il 11');
    });
  });

  describe('acknowledge', () => {
    it('chiude e azzera lo stato', () => {
      const store = new DocumentNumberConflictStore();
      store.open(conflict({ nextAvailable: 12 }));

      store.acknowledge();

      expect(store.isOpen()).toBe(false);
      expect(store.conflict()).toBeNull();
      expect(store.message()).toBe('');
    });

    it('senza conflitto aperto non rompe nulla', () => {
      const store = new DocumentNumberConflictStore();

      store.acknowledge();

      expect(store.isOpen()).toBe(false);
      expect(store.conflict()).toBeNull();
    });

    // La presa d'atto non restituisce un numero da scrivere in testata: il
    // numero digitato dall'operatore resta suo. Se lo store tornasse a
    // proporne uno, le maschere tornerebbero a sostituirlo d'ufficio.
    it('non restituisce alcun numero da applicare alla testata', () => {
      const store = new DocumentNumberConflictStore();
      store.open(conflict({ nextAvailable: 12 }));

      expect(store.acknowledge()).toBeUndefined();
    });

    // Non esiste un percorso «annulla»: l'avviso non ha modificato niente,
    // quindi ogni uscita (OK o Esc) fa la stessa identica cosa. Il form
    // collega allo stesso gestore sia OK sia la chiusura con Esc.
    it('è l’unica uscita: non c’è un secondo percorso', () => {
      const store = new DocumentNumberConflictStore();

      expect(store).not.toHaveProperty('dismiss');
      expect(store).not.toHaveProperty('confirm');
    });
  });
});
