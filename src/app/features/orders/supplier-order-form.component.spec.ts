import { provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { AppErrorKind } from '@core/models/app-error.model';
import { SupplierOrderStatus } from '@core/models/supplier-order.model';
import { OperationalLocationsService } from '@core/services/operational-locations.service';
import { ProductService } from '@features/products/services/product.service';
import { InventoryService } from '@features/inventory/services/inventory.service';

import { SupplierOrderFormComponent } from './supplier-order-form.component';
import { SupplierOrderService } from './services/supplier-order.service';
import { SupplierService } from './services/supplier.service';

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
          useValue: {
            locations: () => LOCATIONS,
          },
        },
        {
          provide: SupplierOrderService,
          useValue: { createOrder },
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

    await user.clear(screen.getByLabelText('Quantità'));
    await user.type(screen.getByLabelText('Quantità'), '2');
    await user.clear(screen.getByLabelText('Costo unitario'));
    await user.type(screen.getByLabelText('Costo unitario'), '12,50');

    await user.click(screen.getByRole('button', { name: 'Salva bozza' }));

    expect(createOrder).toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent('Errore del server');
  });
});
