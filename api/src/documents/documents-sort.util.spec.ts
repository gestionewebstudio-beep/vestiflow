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

  /**
   * ⭐ Postgres ordina un `ENUM` per **ordine di dichiarazione**, non per il
   * testo del valore: `ORDER BY status` dà bozza → confermato → … → annullato,
   * cioè il ciclo di vita. Qui si fissa che quelle colonne sono ordinabili —
   * l'affermazione contraria aveva tenuto fuori due colonne per niente.
   */
  it('⭐ tipo e stato si ordinano: l’enum porta il proprio ordine', () => {
    expect(parseDocumentListSort('status:asc')).toEqual([{ status: 'asc' }, { id: 'asc' }]);
    expect(parseDocumentListSort('type:desc')).toEqual([{ type: 'desc' }, { id: 'asc' }]);
  });

  it('⛔ la controparte no: non è un campo, e la soluzione non è un CASE SQL', () => {
    expect(() => parseDocumentListSort('counterparty:asc')).toThrow(BadRequestException);
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
