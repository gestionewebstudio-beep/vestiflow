import { describe, expect, it } from 'vitest';

import type { ChronologyAnomaly } from '../models/document-chronology.model';

import { DocumentChronologyWarningStore } from './document-chronology-warning.store';

function anomalia(number: number): ChronologyAnomaly {
  return {
    id: `doc-${number}`,
    number,
    documentDate: '2026-08-01',
    reference: `AM-A-000${number}`,
  };
}

describe('DocumentChronologyWarningStore', () => {
  it('serie in ordine: nessun avviso, il salvataggio prosegue', () => {
    const store = new DocumentChronologyWarningStore();

    expect(store.present([], false)).toBe(false);
    expect(store.isOpen()).toBe(false);
  });

  it('anomalie presenti: l’avviso si apre e chi chiama sospende il salvataggio', () => {
    const store = new DocumentChronologyWarningStore();

    expect(store.present([anomalia(2), anomalia(3)], false)).toBe(true);
    expect(store.isOpen()).toBe(true);
    expect(store.count()).toBe(2);
  });

  /**
   * Spento dall'operatore: le anomalie ci sono ancora — e restano leggibili —
   * ma l'avviso non interrompe più. La preferenza arriva dal server perché è
   * dell'operatore, non della scheda del browser.
   */
  it('avviso spento: non si apre nemmeno con le anomalie', () => {
    const store = new DocumentChronologyWarningStore();

    expect(store.present([anomalia(2)], true)).toBe(false);
    expect(store.isOpen()).toBe(false);
    expect(store.count()).toBe(1);
  });

  it('«Sì, salva comunque» chiude senza spegnere se la casella non è spuntata', () => {
    const store = new DocumentChronologyWarningStore();
    store.present([anomalia(2)], false);

    expect(store.confirm()).toEqual({ dismiss: false });
    expect(store.isOpen()).toBe(false);
  });

  it('con la casella spuntata la conferma chiede di spegnere', () => {
    const store = new DocumentChronologyWarningStore();
    store.present([anomalia(2)], false);
    store.toggleDontShowAgain(true);

    expect(store.confirm()).toEqual({ dismiss: true });
  });

  /**
   * La casella non sopravvive all'avviso: spuntarla e poi tornare al documento
   * non spegne niente — si spegne confermando, che è l'unico gesto in cui
   * l'operatore ha letto l'elenco e ha deciso.
   */
  it('«No» chiude e dimentica la casella', () => {
    const store = new DocumentChronologyWarningStore();
    store.present([anomalia(2)], false);
    store.toggleDontShowAgain(true);

    store.cancel();

    expect(store.isOpen()).toBe(false);
    expect(store.dontShowAgain()).toBe(false);
  });

  // L'avviso è persistente: riaprire un documento in una serie ancora rotta lo
  // fa ricomparire. Un avviso che sparisce da solo lascia dimenticare.
  it('l’avviso ricompare finché l’anomalia resta nei dati', () => {
    const store = new DocumentChronologyWarningStore();
    store.present([anomalia(2)], false);
    store.confirm();

    expect(store.present([anomalia(2)], false)).toBe(true);
  });
});
