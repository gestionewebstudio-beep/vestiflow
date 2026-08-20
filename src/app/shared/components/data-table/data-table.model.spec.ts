import { describe, expect, it } from 'vitest';

import { ariaSortOf, nextSort, sortDirectionOf, sortRankOf } from './data-table.model';
import type { DataTableSort } from './data-table.model';

const DATA_ASC: DataTableSort = { columnId: 'data', direction: 'asc' };
const DATA_DESC: DataTableSort = { columnId: 'data', direction: 'desc' };
const SKU_ASC: DataTableSort = { columnId: 'sku', direction: 'asc' };

/**
 * Le regole dell'ordinamento vivono nel modello e non nel componente: così si
 * provano senza rendere una tabella, ed è il genere di regola che altrimenti
 * nessuno prova.
 */
describe('nextSort — il ciclo, su una colonna sola', () => {
  it('da nessun ordinamento parte da crescente', () => {
    expect(nextSort([], 'data')).toEqual([DATA_ASC]);
  });

  it('crescente diventa decrescente', () => {
    expect(nextSort([DATA_ASC], 'data')).toEqual([DATA_DESC]);
  });

  /** ⭐ Il terzo passo TOGLIE l'ordinamento: si può tornare al predefinito. */
  it('⭐ decrescente esce, e si torna all’ordine del server', () => {
    expect(nextSort([DATA_DESC], 'data')).toEqual([]);
  });
});

/**
 * ⭐ Il comportamento che distingue un gestionale da un elenco qualsiasi: la
 * colonna premuta comanda, **ma la precedente non si perde** — decide a parità.
 */
describe('nextSort — più chiavi', () => {
  it('⭐ una seconda colonna scavalca la prima senza cancellarla', () => {
    expect(nextSort([DATA_ASC], 'sku')).toEqual([SKU_ASC, DATA_ASC]);
  });

  it('la terza si mette in testa e le altre scalano', () => {
    const dopo = nextSort([SKU_ASC, DATA_ASC], 'prodotto');

    expect(dopo.map((sort) => sort.columnId)).toEqual(['prodotto', 'sku', 'data']);
  });

  /**
   * ⚠️ Premere una chiave SECONDARIA la promuove a primaria e la fa avanzare nel
   * ciclo: è un solo gesto, e l'operatore che vuole «adesso comanda questa» non
   * deve prima toglierla e poi rimetterla.
   */
  it('⚠️ premere una chiave secondaria la porta in testa e la fa avanzare', () => {
    expect(nextSort([SKU_ASC, DATA_ASC], 'data')).toEqual([DATA_DESC, SKU_ASC]);
  });

  it('l’ultima pressione toglie solo quella colonna, le altre restano', () => {
    expect(nextSort([DATA_DESC, SKU_ASC], 'data')).toEqual([SKU_ASC]);
  });
});

describe('ariaSortOf', () => {
  /**
   * ⚠️ Lo annuncia **solo la primaria**: ARIA raccomanda un `aria-sort` per
   * volta, e dichiararne tre direbbe a chi ascolta che la tabella è ordinata in
   * tre modi contemporaneamente. Le secondarie vivono nel nome del pulsante.
   */
  it('⚠️ solo la colonna primaria annuncia il proprio verso', () => {
    const chiavi = [SKU_ASC, DATA_DESC];

    expect(ariaSortOf(chiavi, 'sku')).toBe('ascending');
    expect(ariaSortOf(chiavi, 'data')).toBe('none');
  });

  it('senza ordinamento nessuna colonna lo annuncia', () => {
    expect(ariaSortOf([], 'data')).toBe('none');
  });
});

describe('sortRankOf e sortDirectionOf', () => {
  it('la posizione conta da 1, e manca se la colonna non ordina', () => {
    const chiavi = [SKU_ASC, DATA_DESC];

    expect(sortRankOf(chiavi, 'sku')).toBe(1);
    expect(sortRankOf(chiavi, 'data')).toBe(2);
    expect(sortRankOf(chiavi, 'prodotto')).toBeNull();
  });

  /** Il verso serve alla freccia, e ce l'ha ogni chiave — non solo la primaria. */
  it('il verso è noto anche per le chiavi secondarie', () => {
    expect(sortDirectionOf([SKU_ASC, DATA_DESC], 'data')).toBe('desc');
    expect(sortDirectionOf([SKU_ASC], 'data')).toBeNull();
  });
});
