import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { of } from 'rxjs';

import { AuthService } from '@core/auth';

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
});
