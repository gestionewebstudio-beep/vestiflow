import { describe, expect, it } from 'vitest';

import {
  filterableColumns,
  isColumnFilterable,
  resolveColumnFilterKind,
} from './table-column-filter.util';
import type { TableColumnDef } from './table-column.model';

/** Una colonna minima: solo ciò che il modello richiede. */
function colonna(extra: Partial<TableColumnDef> = {}): TableColumnDef {
  return { id: 'x', label: 'X', ...extra };
}

describe('resolveColumnFilterKind — la dichiarazione vince', () => {
  it.each(['values', 'text', 'range'] as const)('⭐ filter: %s è quello che si usa', (kind) => {
    expect(resolveColumnFilterKind(colonna({ filter: kind }))).toBe(kind);
  });

  it('⭐ e vince ANCHE contro la deduzione che direbbe altro', () => {
    // Un totale in euro dedurrebbe `range`; se la colonna dichiara `values`
    // (poche fasce ricorrenti) comanda la dichiarazione.
    expect(resolveColumnFilterKind(colonna({ numeric: true, filter: 'values' }))).toBe('values');
  });

  it('⛔ filter: false toglie il filtro', () => {
    expect(resolveColumnFilterKind(colonna({ filter: false }))).toBeNull();
    expect(isColumnFilterable(colonna({ filter: false }))).toBe(false);
  });
});

describe('resolveColumnFilterKind — la deduzione', () => {
  it('⭐ una colonna che non dichiara NIENTE è filtrabile per valori', () => {
    // ⚠️ È l'asserzione che tiene in piedi l'opt-out. Senza, la util potrebbe
    //    tornare `null` per default e tutti i test sui rifiuti resterebbero
    //    verdi mentre nessuna colonna ha più un filtro.
    expect(resolveColumnFilterKind(colonna())).toBe('values');
    expect(isColumnFilterable(colonna())).toBe(true);
  });

  it('⭐ numeric → range', () => {
    expect(resolveColumnFilterKind(colonna({ numeric: true }))).toBe('range');
  });

  it.each(['code', 'truncate'] as const)('⭐ display %s → text (alta cardinalità)', (display) => {
    expect(resolveColumnFilterKind(colonna({ display }))).toBe('text');
  });

  it('⚠️ numeric batte display: un importo incolonnato resta un intervallo', () => {
    expect(resolveColumnFilterKind(colonna({ numeric: true, display: 'code' }))).toBe('range');
  });

  it('⚠️ numeric: false non è una dichiarazione di filtro', () => {
    // `numeric` è solo presentazione (vedi il suo commento nel modello): una
    // colonna alfanumerica non perde il filtro, lo prende per valori.
    expect(resolveColumnFilterKind(colonna({ numeric: false }))).toBe('values');
  });
});

describe('filterableColumns', () => {
  const colonne: readonly TableColumnDef[] = [
    colonna({ id: 'stato', label: 'Stato' }),
    colonna({ id: 'totale', label: 'Totale', numeric: true }),
    colonna({ id: 'azioni', label: 'Azioni', filter: false }),
    colonna({ id: 'nota', label: 'Nota', display: 'truncate' }),
  ];

  it('⭐ tiene tutte le colonne tranne quelle che si sono tolte', () => {
    expect(filterableColumns(colonne).map((c) => c.id)).toEqual(['stato', 'totale', 'nota']);
  });

  it('⛔ e non ne inventa: un elenco vuoto resta vuoto', () => {
    expect(filterableColumns([])).toEqual([]);
  });
});
