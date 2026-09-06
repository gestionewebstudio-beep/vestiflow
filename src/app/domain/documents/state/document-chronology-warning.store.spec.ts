import { describe, expect, it } from 'vitest';

import type { ChronologyConflict } from '../models/document-chronology.model';

import { DocumentChronologyWarningStore } from './document-chronology-warning.store';

function conflitto(number: number): ChronologyConflict {
  return {
    id: `doc-${number}`,
    number,
    documentDate: '2026-08-01',
    reference: `AM-A-000${number}`,
    direction: 'precede',
  };
}

describe('DocumentChronologyWarningStore', () => {
  it('documento in ordine: nessun avviso, il salvataggio prosegue', () => {
    const store = new DocumentChronologyWarningStore();

    expect(store.present([], false)).toBe(false);
    expect(store.isOpen()).toBe(false);
  });

  it('conflitti presenti: l’avviso si apre e chi chiama sospende il salvataggio', () => {
    const store = new DocumentChronologyWarningStore();

    expect(store.present([conflitto(2), conflitto(3)], false)).toBe(true);
    expect(store.isOpen()).toBe(true);
    expect(store.count()).toBe(2);
  });

  /**
   * Spento dall'operatore: i conflitti ci sono ancora — e restano leggibili —
   * ma l'avviso non interrompe più. La preferenza arriva dal server perché è
   * dell'operatore, non della scheda del browser. Da oggi quella casella
   * zittisce un allarme sul documento in mano, non un rumore di fondo.
   */
  it('avviso spento: non si apre nemmeno coi conflitti', () => {
    const store = new DocumentChronologyWarningStore();

    expect(store.present([conflitto(2)], true)).toBe(false);
    expect(store.isOpen()).toBe(false);
    expect(store.count()).toBe(1);
  });

  it('«Sì, salva comunque» chiude senza spegnere se la casella non è spuntata', () => {
    const store = new DocumentChronologyWarningStore();
    store.present([conflitto(2)], false);

    expect(store.confirm()).toEqual({ dismiss: false });
    expect(store.isOpen()).toBe(false);
  });

  it('con la casella spuntata la conferma chiede di spegnere', () => {
    const store = new DocumentChronologyWarningStore();
    store.present([conflitto(2)], false);
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
    store.present([conflitto(2)], false);
    store.toggleDontShowAgain(true);

    store.cancel();

    expect(store.isOpen()).toBe(false);
    expect(store.dontShowAgain()).toBe(false);
  });

  // Due salvataggi che rompono l'ordine, due avvisi: lo store non «si
  // ricorda» di aver già parlato, perché ogni salvataggio è un documento
  // diverso e la domanda si rifà da capo ogni volta.
  it('un secondo documento fuori ordine avvisa di nuovo', () => {
    const store = new DocumentChronologyWarningStore();
    store.present([conflitto(2)], false);
    store.confirm();

    expect(store.present([conflitto(2)], false)).toBe(true);
  });
});
