import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { AuthService } from '@core/auth';
import { SalesOrderSource } from '@core/models/sales-order.model';
import type { SalesOrder } from '@core/models/sales-order.model';
import { UserRole } from '@core/models/user.model';
import { DEFAULT_CURRENCY } from '@core/utils/money.util';
import { BackgroundBlobExportService } from '@core/services/background-blob-export.service';
import { CustomerService } from '@domain/customers/services/customer.service';
import { OperationalLocationsService } from '@domain/inventory/services/operational-locations.service';
import { SalesOrderService } from '@domain/sales-orders/services/sales-order.service';
import { ShopifyConnectionService } from '@domain/channels/shopify/services/shopify-connection.service';
import { ShopifySyncWatchService } from '@domain/channels/shopify/services/shopify-sync-watch.service';
import { TableViewPreferenceApiService } from '@shared/table-columns/table-view-preference-api.service';
import type { DataTableSort } from '@shared/components/data-table/data-table.model';

import { SalesOrderListComponent } from './sales-order-list.component';

const ZERO = { amountMinor: 0, currencyCode: DEFAULT_CURRENCY };

const ORDINE = {
  id: 'so-1',
  tenantId: 'ten-1',
  createdAt: '2026-08-20T08:00:00.000Z',
  updatedAt: '2026-08-20T08:00:00.000Z',
  orderNumber: 'ORD-0042',
  source: SalesOrderSource.Manual,
  customerName: 'Cliente di prova',
  placedAt: '2026-08-20T08:00:00.000Z',
  currency: DEFAULT_CURRENCY,
  subtotal: ZERO,
  tax: ZERO,
  total: ZERO,
  lines: [],
} as unknown as SalesOrder;

async function renderList(ordini: readonly SalesOrder[] = [], sort?: string) {
  const data = { listProfile: 'sales-orders' };
  const queryParams = sort ? { sort } : {};
  return render(SalesOrderListComponent, {
    providers: [
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: {
          data: of(data),
          snapshot: { data, queryParamMap: convertToParamMap(queryParams) },
          queryParamMap: of(convertToParamMap(queryParams)),
        },
      },
      {
        provide: AuthService,
        useValue: { currentUser: () => ({ role: UserRole.Owner, permissions: [] }) },
      },
      {
        provide: SalesOrderService,
        useValue: {
          getSalesOrders: () =>
            of({
              data: ordini,
              meta: {
                page: 1,
                pageSize: 20,
                total: ordini.length,
                totalPages: ordini.length > 0 ? 1 : 0,
              },
            }),
        },
      },
      { provide: CustomerService, useValue: { getCustomers: () => of({ data: [], meta: {} }) } },
      { provide: OperationalLocationsService, useValue: { locations: () => [] } },
      { provide: ShopifyConnectionService, useValue: { getConnection: () => of(null) } },
      {
        provide: ShopifySyncWatchService,
        useValue: { watchRemoteDataChanged: () => of(false) },
      },
      { provide: BackgroundBlobExportService, useValue: { isActive: () => false, start: vi.fn() } },
      {
        provide: TableViewPreferenceApiService,
        useValue: { load: () => of(null), save: () => of(undefined) },
      },
    ],
  });
}

function pagina(view: { fixture: { componentInstance: unknown } }) {
  return view.fixture.componentInstance as {
    onSortChange: (chiavi: readonly DataTableSort[]) => void;
  };
}

/**
 * ⛔ **La riga si renderizza**: la stessa guardia degli altri due elenchi. Il
 * difetto che la motiva è di categoria — il motore riceve le callback come
 * valori, e una passata per nome arriva senza `this` (`14` §H14).
 */
describe('SalesOrderListComponent — una riga vera si renderizza', () => {
  it('la riga porta il proprio nome accessibile', async () => {
    await renderList([ORDINE]);

    expect(screen.getByRole('row', { name: /Apri ordine ORD-0042/i })).not.toBeNull();
  });
});

/** L'ordinamento (`14` §H15): stessa grammatica, terza whitelist. */
describe('SalesOrderListComponent — l’ordinamento', () => {
  it('⛔ cambiare ordine riporta alla prima pagina', async () => {
    const view = await renderList([ORDINE]);
    const navigazione = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    pagina(view).onSortChange([{ columnId: 'customerName', direction: 'asc' }]);

    expect(navigazione).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ queryParams: { sort: 'customerName:asc', page: null } }),
    );
  });
});
