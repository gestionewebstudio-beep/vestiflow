import { describe, expect, it } from 'vitest';

import { trailingEmptyLineIndices } from './trailing-empty-lines.util';

/** `true` = riga vuota. Si legge come il documento: la prima è la prima. */
const righe = (...vuote: readonly boolean[]) => ({
  count: vuote.length,
  isEmpty: (i: number) => vuote[i] ?? false,
});

describe('trailingEmptyLineIndices', () => {
  it('scarta la riga vuota in coda, che è quella creata per sbaglio', () => {
    const { count, isEmpty } = righe(false, false, true);
    expect(trailingEmptyLineIndices(count, isEmpty)).toEqual([2]);
  });

  it('ne scarta anche più di una, dal fondo verso l’alto', () => {
    const { count, isEmpty } = righe(false, true, true, true);
    // In quest'ordine: chi le rimuove una per una non invalida le altre.
    expect(trailingEmptyLineIndices(count, isEmpty)).toEqual([3, 2, 1]);
  });

  // La distinzione che fa tutto il lavoro: in mezzo è una riga lasciata lì,
  // e va segnalata; in coda è un residuo della navigazione.
  it('la riga vuota IN MEZZO non si tocca', () => {
    const { count, isEmpty } = righe(false, true, false);
    expect(trailingEmptyLineIndices(count, isEmpty)).toEqual([]);
  });

  it('si ferma alla prima riga con qualcosa dentro', () => {
    const { count, isEmpty } = righe(true, false, true, true);
    expect(trailingEmptyLineIndices(count, isEmpty)).toEqual([3, 2]);
  });

  // Svuotare il documento produrrebbe un salvataggio riuscito di niente.
  it('se sono vuote tutte ne lascia una, e parlerà la validazione', () => {
    const { count, isEmpty } = righe(true, true, true);
    expect(trailingEmptyLineIndices(count, isEmpty)).toEqual([2, 1]);
  });

  it('una riga sola e vuota resta dov’è', () => {
    const { count, isEmpty } = righe(true);
    expect(trailingEmptyLineIndices(count, isEmpty)).toEqual([]);
  });

  it('nessuna riga vuota: niente da scartare', () => {
    const { count, isEmpty } = righe(false, false);
    expect(trailingEmptyLineIndices(count, isEmpty)).toEqual([]);
  });
});
