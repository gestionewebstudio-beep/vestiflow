import { provideRouter } from '@angular/router';
import { AuthService } from '@core/auth';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { AppErrorKind } from '@core/models/app-error.model';
import { SupplierOrderStatus } from '@core/models/supplier-order.model';
import { PaymentOptionsService } from '@core/services/payment-options.service';
import { VatCodeService } from '@core/services/vat-code.service';
import { ProductService } from '@features/products/services/product.service';

import { SupplierOrderFormComponent } from './supplier-order-form.component';
import { SupplierOrderService } from './services/supplier-order.service';
import { SupplierService } from '@features/suppliers/services/supplier.service';
import { TableColumnPreferenceService } from '@shared/table-columns/table-column-preference.service';
import { signal } from '@angular/core';

const SUPPLIERS = [
  { id: 'sup-1', tenantId: 't1', name: 'Tessuti Italia', email: null, phone: null },
];
const VARIANTS = [
  {
    variantId: 'var-1',
    productId: 'prod-1',
    productName: 'Maglietta',
    title: 'Maglietta / M / Rosso',
    sku: 'MAG-M-ROSSO',
  },
];

function tableColumnPreferenceMock() {
  const defaultState = {
    presetId: 'default' as const,
    columnOrder: ['product', 'quantity', 'unitCost', 'discount', 'vat', 'lineTotal', 'actions'],
    hiddenColumnIds: [] as string[],
    pinnedColumnIds: [] as string[],
    columnWidths: {} as Record<string, number>,
  };
  const stateSignal = signal(defaultState);
  return {
    registerView: vi.fn(),
    isColumnVisible: vi.fn(
      (_view: unknown, columnId: string) => !defaultState.hiddenColumnIds.includes(columnId),
    ),
    columnWidth: vi.fn((_view: unknown, _id: string, fallback: number) => fallback),
    setColumnWidth: vi.fn(),
    state: vi.fn(() => stateSignal.asReadonly()),
    columnDefs: vi.fn(() => []),
    presetMap: vi.fn(() => ({})),
    visibleColumns: vi.fn(() => () => []),
    visibleColumnIds: vi.fn(() => defaultState.columnOrder),
    applyPreset: vi.fn(),
    toggleColumn: vi.fn(),
    moveColumn: vi.fn(),
    togglePin: vi.fn(),
    resetToDefault: vi.fn(),
  };
}

describe('SupplierOrderFormComponent', () => {
  async function setup(options?: { createFails?: boolean }) {
    const createOrder = options?.createFails
      ? vi.fn(() =>
          throwError(() => ({
            kind: AppErrorKind.Server,
            message: 'Errore del server. Riprova più tardi.',
          })),
        )
      : vi.fn(() => of({ id: 'po-1', status: SupplierOrderStatus.Confirmed }));

    const { fixture } = await render(SupplierOrderFormComponent, {
      providers: [
        // Nessun permesso costi: il selettore articolo non deve mostrare il costo.
        { provide: AuthService, useValue: { currentUser: () => null } },
        // Catch-all: il test «ritorno alla lista» naviga davvero verso /app/orders.
        provideRouter([{ path: '**', children: [] }]),
        {
          provide: SupplierService,
          useValue: {
            getSuppliers: () => of(SUPPLIERS),
            createSupplier: vi.fn(),
          },
        },
        {
          provide: ProductService,
          useValue: {
            searchVariantSummaries: (query?: { search?: string }) =>
              query?.search && query.search.length >= 2 ? of(VARIANTS) : of([]),
          },
        },
        {
          provide: SupplierOrderService,
          useValue: {
            createOrder,
            getMeta: () => of({ nextReferencePreview: 'OF-2026-0042' }),
          },
        },
        {
          provide: TableColumnPreferenceService,
          useValue: tableColumnPreferenceMock(),
        },
        {
          provide: VatCodeService,
          useValue: { list: () => of([]) },
        },
        {
          provide: PaymentOptionsService,
          useValue: { list: () => of([]) },
        },
      ],
    });

    return { fixture, createOrder };
  }

  it('mostra l’anteprima della numerazione dai Numeratori', async () => {
    await setup();

    expect(await screen.findByText('OF-2026-0042')).toBeVisible();
  });

  it('mostra errori di validazione al submit senza dati obbligatori', async () => {
    const user = userEvent.setup();
    await setup();

    await user.click(screen.getByRole('button', { name: 'Salva ordine' }));

    expect(await screen.findByText('Seleziona un fornitore.')).toBeVisible();
  });

  it('consente di aggiungere una riga ordine', async () => {
    const user = userEvent.setup();
    await setup();

    const rowsBefore = screen.getAllByRole('button', { name: 'Rimuovi riga' }).length;
    await user.click(screen.getByRole('button', { name: 'Aggiungi riga' }));

    expect(screen.getAllByRole('button', { name: 'Rimuovi riga' })).toHaveLength(rowsBefore + 1);
  });

  it('permette lo switch costi netto/ivato dall’intestazione colonna', async () => {
    const user = userEvent.setup();
    await setup();

    expect(screen.getByText('Costo netto')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Modalità costi del documento' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Usa costi ivati' }));

    expect(screen.getByText('Costo ivato')).toBeVisible();
  });

  it('protegge l’uscita con modifiche non salvate (chip indietro → dialogo)', async () => {
    const user = userEvent.setup();
    await setup();

    const qtyInput = screen.getByRole('spinbutton');
    await user.clear(qtyInput);
    await user.type(qtyInput, '3');

    await user.click(screen.getByRole('link', { name: /Ordini Fornitori/ }));

    expect(await screen.findByRole('dialog')).toBeVisible();
    expect(screen.getByText('Modifiche non salvate')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Chiudi senza salvare' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Salva e chiudi' })).toBeVisible();
  });

  it('senza modifiche il ritorno alla lista non chiede conferma', async () => {
    const user = userEvent.setup();
    await setup();

    await user.click(screen.getByRole('link', { name: /Ordini Fornitori/ }));

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('mostra errore inline quando il salvataggio fallisce', async () => {
    const user = userEvent.setup();
    const { createOrder } = await setup({ createFails: true });

    await user.click(screen.getByRole('button', { name: 'Fornitore' }));
    await user.click(screen.getByRole('option', { name: 'Tessuti Italia' }));

    await user.click(screen.getAllByRole('button', { name: 'Articolo' })[0]!);
    await user.type(screen.getByLabelText('Cerca articolo per prodotto o SKU'), 'mag');
    await user.click(
      await screen.findByRole('option', { name: 'Maglietta / M / Rosso, SKU MAG-M-ROSSO' }),
    );

    const qtyInput = screen.getByRole('spinbutton');
    await user.clear(qtyInput);
    await user.type(qtyInput, '2');
    const costInput = screen.getByPlaceholderText('0,00');
    await user.clear(costInput);
    await user.type(costInput, '12,50');

    await user.click(screen.getByRole('button', { name: 'Salva ordine' }));

    expect(createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        supplierId: 'sup-1',
        costEntryMode: 'vat_excluded',
        lines: [
          expect.objectContaining({
            variantId: 'var-1',
            orderedQuantity: 2,
            enteredUnitCostMinor: 1250,
          }),
        ],
      }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Errore del server');
  });
});
