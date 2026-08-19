import { describe, expect, it } from 'vitest';

import type { ChronologyConflict } from './document-chronology.model';
import { chronologyWarningMessage } from './document-chronology.util';

function conflitto(over: Partial<ChronologyConflict> = {}): ChronologyConflict {
  return {
    id: 'doc-1',
    number: 1,
    documentDate: '2026-08-14',
    reference: 'PRE-0001',
    direction: 'precede',
    ...over,
  };
}

describe('chronologyWarningMessage', () => {
  /**
   * **Il secondo dei due test chiesti.** Lo scenario è quello misurato su Danea
   * il 13/08/2026: oggi creo il n.1 datato domani, poi ne apro un altro che
   * prende il n.2 con la data di oggi. L'avviso deve nominare tre cose — quello
   * che sto assegnando, quello che lo smentisce, e perché — o l'operatore legge
   * un allarme che non sa a cosa si riferisca.
   */
  it('nomina il numero e la data che sto assegnando, e il documento in conflitto', () => {
    const messaggio = chronologyWarningMessage([conflitto()], 2, '2026-08-13');

    expect(messaggio).toContain('Stai assegnando il numero 2 con data 13/08/2026');
    expect(messaggio).toContain('esiste già PRE-0001 del 14/08/2026');
    expect(messaggio).toContain('un numero più basso con una data successiva');
    expect(messaggio).toContain('numeri e date non sarebbero in ordine');
  });

  it('il verso simmetrico si dice al contrario', () => {
    const messaggio = chronologyWarningMessage(
      [conflitto({ direction: 'segue', number: 9, reference: 'PRE-0009' })],
      5,
      '2026-08-10',
    );

    expect(messaggio).toContain('un numero più alto con una data anteriore');
  });

  it('senza riferimento il documento si nomina col numero', () => {
    const messaggio = chronologyWarningMessage([conflitto({ reference: null })], 2, '2026-08-13');

    expect(messaggio).toContain('esiste già il n. 1 del 14/08/2026');
  });

  it('due conflitti: la frase lo dice, invece di nominarne uno e tacere l’altro', () => {
    const messaggio = chronologyWarningMessage(
      [conflitto(), conflitto({ id: 'doc-2', direction: 'segue', number: 9 })],
      5,
      '2026-08-13',
    );

    expect(messaggio).toContain('e non è l’unico');
  });

  /**
   * Nessun conflitto significa che l'avviso non si apre nemmeno: la frase esiste
   * solo perché il componente la calcola comunque, e non deve mentire.
   */
  it('senza conflitti non afferma niente su nessun altro documento', () => {
    const messaggio = chronologyWarningMessage([], 2, '2026-08-13');

    expect(messaggio).toBe('Stai assegnando il numero 2 con data 13/08/2026.');
  });
});
