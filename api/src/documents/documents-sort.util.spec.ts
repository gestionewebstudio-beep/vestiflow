import { BadRequestException } from '@nestjs/common';

import { DEFAULT_DOCUMENT_ORDER, parseDocumentListSort } from './documents-sort.util';

/**
 * L'ordinamento dell'elenco documenti (`14` §H15).
 *
 * ⭐ Le prove che contano sono due: che una colonna sconosciuta **si faccia
 * sentire** invece di essere ignorata, e che l'ordine finisca **sempre** con un
 * tie-break — senza, la paginazione può mostrare due volte la stessa riga e mai
 * un'altra, e nulla lo segnala.
 */
describe('parseDocumentListSort', () => {
  it('senza parametro resta l’ordine di sempre', () => {
    expect(parseDocumentListSort(undefined)).toEqual(DEFAULT_DOCUMENT_ORDER);
    expect(parseDocumentListSort('')).toEqual(DEFAULT_DOCUMENT_ORDER);
    expect(parseDocumentListSort('   ')).toEqual(DEFAULT_DOCUMENT_ORDER);
  });

  it('traduce una chiave sola', () => {
    expect(parseDocumentListSort('total:asc')).toEqual([{ totalMinor: 'asc' }, { id: 'asc' }]);
  });

  it('⭐ più chiavi restano nell’ordine di priorità in cui arrivano', () => {
    expect(parseDocumentListSort('documentDate:desc,total:asc')).toEqual([
      { documentDate: 'desc' },
      { totalMinor: 'asc' },
      { id: 'asc' },
    ]);
  });

  it('⚠️ «Numero» è il progressivo, cioè anno + numero — non la stringa del riferimento', () => {
    expect(parseDocumentListSort('reference:desc')).toEqual([
      { year: 'desc' },
      { number: 'desc' },
      { id: 'asc' },
    ]);
  });

  it('le righe si contano dalla relazione, non da un campo denormalizzato', () => {
    expect(parseDocumentListSort('lineCount:asc')).toEqual([
      { lines: { _count: 'asc' } },
      { id: 'asc' },
    ]);
  });

  it('la direzione può mancare: si intende crescente', () => {
    expect(parseDocumentListSort('total')).toEqual([{ totalMinor: 'asc' }, { id: 'asc' }]);
  });

  it('⛔ una colonna che il database non sa ordinare è un 400, non un silenzio', () => {
    expect(() => parseDocumentListSort('counterparty:asc')).toThrow(BadRequestException);
    expect(() => parseDocumentListSort('type:asc')).toThrow(BadRequestException);
    expect(() => parseDocumentListSort('status:asc')).toThrow(BadRequestException);
  });

  it('⛔ una direzione inventata è un 400', () => {
    expect(() => parseDocumentListSort('total:sideways')).toThrow(BadRequestException);
  });

  it('il messaggio dice quali colonne sono ordinabili', () => {
    expect(() => parseDocumentListSort('pippo:asc')).toThrow(/documentDate, reference/);
  });

  it('la stessa colonna ripetuta vale una volta: comanda la prima scelta', () => {
    expect(parseDocumentListSort('total:asc,total:desc')).toEqual([
      { totalMinor: 'asc' },
      { id: 'asc' },
    ]);
  });

  it('⭐ l’ordine finisce SEMPRE con il tie-break, o la paginazione perde righe', () => {
    for (const chiave of ['documentDate:desc', 'reference:asc', 'lineCount:desc', 'total:asc']) {
      const ordine = parseDocumentListSort(chiave);
      expect(ordine.at(-1)).toEqual({ id: 'asc' });
    }
  });
});
