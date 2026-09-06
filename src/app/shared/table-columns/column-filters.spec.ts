import { Component, input, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { ColumnFilterStore } from './column-filter.store';
import { createColumnFilters } from './column-filters';
import { TableViewId } from './table-column.model';

interface Riga {
  readonly id: string;
  readonly stato: string;
  readonly totale: number;
}

const RIGHE: readonly Riga[] = [
  { id: 'a', stato: 'Confermato', totale: 1000 },
  { id: 'b', stato: 'Bozza', totale: -500 },
  { id: 'c', stato: 'Confermato', totale: 250 },
];

const VISTA = TableViewId.SuppliersList;

const cellText = (r: Riga, columnId: string): string =>
  columnId === 'stato' ? r.stato : String(r.totale);

const numeroDi = (r: Riga, columnId: string): number | null =>
  columnId === 'totale' ? r.totale : null;

@Component({ template: '' })
class OspiteComponent {
  readonly viewId = input<TableViewId | undefined>(VISTA);
  readonly righe = signal<readonly Riga[]>(RIGHE);

  readonly filtrate = createColumnFilters({
    viewId: this.viewId,
    righe: this.righe,
    cellText,
    numeroDi,
  });
}

function monta(): { ospite: OspiteComponent; store: ColumnFilterStore; rileva: () => void } {
  const fixture = TestBed.createComponent(OspiteComponent);
  fixture.detectChanges();
  return {
    ospite: fixture.componentInstance,
    store: TestBed.inject(ColumnFilterStore),
    rileva: () => fixture.detectChanges(),
  };
}

const ids = (righe: readonly Riga[]): string[] => righe.map((r) => r.id);

describe('createColumnFilters', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
    TestBed.inject(ColumnFilterStore).azzera(VISTA);
  });

  it('senza filtri restituisce le righe intatte', () => {
    const { ospite } = monta();
    expect(ids(ospite.filtrate())).toEqual(['a', 'b', 'c']);
  });

  it('restringe secondo lo stato della vista', () => {
    const { ospite, store } = monta();
    store.imposta(VISTA, { columnId: 'stato', value: { kind: 'values', values: ['Confermato'] } });
    expect(ids(ospite.filtrate())).toEqual(['a', 'c']);
  });

  /*
    ⛔ **I NEGATIVI sono righe come le altre**: un reso o una nota di credito
    hanno totale negativo, e un intervallo che scende sotto zero deve prenderli.
  */
  it('⛔ un intervallo negativo prende le righe negative', () => {
    const { ospite, store } = monta();
    store.imposta(VISTA, { columnId: 'totale', value: { kind: 'range', max: 0 } });
    expect(ids(ospite.filtrate())).toEqual(['b']);
  });

  describe('le scelte registrate', () => {
    /*
      ⛔ **Vengono dalle righe NON filtrate**, ed è il difetto classico di questo
      controllo: lette dalle righe già ristrette, scelto «Bozza» sparirebbe
      «Confermato» dall'elenco delle scelte — il filtro si potrebbe stringere ma
      mai allargare.
    */
    it('⛔ restano complete anche con un filtro attivo', () => {
      const { store } = monta();
      expect(store.opzioniDi(VISTA, 'stato')).toEqual(['Bozza', 'Confermato']);

      store.imposta(VISTA, { columnId: 'stato', value: { kind: 'values', values: ['Bozza'] } });
      expect(store.opzioniDi(VISTA, 'stato')).toEqual(['Bozza', 'Confermato']);
    });

    it('seguono le righe quando l’elenco si ricarica', () => {
      const { ospite, store, rileva } = monta();
      ospite.righe.set([{ id: 'd', stato: 'Annullato', totale: 0 }]);
      rileva();
      expect(store.opzioniDi(VISTA, 'stato')).toEqual(['Annullato']);
    });
  });
});
