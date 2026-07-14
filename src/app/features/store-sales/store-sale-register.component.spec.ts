import { provideRouter } from '@angular/router';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '@core/auth';
import { APP_CONFIG } from '@core/config/app-config.token';
import type { VatCode } from '@core/models/vat-code.model';
import { LocationContextService } from '@core/services/location-context.service';
import { OperationalLocationsService } from '@core/services/operational-locations.service';
import { VatCodeService } from '@core/services/vat-code.service';
import { ShopifyConnectionService } from '@features/integrations/shopify/services/shopify-connection.service';
import { ProductService } from '@features/products/services/product.service';

import type { StoreSaleLookupItem } from './models/store-sale.model';
import { StoreSalesService } from './services/store-sales.service';
import { StoreSaleRegisterComponent } from './store-sale-register.component';

const LOCATION = { id: 'loc-1', name: 'Negozio Milano' };
const EAN = '8001234567890';

const ITEM: StoreSaleLookupItem = {
  variantId: 'var-1',
  sku: 'MAG-001',
  barcode: EAN,
  productName: 'Maglietta Basic',
  optionSummary: 'M / Bianco',
  sellingPriceMinor: 1990,
  currency: 'EUR',
  vatRatePercent: 22,
  vatCodeId: 'vat-22',
  vatCodeLabel: '22',
  onHand: 5,
  committed: 0,
  available: 5,
};

const VAT_22: VatCode = {
  id: 'vat-22',
  code: '22',
  natureId: 'nat-1',
  nature: {
    id: 'nat-1',
    key: 'imponibile',
    officialCode: null,
    label: 'Imponibile',
    description: null,
    defaultUsageScope: 'both',
    defaultCalculationMode: 'standard',
    sortOrder: 1,
  },
  ratePercent: 22,
  nonDeductiblePercent: 0,
  description: 'Imponibile 22%',
  notes: null,
  usageScope: 'both',
  calculationMode: 'standard',
  vatAffectsSupplierTotal: true,
  isDefault: true,
  isActive: true,
  isSystem: true,
  sortOrder: 1,
};

/** Stub Web Audio API: verifica il beep di errore senza audio reale. */
function stubAudioContext() {
  const oscillatorStart = vi.fn();
  class FakeAudioContext {
    state = 'running';
    currentTime = 0;
    destination = {};
    resume = vi.fn(() => Promise.resolve());
    close = vi.fn(() => Promise.resolve());
    createOscillator() {
      return {
        type: 'sine',
        frequency: { value: 0 },
        connect: vi.fn(),
        start: oscillatorStart,
        stop: vi.fn(),
      };
    }
    createGain() {
      return { gain: { value: 0 }, connect: vi.fn() };
    }
  }
  vi.stubGlobal('AudioContext', FakeAudioContext);
  return { oscillatorStart };
}

