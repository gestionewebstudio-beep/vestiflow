import { describe, expect, it } from 'vitest';

import { AdjustmentDirection, StockMovementType } from '@core/models/stock-movement.model';
import type { StockMovement } from '@core/models/stock-movement.model';
import { sortByValue } from '@shared/utils/sort-values.util';

import {
  formatMovementQuantity,
  isMovementSortColumn,
  MOVEMENT_SORT_KINDS,
  movementSignedQuantity,
} from './movement-sort.util';

function movimento(patch: Partial<StockMovement>): StockMovement {
  return {
    id: 'mov',
    type: StockMovementType.Load,
    quantity: 1,
    sku: '',
    createdAt: '2026-08-17T10:00:00.000Z',
    ...patch,
  } as StockMovement;
}

/**
 * ⛔ Queste quattro prove esistono perché in ognuno di questi casi **la versione
 * sbagliata passa a occhio**: l'elenco si riordina, la freccia gira, e l'ordine
 * è plausibile. Sono i modi in cui «ordina il testo che vedi» fallisce in
 * silenzio, e nessuno li segnalerebbe come difetti.
 */
describe('ordinamento dei movimenti — i quattro casi che ingannano', () => {
  /**
   * ⭐ Dicembre contro gennaio. Ordinata come testo, «1 dic 2026» precede
   * «2 gen 2026» — l'alfabeto del giorno, poi il nome del mese.
   */
  it('⭐ le date si ordinano per istante, non per come sono scritte', () => {
    const date = [
      '2026-12-01T09:00:00.000Z',
      '2026-01-02T10:05:00.000Z',
      '2026-08-17T16:30:00.000Z',
    ];

    expect(sortByValue(date, (d) => d, MOVEMENT_SORT_KINDS.createdAt, 'asc', 'EUR')).toEqual([
      '2026-01-02T10:05:00.000Z',
      '2026-08-17T16:30:00.000Z',
      '2026-12-01T09:00:00.000Z',
    ]);
  });

  /**
   * ⚠️ Uno scarico contro un carico. In cella il meno è **tipografico**
   * (U+2212): `parseFloat('−2')` è `NaN`, quindi ogni uscita varrebbe zero e si
   * mescolerebbe con le entrate.
   */
  it('⚠️ le quantità si ordinano col segno vero, non con quello a schermo', () => {
    const movimenti = [
      movimento({ type: StockMovementType.Load, quantity: 40 }),
      movimento({ type: StockMovementType.Sale, quantity: 2 }),
      movimento({ type: StockMovementType.Unload, quantity: 100 }),
      movimento({ type: StockMovementType.Return, quantity: 3 }),
    ];

    const ordinati = sortByValue(
      movimenti,
      movementSignedQuantity,
      MOVEMENT_SORT_KINDS.signedQuantity,
      'asc',
      'EUR',
    );

    expect(ordinati.map(movementSignedQuantity)).toEqual([-100, -2, 3, 40]);
    // E la stampa resta quella di prima: il segno tipografico è una scelta di resa.
    expect(ordinati.map(formatMovementQuantity)).toEqual(['−100', '−2', '+3', '+40']);
  });

  /** Una rettifica in diminuzione è un'uscita, anche se il tipo non lo dice. */
  it('la rettifica prende il segno dalla sua direzione', () => {
    const giu = movimento({
      type: StockMovementType.Adjustment,
      quantity: 5,
      direction: AdjustmentDirection.Decrease,
    });
    const su = movimento({
      type: StockMovementType.Adjustment,
      quantity: 5,
      direction: AdjustmentDirection.Increase,
    });

    expect(movementSignedQuantity(giu)).toBe(-5);
    expect(movementSignedQuantity(su)).toBe(5);
  });

  /**
   * ⚠️ Il trasferimento non porta segno: non toglie e non aggiunge, sposta. Un
   * «+3» su quella riga affermerebbe un carico che non è avvenuto.
   */
  it('⚠️ il trasferimento si mostra senza segno, ma si ordina come positivo', () => {
    const trasferimento = movimento({ type: StockMovementType.Transfer, quantity: 3 });

    expect(formatMovementQuantity(trasferimento)).toBe('3');
    expect(movementSignedQuantity(trasferimento)).toBe(3);
  });

  /** Un valore assente non si mescola con quelli presenti: resta a un estremo. */
  it('una riga senza valore resta a un estremo', () => {
    const valori = ['Maglia', '', 'Abito'];

    expect(sortByValue(valori, (v) => v, MOVEMENT_SORT_KINDS.product, 'asc', 'EUR')).toEqual([
      '',
      'Abito',
      'Maglia',
    ]);
  });

  /**
   * ⚠️ Due righe che differiscono solo per la maiuscola non devono finire agli
   * antipodi: `localeCompare` con `sensitivity: 'base'` le tiene accanto, un
   * confronto per codice ASCII no.
   */
  it('⚠️ maiuscole e accenti non spezzano l’ordine alfabetico', () => {
    const valori = ['zebra', 'Àlbero', 'albero', 'Zebra'];

    const ordinati = sortByValue(valori, (v) => v, MOVEMENT_SORT_KINDS.product, 'asc', 'EUR');

    expect(ordinati.slice(0, 2).map((v) => v.toLowerCase())).toEqual(['àlbero', 'albero']);
    expect(ordinati.slice(2).map((v) => v.toLowerCase())).toEqual(['zebra', 'zebra']);
  });
});

describe('MOVEMENT_SORT_KINDS', () => {
  /**
   * ⛔ La prova che tiene fermo il requisito: **tutte** le colonne dichiarate
   * ordinabili devono avere un modo di confronto — comprese le quattro che in
   * SQL non si sarebbero potute ordinare (Codice articolo, Prodotto, Documento,
   * Location). È il caricamento completo a renderle possibili.
   */
  it('⛔ copre tutte le undici colonne, comprese le quattro difficili', () => {
    expect(Object.keys(MOVEMENT_SORT_KINDS)).toHaveLength(11);
    for (const colonna of ['articleCode', 'product', 'documentRef', 'locationLabel']) {
      expect(isMovementSortColumn(colonna)).toBe(true);
    }
  });

  it('una colonna sconosciuta non è ordinabile', () => {
    expect(isMovementSortColumn('inventata')).toBe(false);
  });
});
