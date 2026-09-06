import { describe, expect, it } from 'vitest';

import {
  countActiveListFilters,
  isListFilterActive,
  listFilterValue,
  type ListFilterDef,
} from './list-filter.model';

/**
 * Il contratto dei filtri di elenco: il conteggio del badge e l'azzeramento.
 *
 * ⭐ Sono le due regole di `14` §19, e sono quelle che si sbagliano in silenzio:
 * un badge che conta ciò che non restringe dice all'operatore che c'è una
 * restrizione dove non c'è, e un azzeramento troppo largo gli spegne le colonne.
 */

const periodo: ListFilterDef = {
  key: 'period',
  label: 'Periodo',
  kind: 'select',
  defaultValue: 'last30',
  // ⛔ Periodo di default: NON conta nel badge (`14` §19).
  countsAsActive: false,
};
const stato: ListFilterDef = { key: 'status', label: 'Stato', kind: 'select' };
const cliente: ListFilterDef = { key: 'customerId', label: 'Cliente', kind: 'select' };
const raggruppa: ListFilterDef = {
  key: 'groupBy',
  label: 'Raggruppa',
  kind: 'select',
  // Controllo di presentazione: non conta e non si azzera (`14` §19).
  countsAsActive: false,
  resettable: false,
};

const TUTTI = [periodo, stato, cliente, raggruppa];

describe('il valore di un filtro', () => {
  it('assente, nullo o indefinito valgono la stringa vuota', () => {
    expect(listFilterValue({}, 'status')).toBe('');
    expect(listFilterValue({ status: null }, 'status')).toBe('');
    expect(listFilterValue({ status: undefined }, 'status')).toBe('');
  });

  it('presente, vale se stesso', () => {
    expect(listFilterValue({ status: 'draft' }, 'status')).toBe('draft');
  });
});

describe('⭐ un filtro è ATTIVO solo se restringe davvero', () => {
  it('vuoto → non attivo', () => {
    expect(isListFilterActive(stato, {})).toBe(false);
  });

  it('valorizzato → attivo', () => {
    expect(isListFilterActive(stato, { status: 'draft' })).toBe(true);
  });

  it('⚠️ riportato al proprio default → NON attivo', () => {
    // Non restringe niente: contarlo direbbe che c'è una restrizione dove non c'è.
    expect(isListFilterActive(periodo, { period: 'last30' })).toBe(false);
  });

  it('⛔ `countsAsActive: false` non conta nemmeno quando è diverso dal default', () => {
    // `14` §19: il Periodo classificato come obbligatorio dalla pagina non entra
    // nel badge, qualunque valore abbia.
    expect(isListFilterActive(periodo, { period: 'thisYear' })).toBe(false);
  });
});

describe('⭐ il badge «Filtri (n)» conta solo le restrizioni opzionali', () => {
  it('nessun filtro attivo → 0', () => {
    expect(countActiveListFilters(TUTTI, { period: 'last30' })).toBe(0);
  });

  it('due filtri opzionali valorizzati → 2', () => {
    expect(countActiveListFilters(TUTTI, { status: 'draft', customerId: 'c-1' })).toBe(2);
  });

  it('⛔ Periodo e Raggruppa non entrano nel conto, nemmeno valorizzati', () => {
    const n = countActiveListFilters(TUTTI, {
      period: 'thisYear',
      groupBy: 'day',
      status: 'draft',
    });
    expect(n, 'conta il solo Stato').toBe(1);
  });
});
/**
 * ⛔ **Qui c’era un `describe` sull’azzeramento**, e la funzione che provava non
 * esiste più: `14` §19 dice COSA deve fare «Azzera filtri», ma il come dipende
 * dalla pagina — `document-list` sceglie il preset in base al profilo e ricalcola
 * le date. Il contenitore comune emette la richiesta; la pagina la esegue, e i
 * suoi test la provano dove vive.
 */