describe('StoreSaleRegisterComponent', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function setup(options?: {
    readonly variantIdByCode?: string | null;
    readonly lookupItems?: readonly StoreSaleLookupItem[];
  }) {
    const variantId = options?.variantIdByCode;
    const findVariantByCode = vi.fn(() =>
      variantId
        ? of({ variantId, productId: 'prod-1', sku: ITEM.sku, barcode: EAN, productName: '' })
        : throwError(() => ({ status: 404 })),
    );
    const lookupItems = vi.fn(() => of(options?.lookupItems ?? []));
    const createProduct = vi.fn(() => of({ id: 'prod-new' }));
    const getProductVariants = vi.fn(() => of([{ id: 'var-new' }]));
    const searchVariantSummaries = vi.fn((query?: { variantId?: string }) => {
      if (query?.variantId === 'var-new') {
        return of([
          {
            variantId: 'var-new',
            productId: 'prod-new',
            sku: '',
            productName: 'Articolo rapido',
            title: 'Articolo rapido',
            barcode: EAN,
            sellingPrice: { amountMinor: 990, currencyCode: 'EUR' },
          },
        ]);
      }
      return of([]);
    });

    await render(StoreSaleRegisterComponent, {
      providers: [
        provideRouter([]),
        {
          provide: APP_CONFIG,
          useValue: {
            production: false,
            appName: 'VestiFlow',
            apiBaseUrl: 'http://localhost:3000/api/v1',
            features: { barcodeScanner: false, shopify: false },
          },
        },
        {
          provide: StoreSalesService,
          useValue: {
            lookupItems,
            createSale: vi.fn(),
            createReturn: vi.fn(),
            getRecentSales: vi.fn(() => of([])),
          },
        },
        {
          provide: ProductService,
          useValue: {
            findVariantByCode,
            searchVariantSummaries,
            createProduct,
            getProductVariants,
            getFilterOptions: vi.fn(() => of({ categories: [], brands: [], productTypes: [] })),
            checkSkuAvailability: vi.fn(() => of({ available: true, taken: [] })),
            checkBarcodeAvailability: vi.fn(() => of({ available: true, taken: [] })),
          },
        },
        {
          provide: OperationalLocationsService,
          useValue: {
            actionLocations: () => [LOCATION],
            isFixedSingleStore: () => true,
            fixedSingleStoreLocationId: () => LOCATION.id,
            fixedSingleStoreLabel: () => LOCATION.name,
          },
        },
        {
          provide: LocationContextService,
          useValue: { activeLocationId: () => LOCATION.id, setActiveLocation: vi.fn() },
        },
        { provide: VatCodeService, useValue: { list: () => of([VAT_22]) } },
        { provide: AuthService, useValue: { currentUser: () => null } },
        { provide: ShopifyConnectionService, useValue: { getConnection: () => of(null) } },
      ],
    });

    return { findVariantByCode, lookupItems, createProduct, getProductVariants };
  }

  async function scan(code: string) {
    const user = userEvent.setup();
    const input = screen.getByLabelText<HTMLInputElement>('Barcode, SKU o nome prodotto');
    await user.clear(input);
    await user.type(input, `${code}{Enter}`);
    return input;
  }

  it('scansione con match esatto: riga con quantità 1, poi incremento sulla stessa variante', async () => {
    await setup({ variantIdByCode: 'var-1', lookupItems: [ITEM] });

    const input = await scan(EAN);

    expect(await screen.findByText('Maglietta Basic — M / Bianco')).toBeVisible();
    const qty = screen.getByLabelText<HTMLInputElement>(`Quantità ${ITEM.sku}`);
    expect(qty.value).toBe('1');
    // Il campo scansione si svuota e mantiene il focus per la scansione successiva.
    expect(input.value).toBe('');
    expect(document.activeElement).toBe(input);

    await scan(EAN);
    expect(qty.value).toBe('2');
  });

  it('parsa il prefisso quantità «3*codice» in una sola riga da 3 pezzi', async () => {
    await setup({ variantIdByCode: 'var-1', lookupItems: [ITEM] });

    await scan(`3*${EAN}`);

    const qty = await screen.findByLabelText<HTMLInputElement>(`Quantità ${ITEM.sku}`);
    expect(qty.value).toBe('3');
  });

  it('EAN non trovato: nessuna riga, beep, messaggio e azioni di recupero', async () => {
    const { oscillatorStart } = stubAudioContext();
    await setup({ variantIdByCode: null, lookupItems: [] });

    const input = await scan(EAN);

    expect(await screen.findByText('Articolo non trovato.')).toBeVisible();
    // Nessuna riga incompleta: il carrello resta vuoto.
    expect(
      screen.getByText(
        'Il carrello è vuoto. Scansiona un barcode o cerca un prodotto per iniziare.',
      ),
    ).toBeVisible();
    expect(oscillatorStart).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Cerca articolo' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Crea articolo rapido' })).toBeVisible();
    // Focus ancora sul campo scansione, con il codice selezionato per riscansione.
    expect(document.activeElement).toBe(input);
  });

  it('crea articolo rapido: prefill EAN, variante creata in carrello con quantità 1, pannello chiuso', async () => {
    const user = userEvent.setup();
    const { createProduct, lookupItems } = await setup({ variantIdByCode: null, lookupItems: [] });

    await scan(EAN);
    await screen.findByText('Articolo non trovato.');

    await user.click(screen.getByRole('button', { name: 'Crea articolo rapido' }));

    // Pannello con ProductFormComponent embedded: EAN precompilato dal codice scansionato.
    const panel = await screen.findByRole('dialog');
    const eanField = await within(panel).findByDisplayValue<HTMLInputElement>(EAN);
    expect(eanField.id).toBe('quick-variant-ean');

    await user.type(within(panel).getByLabelText('Nome prodotto'), 'Articolo rapido');

    // La riga creata viene risolta dal lookup di cassa (prezzo/IVA/disponibilità).
    lookupItems.mockReturnValue(
      of([
        {
          ...ITEM,
          variantId: 'var-new',
          sku: '',
          productName: 'Articolo rapido',
          optionSummary: '',
          sellingPriceMinor: 990,
          onHand: 0,
          committed: 0,
          available: 0,
        },
      ]),
    );

    await user.click(within(panel).getByRole('button', { name: 'Salva e aggiungi al documento' }));

    expect(createProduct).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Articolo rapido')).toBeVisible();
    const qty = screen.getByLabelText<HTMLInputElement>(/^Quantità/);
    expect(qty.value).toBe('1');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
