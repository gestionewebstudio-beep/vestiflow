import { provideRouter } from '@angular/router';
import { render, screen, waitFor } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ShopifyShopChangePreviewDto } from '../../models/shopify-shop-change.dto';
import { ShopifyConnectionService } from '../../services/shopify-connection.service';
import { ShopifyShopChangeWizardComponent } from './shopify-shop-change-wizard.component';

const PREVIEW: ShopifyShopChangePreviewDto = {
  currentShopDomain: 'store.myshopify.com',
  counts: {
    shopifyProducts: 12,
    shopifyVariants: 30,
    shopifyCustomers: 4,
    shopifySalesOrders: 2,
    inventoryLevels: 18,
    stockMovements: 0,
    shopifyLinkedLocations: 2,
    removableShopifyLocations: 1,
  },
  blockers: [],
};

const PREVIEW_WITH_BLOCKER: ShopifyShopChangePreviewDto = {
  ...PREVIEW,
  blockers: [
    {
      code: 'supplier_orders_open',
      message: 'Ordini fornitore aperti su location Shopify.',
      references: [{ type: 'supplier_order', id: 'po-1', reference: 'PO-2026-0001' }],
    },
  ],
};

function createShopifyMock(preview: ShopifyShopChangePreviewDto = PREVIEW) {
  return {
    previewShopChange: vi.fn(() => of(preview)),
    purgeShopifyData: vi.fn(() =>
      of({
        purged: {
          products: 12,
          customers: 4,
          salesOrders: 2,
          stockMovements: 0,
          inventoryLevels: 18,
          inventoryCountLines: 0,
          locations: 1,
        },
      }),
    ),
    disconnect: vi.fn(() => of({ disconnected: true as const })),
    beginAuth: vi.fn(() => of({ authorizeUrl: 'https://shopify.com/oauth' })),
  };
}

describe('ShopifyShopChangeWizardComponent', () => {
  beforeEach(() => {
    if (!HTMLDialogElement.prototype.showModal) {
      HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
        this.open = true;
      };
    }
    if (!HTMLDialogElement.prototype.close) {
      HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
        this.open = false;
      };
    }
  });

  async function setup(options?: {
    mode?: 'change' | 'disconnect';
    preview?: ShopifyShopChangePreviewDto;
    shopifyMock?: ReturnType<typeof createShopifyMock>;
  }) {
    const shopifyMock = options?.shopifyMock ?? createShopifyMock(options?.preview);
    if (options?.preview) {
      shopifyMock.previewShopChange.mockReturnValue(of(options.preview));
    }

    const completed = vi.fn();
    const dismissed = vi.fn();

    const { fixture } = await render(ShopifyShopChangeWizardComponent, {
      providers: [provideRouter([]), { provide: ShopifyConnectionService, useValue: shopifyMock }],
      componentInputs: {
        open: true,
        mode: options?.mode ?? 'change',
      },
    });

    fixture.componentInstance.completed.subscribe(completed);
    fixture.componentInstance.dismissed.subscribe(dismissed);

    return { fixture, shopifyMock, completed, dismissed };
  }

  it('carica anteprima e mostra conteggi in modalità cambio negozio', async () => {
    await setup();

    expect(await screen.findByRole('heading', { name: 'Cambia negozio Shopify' })).toBeVisible();
    expect(await screen.findByText('12')).toBeVisible();
    expect(screen.getByText('Prodotti Shopify')).toBeVisible();
  });

  it('usa titolo disconnect in modalità rimozione dati', async () => {
    await setup({ mode: 'disconnect' });

    expect(await screen.findByRole('heading', { name: 'Rimuovi dati Shopify' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Disconnetti senza rimuovere' })).toBeVisible();
  });

  it('deseleziona catalogo bloccato e consente purge parziale', async () => {
    await setup({ preview: PREVIEW_WITH_BLOCKER });

    await screen.findByText('Ordini fornitore aperti su location Shopify.');

    const catalogCheckbox = screen.getByRole('checkbox', {
      name: /Catalogo importato da Shopify/i,
    });
    expect(catalogCheckbox).toBeDisabled();
    expect(catalogCheckbox).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Continua' })).toBeEnabled();
  });

  it('passa allo step conferma da anteprima', async () => {
    const user = userEvent.setup();
    await setup();

    await screen.findByText('Prodotti Shopify');
    await user.click(screen.getByRole('button', { name: 'Continua' }));

    expect(await screen.findByLabelText(/Digita il dominio del negozio attuale/i)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Rimuovi dati selezionati' })).toBeVisible();
  });

  it('segnala dominio non corrispondente in conferma purge', async () => {
    const user = userEvent.setup();
    await setup();

    await screen.findByText('Prodotti Shopify');
    await user.click(screen.getByRole('button', { name: 'Continua' }));

    const domainInput = await screen.findByLabelText(/Digita il dominio del negozio attuale/i);
    await user.type(domainInput, 'altro.myshopify.com');
    await user.click(screen.getByRole('checkbox', { name: /Capisco che l'operazione/i }));
    await user.click(screen.getByRole('button', { name: 'Rimuovi dati selezionati' }));

    expect(
      await screen.findByText(/dominio inserito non corrisponde al negozio attualmente collegato/i),
    ).toBeVisible();
  });

  it('disconnette senza purge in modalità disconnect', async () => {
    const user = userEvent.setup();
    const shopifyMock = createShopifyMock();
    const { completed } = await setup({ mode: 'disconnect', shopifyMock });

    await screen.findByText('Prodotti Shopify');
    await user.click(screen.getByRole('button', { name: 'Disconnetti senza rimuovere' }));

    await waitFor(() => {
      expect(shopifyMock.disconnect).toHaveBeenCalled();
      expect(completed).toHaveBeenCalled();
    });
    expect(shopifyMock.purgeShopifyData).not.toHaveBeenCalled();
  });

  it('mostra errore se anteprima fallisce', async () => {
    const shopifyMock = createShopifyMock();
    shopifyMock.previewShopChange.mockReturnValue(
      throwError(() => ({ error: { message: 'Anteprima non disponibile' } })),
    );

    await setup({ shopifyMock });

    expect(await screen.findByText('Anteprima non disponibile')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Riprova' })).toBeVisible();
  });
});
