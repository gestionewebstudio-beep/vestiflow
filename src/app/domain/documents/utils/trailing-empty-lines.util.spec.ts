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

  // ⛔ Qui le due prove dicevano il contrario: «se sono vuote tutte ne lascia
  // una» e «una riga sola e vuota resta dov’è», con la ragione scritta sopra —
  // «svuotare il documento produrrebbe un salvataggio riuscito di niente».
  //
  // ⭐ Quel salvataggio ora si vuole (proprietario, 25/08/2026): un documento
  // vuoto con numero, serie e data e' un documento legittimo, che si compila
  // riaprendolo.
  it('⭐ se sono vuote tutte si scartano TUTTE: il documento resta vuoto', () => {
    const { count, isEmpty } = righe(true, true, true);
    expect(trailingEmptyLineIndices(count, isEmpty)).toEqual([2, 1, 0]);
  });

  it('⭐ una riga sola e vuota se ne va: e’ la riga seminata all’apertura', () => {
    // ⚠️ E' il caso che teneva in piedi il divieto: la riga che la maschera
    // semina da se' restava, l'array non era mai valido, e il documento vuoto
    // non partiva — a prescindere dai messaggi delle singole maschere.
    const { count, isEmpty } = righe(true);
    expect(trailingEmptyLineIndices(count, isEmpty)).toEqual([0]);
  });

  it('chi vuole conservarne una lo DICHIARA, e non lo eredita', () => {
    const { count, isEmpty } = righe(true, true, true);
    expect(trailingEmptyLineIndices(count, isEmpty, 1)).toEqual([2, 1]);
  });

  it('nessuna riga vuota: niente da scartare', () => {
    const { count, isEmpty } = righe(false, false);
    expect(trailingEmptyLineIndices(count, isEmpty)).toEqual([]);
  });
});
