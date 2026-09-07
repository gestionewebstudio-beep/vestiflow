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

  /*
    ⛔ **Qui c'erano tre prove del flusso di purga**: la selezione parziale delle
       categorie, il passaggio allo step di conferma, e il rifiuto del dominio
       sbagliato. Descrivevano una capacita' che non esiste piu': la rimozione
       dei dati Shopify e' sospesa in ogni sua forma (docs/24 §1.14).

    ⭐ Restano le due domande che contano: che le tre caselle siano spente e
       spiegate, e che il wizard non offra un comando che l'API rifiuterebbe.
  */
  it('mostra i blocker dell’anteprima: resta una vista informativa', async () => {
    /*
      ⭐ L'anteprima non e' sparita con la purga: dice all'operatore che cosa c'e'
         di collegato a Shopify e che cosa lo trattiene. Serve a decidere, e
         adesso e' l'unica cosa che quel passo fa.
    */
    await setup({ preview: PREVIEW_WITH_BLOCKER });

    expect(await screen.findByText('Ordini fornitore aperti su location Shopify.')).toBeVisible();
  });

  it('tutte e tre le categorie sono spente, e ognuna dice perché', async () => {
    await setup();

    await screen.findByText('Prodotti Shopify');

    for (const nome of [
      /Catalogo importato da Shopify/i,
      /Ordini vendita Shopify/i,
      /Clienti Shopify/i,
    ]) {
      const casella = screen.getByRole('checkbox', { name: nome });
      expect(casella).toBeDisabled();
      expect(casella).not.toBeChecked();
    }

    // La ragione sta accanto alla casella, non in un messaggio dopo il clic.
    expect(screen.getByText(/cancellava giacenze e movimenti/i)).toBeVisible();
    expect(screen.getByText(/restavano contati sulla giacenza/i)).toBeVisible();
    expect(screen.getByText(/perdevano l’intestatario/i)).toBeVisible();
  });

  it('non offre il comando di rimozione: non c’è niente da rimuovere', async () => {
    const user = userEvent.setup();
    await setup();

    await screen.findByText('Prodotti Shopify');
    await user.click(screen.getByRole('button', { name: 'Continua' }));

    /*
      ⭐ Con nessuna categoria selezionabile il wizard arriva al ramo «nessun
         dato da rimuovere», che non chiede il dominio e non offre il pulsante
         di rimozione. Un comando che fallisce sempre e' peggio di un comando
         assente: chi lo preme pensa a un guasto.
    */
    expect(
      screen.queryByRole('button', { name: 'Rimuovi dati selezionati' }),
    ).not.toBeInTheDocument();
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
