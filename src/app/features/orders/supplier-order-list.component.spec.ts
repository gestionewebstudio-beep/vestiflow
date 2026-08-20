import { Router, ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { render, screen } from '@testing-library/angular';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { AuthService } from '@core/auth';
import { SupplierOrderStatus } from '@core/models/supplier-order.model';
import type { SupplierOrder } from '@core/models/supplier-order.model';
import { UserRole } from '@core/models/user.model';
import { DEFAULT_CURRENCY } from '@core/utils/money.util';
import { SupplierOrderService } from '@domain/supplier-orders/services/supplier-order.service';
import type { ListAction } from '@shared/models/list-selection.model';

import { SupplierOrderListComponent } from './supplier-order-list.component';

const ZERO = { amountMinor: 0, currencyCode: DEFAULT_CURRENCY };

const ORDINE: SupplierOrder = {
  id: 'ord-1',
  tenantId: 'ten-1',
  createdAt: '2026-08-20T08:00:00.000Z',
  updatedAt: '2026-08-20T08:00:00.000Z',
  reference: 'OF-2026-0042',
  supplierId: 'sup-1',
  supplierName: 'Fornitore di prova',
  status: SupplierOrderStatus.Confirmed,
  currency: DEFAULT_CURRENCY,
  costEntryMode: 'vat_excluded',
  orderDate: '2026-08-20',
  lines: [],
  subtotal: ZERO,
  tax: ZERO,
  totalAmount: ZERO,
};

async function renderList(ordini: readonly SupplierOrder[] = []) {
  return render(SupplierOrderListComponent, {
    providers: [
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: { queryParamMap: convertToParamMap({}) },
          queryParamMap: of(convertToParamMap({})),
        },
      },
      {
        provide: AuthService,
        useValue: { currentUser: () => ({ role: UserRole.Owner, permissions: [] }) },
      },
      {
        provide: SupplierOrderService,
        useValue: {
          getSupplierOrders: () =>
            of({
              data: ordini,
              meta: {
                page: 1,
                pageSize: 20,
                total: ordini.length,
                totalPages: ordini.length > 0 ? 1 : 0,
              },
            }),
          exportExcel: vi.fn(),
        },
      },
    ],
  });
}

function azione(
  view: { fixture: { componentInstance: unknown } },
  id: string,
): ListAction | undefined {
  const component = view.fixture.componentInstance as {
    selectionActions: () => readonly ListAction[];
  };
  return component.selectionActions().find((candidata) => candidata.id === id);
}

/**
 * ⛔ **La riga si renderizza.** È la stessa guardia dell'elenco documenti, e sta
 * qui perché il difetto che la motiva è di categoria, non di pagina: il motore
 * riceve le callback come valori, e una passata per nome arriva senza `this`.
 * Un elenco i cui test rendono zero righe non se ne accorge (`14` §H14).
 */
describe('SupplierOrderListComponent — una riga vera si renderizza', () => {
  it('la riga porta il proprio nome accessibile', async () => {
    await renderList([ORDINE]);

    expect(screen.getByRole('row', { name: /Apri ordine OF-2026-0042/i })).not.toBeNull();
  });
});

/**
 * ⭐ Il **Dettaglio** (`14` §6, §E6): qui la destinazione esiste da sempre —
 * `orders/:id`, titolo «Dettaglio ordine fornitore», protetta dai soli permessi
 * di vista — e mancava soltanto il comando che ci porta.
 */
describe('SupplierOrderListComponent — l’azione Dettaglio', () => {
  it('la barra la dichiara, e pretende UN ordine', async () => {
    const view = await renderList();

    expect(azione(view, 'detail')?.label).toBe('Dettaglio');
    expect(azione(view, 'detail')?.requires).toBe('one');
  });

  it('apre la rotta di dettaglio dell’ordine scelto', async () => {
    const view = await renderList([ORDINE]);
    const navigazione = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    azione(view, 'detail')?.run?.({ scope: 'selection', ids: ['ord-1'] });

    expect(navigazione).toHaveBeenCalledWith(['/app/orders', 'ord-1']);
  });

  it('col bersaglio «filtered» non naviga da nessuna parte', async () => {
    const view = await renderList([ORDINE]);
    const navigazione = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    azione(view, 'detail')?.run?.({ scope: 'filtered' });

    expect(navigazione).not.toHaveBeenCalled();
  });
});
