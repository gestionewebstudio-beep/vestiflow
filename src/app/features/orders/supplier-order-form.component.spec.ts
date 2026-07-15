import { provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { AppErrorKind } from '@core/models/app-error.model';
import { SupplierOrderStatus } from '@core/models/supplier-order.model';
import { OperationalLocationsService } from '@core/services/operational-locations.service';
import { PaymentOptionsService } from '@core/services/payment-options.service';
import { VatCodeService } from '@core/services/vat-code.service';
import { ProductService } from '@features/products/services/product.service';
import { InventoryService } from '@features/inventory/services/inventory.service';

import { SupplierOrderFormComponent } from './supplier-order-form.component';
import { SupplierOrderService } from './services/supplier-order.service';
import { SupplierService } from '@features/suppliers/services/supplier.service';
import { TableColumnPreferenceService } from '@shared/table-columns/table-column-preference.service';
import { signal } from '@angular/core';

const SUPPLIERS = [
  { id: 'sup-1', tenantId: 't1', name: 'Tessuti Italia', email: null, phone: null },
];
const LOCATIONS = [
  {
    id: 'loc-1',
    tenantId: 't1',
    name: 'Milano',
    code: 'MIL',
    isActive: true,
    shopifyLocationId: null,
  },
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

function operationalLocationsMock(locations: typeof LOCATIONS) {
  return {
    locations: () => locations,
    writeLocations: () => locations,
    actionLocations: () => locations,
    transferTargetLocations: () => locations,
    isFixedSingleStore: () => false,
    fixedSingleStoreLocationId: () => null,
    fixedSingleStoreLabel: () => null,
  };
}

function tableColumnPreferenceMock() {
  const defaultState = {
    presetId: 'default' as const,
    columnOrder: ['variant', 'quantity', 'unitCost', 'lineTotal', 'actions'],
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
      : vi.fn(() => of({ id: 'po-1', status: SupplierOrderStatus.Draft }));

    const { fixture } = await render(SupplierOrderFormComponent, {
      providers: [
        provideRouter([]),
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
          provide: InventoryService,
          useValue: { getLocations: () => of(LOCATIONS) },
        },
        {
          provide: OperationalLocationsService,
          useValue: operationalLocationsMock(LOCATIONS),
        },
        {
          provide: SupplierOrderService,
          useValue: { createOrder },
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

  it('mostra errori di validazione al submit senza dati obbligatori', async () => {
    const user = userEvent.setup();
    await setup();

    await user.click(screen.getByRole('button', { name: 'Salva bozza' }));

    expect(await screen.findByText('Seleziona un fornitore.')).toBeVisible();
    expect(await screen.findByText('Seleziona la location.')).toBeVisible();
  });

  it('consente di aggiungere una riga ordine', async () => {
    const user = userEvent.setup();
    await setup();

    const rowsBefore = screen.getAllByRole('button', { name: 'Rimuovi riga' }).length;
    await user.click(screen.getByRole('button', { name: 'Aggiungi riga' }));

    expect(screen.getAllByRole('button', { name: 'Rimuovi riga' })).toHaveLength(rowsBefore + 1);
  });

  it('mostra errore inline quando il salvataggio fallisce', async () => {
    const user = userEvent.setup();
    const { createOrder } = await setup({ createFails: true });

    await user.click(screen.getByRole('button', { name: 'Fornitore' }));
    await user.click(screen.getByRole('option', { name: 'Tessuti Italia' }));

    await user.click(screen.getByRole('button', { name: 'Location di destinazione' }));
    await user.click(screen.getByRole('option', { name: 'Milano' }));

    await user.click(screen.getAllByRole('button', { name: 'Variante' })[0]!);
    await user.type(screen.getByLabelText('Cerca variante per prodotto o SKU'), 'mag');
    await user.click(
      await screen.findByRole('option', { name: 'Maglietta / M / Rosso, SKU MAG-M-ROSSO' }),
    );

    const qtyInput = screen.getByRole('spinbutton');
    await user.clear(qtyInput);
    await user.type(qtyInput, '2');
    const costInput = screen.getByPlaceholderText('0,00');
    await user.clear(costInput);
    await user.type(costInput, '12,50');

    await user.click(screen.getByRole('button', { name: 'Salva bozza' }));

    expect(createOrder).toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent('Errore del server');
  });
});
