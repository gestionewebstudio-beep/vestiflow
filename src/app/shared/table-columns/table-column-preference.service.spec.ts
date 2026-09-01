import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { of } from 'rxjs';

import { AuthService } from '@core/auth';

import { ColumnFilterStore } from './column-filter.store';
import { TableViewId, TableViewPresetId } from './table-column.model';
import { TableColumnPreferenceService } from './table-column-preference.service';
import { TableViewPreferenceApiService } from './table-view-preference-api.service';

const TEST_DEFS = [
  { id: 'name', label: 'Nome', defaultVisible: true },
  { id: 'sku', label: 'SKU', defaultVisible: true },
] as const;

const TEST_PRESETS = {
  [TableViewPresetId.Default]: ['name', 'sku'],
  [TableViewPresetId.Warehouse]: ['sku'],
  [TableViewPresetId.Accountant]: ['name'],
  [TableViewPresetId.Supplier]: ['name', 'sku'],
  [TableViewPresetId.Analysis]: ['name'],
  [TableViewPresetId.Operational]: ['name', 'sku'],
};

describe('TableColumnPreferenceService', () => {
  function setup() {
    const storage = new Map<string, string>();
    const documentMock = {
      defaultView: {
        localStorage: {
          getItem: (key: string) => storage.get(key) ?? null,
          setItem: (key: string, value: string) => {
            storage.set(key, value);
          },
          removeItem: (key: string) => {
            storage.delete(key);
          },
        },
      },
    };

    TestBed.configureTestingModule({
      providers: [
        TableColumnPreferenceService,
        { provide: DOCUMENT, useValue: documentMock },
        {
          provide: AuthService,
          useValue: { currentUser: () => ({ id: 'user-1', tenantId: 'tenant-1' }) },
        },
        {
          provide: TableViewPreferenceApiService,
          useValue: {
            load: vi.fn().mockReturnValue(of(null)),
            save: vi.fn().mockReturnValue(of(undefined)),
          },
        },
      ],
    });

    const service = TestBed.inject(TableColumnPreferenceService);
    service.registerView(TableViewId.ProductsList, TEST_DEFS, TEST_PRESETS);
    return service;
  }

  it('resetToDefault ripristina preset default e colonne visibili', () => {
    const service = setup();
    service.toggleColumn(TableViewId.ProductsList, 'sku');
    expect(service.isColumnVisible(TableViewId.ProductsList, 'sku')).toBe(false);

    service.resetToDefault(TableViewId.ProductsList);

    expect(service.state(TableViewId.ProductsList)().presetId).toBe(TableViewPresetId.Default);
    expect(service.isColumnVisible(TableViewId.ProductsList, 'sku')).toBe(true);
    expect(service.visibleColumnIds(TableViewId.ProductsList)).toEqual(['name', 'sku']);
  });

  /*
    ⭐ **COLONNA SPENTA, FILTRO SPENTO** — `regole-stile-ui` §5.

    ⛔ Il CONTROLLO spariva già da sé (l'intestazione non c'è più, e il pannello
    compatto elenca le sole colonne visibili). A restare era la RESTRIZIONE:
    l'elenco continuava a mostrare meno righe per un criterio invisibile, e
    l'unico modo di toglierlo era riaccendere la colonna.
  */
  describe('spegnere una colonna spegne il suo filtro', () => {
    it('⛔ dal selettore Colonne', () => {
      const service = setup();
      const filtri = TestBed.inject(ColumnFilterStore);
      filtri.imposta(TableViewId.ProductsList, {
        columnId: 'sku',
        value: { kind: 'text', text: 'ABC' },
      });
      expect(filtri.stato(TableViewId.ProductsList)()['sku']).toBeDefined();

      service.toggleColumn(TableViewId.ProductsList, 'sku');

      expect(filtri.stato(TableViewId.ProductsList)()['sku']).toBeUndefined();
    });

    /*
      ⚠️ Un preset ne spegne dieci in un colpo, ed è la ragione per cui la
      pulizia sta in `commit` e non dentro `toggleColumn`.
    */
    it('⛔ e anche applicando un preset che la esclude', () => {
      const service = setup();
      const filtri = TestBed.inject(ColumnFilterStore);
      filtri.imposta(TableViewId.ProductsList, {
        columnId: 'sku',
        value: { kind: 'values', values: ['X'] },
      });

      // Il preset «Contabile» porta la sola colonna «name».
      service.applyPreset(TableViewId.ProductsList, TableViewPresetId.Accountant);

      expect(service.isColumnVisible(TableViewId.ProductsList, 'sku')).toBe(false);
      expect(filtri.stato(TableViewId.ProductsList)()['sku']).toBeUndefined();
    });

    /*
      ⚠️ **La metà che conta**: una pulizia troppo larga si rompe restando verde.
      Il filtro di una colonna che RESTA accesa non si tocca — altrimenti
      riordinare o fissare una colonna azzererebbe i filtri di tutte le altre.
    */
    it('⚠️ e NON tocca il filtro di una colonna che resta accesa', () => {
      const service = setup();
      const filtri = TestBed.inject(ColumnFilterStore);
      filtri.imposta(TableViewId.ProductsList, {
        columnId: 'name',
        value: { kind: 'text', text: 'rossi' },
      });

      service.toggleColumn(TableViewId.ProductsList, 'sku');

      expect(filtri.stato(TableViewId.ProductsList)()['name']).toEqual({
        kind: 'text',
        text: 'rossi',
      });
    });
  });
});
