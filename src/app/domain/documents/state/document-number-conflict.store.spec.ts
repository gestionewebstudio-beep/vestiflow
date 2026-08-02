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
    expect(store.confirmLabel()).toBe('Usa il primo libero');
  });

  it('open espone conflitto, messaggio e etichetta di conferma', () => {
    const store = new DocumentNumberConflictStore();

    store.open(conflict());

    expect(store.isOpen()).toBe(true);
    expect(store.conflict()).toEqual(conflict());
    expect(store.message()).toContain('Il numero 5 della serie A');
    expect(store.message()).toContain('Il primo numero libero è 7');
    expect(store.confirmLabel()).toBe('Usa 7');
  });

  it('senza serie il messaggio non la nomina', () => {
    const store = new DocumentNumberConflictStore();

    store.open(conflict({ series: null }));

    expect(store.message()).not.toContain('serie');
  });

  it('confirm restituisce il primo numero libero e azzera lo stato', () => {
    const store = new DocumentNumberConflictStore();
    store.open(conflict({ nextAvailable: 12 }));

    expect(store.confirm()).toBe(12);
    expect(store.isOpen()).toBe(false);
    expect(store.conflict()).toBeNull();
  });

  it('confirm senza conflitto aperto restituisce null e non rompe nulla', () => {
    const store = new DocumentNumberConflictStore();

    expect(store.confirm()).toBeNull();
    expect(store.isOpen()).toBe(false);
  });

  it('dismiss chiude e azzera senza restituire un numero', () => {
    const store = new DocumentNumberConflictStore();
    store.open(conflict());

    store.dismiss();

    expect(store.isOpen()).toBe(false);
    expect(store.conflict()).toBeNull();
    expect(store.confirmLabel()).toBe('Usa il primo libero');
  });

  it('un secondo conflitto sostituisce il precedente', () => {
    const store = new DocumentNumberConflictStore();
    store.open(conflict({ number: 5, nextAvailable: 7 }));

    store.open(conflict({ number: 9, nextAvailable: 11 }));

    expect(store.confirmLabel()).toBe('Usa 11');
    expect(store.confirm()).toBe(11);
  });
});
