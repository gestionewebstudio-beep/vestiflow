import { describe, expect, it } from 'vitest';

import {
  persistedLineVariants,
  variantLabelSnapshot,
} from './document-line-variant-snapshot.util';

/**
 * ⛔ **Il difetto che questi test vietano**, e non è teorico: è la forma in cui
 * lo stesso errore si è già presentato tre volte in questo progetto.
 *
 * ```text
 * documento di marzo                    «Rosso / M»
 * l'opzione si rinomina in anagrafica  →  «Bordeaux / M»
 * si riapre e si salva senza toccare l'articolo
 * → il documento di marzo diventa «Bordeaux / M»
 * ```
 */

const OPZIONI_M = [
  { name: 'Colore', value: 'Rosso' },
  { name: 'Taglia', value: 'M' },
];
const OPZIONI_L = [
  { name: 'Colore', value: 'Rosso' },
  { name: 'Taglia', value: 'L' },
];

const persistite = persistedLineVariants([
  { id: 'line-1', variantId: 'var-M', variantLabel: 'Bordeaux / M' },
  { id: 'line-senza', variantId: null, variantLabel: '' },
]);

describe('variantLabelSnapshot', () => {
  it('riga NUOVA: si calcola dalla variante scelta', () => {
    expect(
      variantLabelSnapshot({
        lineId: null,
        variantId: 'var-M',
        optionValues: OPZIONI_M,
        persisted: persistite,
      }),
    ).toBe('Rosso / M');
  });

  /**
   * ⭐ Il caso che conta: l'anagrafica dice «Rosso / M», la riga dice
   * «Bordeaux / M», e la riga vince perché la variante non è cambiata.
   */
  it('riga ESISTENTE, STESSA variante: conserva il persistito', () => {
    expect(
      variantLabelSnapshot({
        lineId: 'line-1',
        variantId: 'var-M',
        optionValues: OPZIONI_M,
        persisted: persistite,
      }),
    ).toBe('Bordeaux / M');
  });

  /**
   * ⛔ Il caso che un `persistito ?? calcola` sbaglierebbe: conserverebbe «M»
   * su una riga che ora porta una «L».
   */
  it('riga ESISTENTE, variante DIVERSA: ricalcola dalla nuova', () => {
    expect(
      variantLabelSnapshot({
        lineId: 'line-1',
        variantId: 'var-L',
        optionValues: OPZIONI_L,
        persisted: persistite,
      }),
    ).toBe('Rosso / L');
  });

  it('riga esistente che PERDE la variante: si ricalcola, e resta vuota', () => {
    expect(
      variantLabelSnapshot({
        lineId: 'line-1',
        variantId: null,
        optionValues: null,
        persisted: persistite,
      }),
    ).toBe('');
  });

  it('riga esistente SENZA variante che ne acquisisce una: si calcola', () => {
    expect(
      variantLabelSnapshot({
        lineId: 'line-senza',
        variantId: 'var-M',
        optionValues: OPZIONI_M,
        persisted: persistite,
      }),
    ).toBe('Rosso / M');
  });

  it('id sconosciuto nella mappa: si comporta come una riga nuova', () => {
    expect(
      variantLabelSnapshot({
        lineId: 'line-mai-vista',
        variantId: 'var-M',
        optionValues: OPZIONI_M,
        persisted: persistite,
      }),
    ).toBe('Rosso / M');
  });

  it('senza mappa dei persistiti si calcola sempre (percorso di creazione)', () => {
    expect(
      variantLabelSnapshot({
        lineId: 'line-1',
        variantId: 'var-M',
        optionValues: OPZIONI_M,
        persisted: undefined,
      }),
    ).toBe('Rosso / M');
  });

  /** Il filtro del canale vale anche qui: passa dalla funzione unica. */
  it('il «Default Title» di Shopify resta stringa vuota', () => {
    expect(
      variantLabelSnapshot({
        lineId: null,
        variantId: 'var-semplice',
        optionValues: [{ name: 'Title', value: 'Default Title' }],
        persisted: persistite,
      }),
    ).toBe('');
  });

  it('non restituisce mai null o undefined', () => {
    const esiti = [
      variantLabelSnapshot({ lineId: null, variantId: null, optionValues: null, persisted: undefined }),
      variantLabelSnapshot({ lineId: 'line-1', variantId: 'var-M', optionValues: undefined, persisted: persistite }),
    ];

    for (const esito of esiti) {
      expect(typeof esito).toBe('string');
    }
  });
});

describe('persistedLineVariants', () => {
  it('indicizza per id, conservando variante ed etichetta insieme', () => {
    const mappa = persistedLineVariants([
      { id: 'a', variantId: 'v1', variantLabel: 'M / Rosso' },
      { id: 'b', variantId: null, variantLabel: '' },
    ]);

    expect(mappa.get('a')).toEqual({ variantId: 'v1', variantLabel: 'M / Rosso' });
    expect(mappa.get('b')).toEqual({ variantId: null, variantLabel: '' });
    expect(mappa.get('c')).toBeUndefined();
  });
});
