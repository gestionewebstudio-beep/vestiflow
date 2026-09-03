import { signal } from '@angular/core';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { EMPTY, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { AuthService } from '@core/auth';
import type { Product } from '@core/models/product.model';
import { ProductStatus } from '@core/models/product.model';
import { CatalogOrigin } from '@core/models/catalog-origin.model';
import { ShopifyConnectionStatus } from '@core/models/shopify-connection.model';
import { ShopifySyncStatus } from '@core/models/shopify.model';
import { TenantChannelProfile } from '@core/models/tenant-channel-profile.model';
import { UserRole } from '@core/models/user.model';
import { VatCodeService } from '@core/services/vat-code.service';
import { ShopifyConnectionService } from '@domain/channels/shopify/services/shopify-connection.service';
import { SupplierService } from '@domain/suppliers/services/supplier.service';
import { TenantFeatureSettingsService } from '@domain/tenant/services/tenant-feature-settings.service';
import { CatalogCategoryService } from './services/catalog-category.service';
import { ProductService } from './services/product.service';
import { UnitOfMeasureOptionService } from './services/unit-of-measure-option.service';
import { ProductFormComponent, SYNC_DISABLE_FAILED_MESSAGE } from './product-form.component';

/**
 * Spegnere «Sincronizza con Shopify» è l'unica modifica il cui esito NON si
 * legge nel codice HTTP: il salvataggio riesce comunque, e la risposta porta lo
 * stato effettivo (docs/24 §1.10). Qui si verifica che la maschera lo dica
 * subito, invece di navigare via come se fosse andato tutto bene.
 */
describe('ProductFormComponent — spegnimento della sincronizzazione', () => {
  const COLLEGATO = {
    id: 'prod-1',
    tenantId: 'ten-1',
    articleCode: '00001',
    name: 'Maglietta',
    status: ProductStatus.Active,
    shopifySyncEnabled: true,
    catalogOrigin: CatalogOrigin.VestiFlow,
    options: [],
    images: [],
    shopify: { status: ShopifySyncStatus.Synced, externalId: '111' },
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-09-01T08:00:00.000Z',
  } as unknown as Product;

  const VARIANTE = {
    id: 'var-1',
    productId: 'prod-1',
    sku: 'SKU-1',
    optionValues: [],
    sellingPrice: { amountMinor: 1990, currencyCode: 'EUR' },
  };

  async function renderForm(risposta: Product) {
    const updateProduct = vi.fn().mockReturnValue(of(risposta));
    const navigateByUrl = vi.fn().mockResolvedValue(true);

    const productService = {
      getProductById: vi.fn().mockReturnValue(of(COLLEGATO)),
      getProductVariants: vi.fn().mockReturnValue(of([VARIANTE])),
      getFilterOptions: vi.fn().mockReturnValue(of({ categories: [], brands: [], seasons: [] })),
      searchVariantSummaries: vi.fn().mockReturnValue(of([])),
      checkArticleCodeAvailability: vi.fn().mockReturnValue(of({ available: true })),
      checkSkuAvailability: vi.fn().mockReturnValue(of([])),
      checkBarcodeAvailability: vi.fn().mockReturnValue(of([])),
      getPriceModePreference: vi.fn().mockReturnValue(of(false)),
      updateProduct,
      createProduct: vi.fn(),
      uploadProductImage: vi.fn(),
      deleteProductImage: vi.fn(),
    };

    await render(ProductFormComponent, {
      providers: [
        { provide: ProductService, useValue: productService },
        {
          provide: UnitOfMeasureOptionService,
          // `options()` restituisce un SEGNALE, non l'elenco.
          useValue: {
            defaultCode: () => 'pz',
            options: () => signal([]).asReadonly(),
            reload: () => undefined,
          },
        },
        { provide: VatCodeService, useValue: { list: () => of([]) } },
        { provide: CatalogCategoryService, useValue: { list: () => of([]) } },
        {
          provide: SupplierService,
          useValue: {
            getSuppliers: () => of([]),
            getVariantLinksByProduct: () => of([]),
            upsertVariantLink: vi.fn(),
          },
        },
        {
          provide: ShopifyConnectionService,
          useValue: { getConnection: () => of({ status: ShopifyConnectionStatus.Connected }) },
        },
        { provide: TenantFeatureSettingsService, useValue: { getSettings: () => of({}) } },
        {
          provide: AuthService,
          useValue: {
            currentUser: () => ({
              role: UserRole.Owner,
              permissions: [],
              tenantChannelProfile: TenantChannelProfile.Shopify,
            }),
          },
        },
        {
          // `events` e `url` servono a `app-back-button`, non a questo test.
          provide: Router,
          useValue: {
            navigate: vi.fn(),
            navigateByUrl,
            events: EMPTY,
            url: '/app/products/prod-1',
          },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({ id: 'prod-1' })),
            // `initialLoadState()` legge lo snapshot per evitare il flash di
            // caricamento: senza, il componente non si costruisce nemmeno.
            snapshot: { paramMap: convertToParamMap({ id: 'prod-1' }) },
          },
        },
      ],
    });

    return { updateProduct, navigateByUrl };
  }

  /** Toglie la spunta e preme Salva: il percorso che l'operatore fa davvero. */
  async function spegniESalva() {
    const utente = userEvent.setup();
    await utente.click(await screen.findByLabelText(/Sincronizza con Shopify/i));
    await utente.click(screen.getByRole('button', { name: /Salva modifiche/i }));
  }

  it('Shopify RIFIUTA: avviso subito, e la maschera non va da nessuna parte', async () => {
    const motivo = SYNC_DISABLE_FAILED_MESSAGE + ': Shopify productUpdate rifiutato';
    const { updateProduct, navigateByUrl } = await renderForm({
      ...COLLEGATO,
      // Il flag è tornato ACCESO: l'archiviazione non è arrivata a Shopify.
      shopifySyncEnabled: true,
      shopify: { status: ShopifySyncStatus.OutOfSync, externalId: '111', lastError: motivo },
    } as unknown as Product);

    await spegniESalva();

    expect(updateProduct).toHaveBeenCalledWith(
      'prod-1',
      expect.objectContaining({ shopifySyncEnabled: false }),
    );
    // La conseguenza prima della causa, e la causa tecnica in coda.
    const avviso = await screen.findByRole('alert');
    expect(avviso).toHaveTextContent(SYNC_DISABLE_FAILED_MESSAGE);
    expect(avviso).toHaveTextContent('productUpdate rifiutato');
    // Navigare butterebbe l'avviso: è il difetto che questo test difende.
    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it('il messaggio NON dice «salvataggio fallito»: la scheda è salvata', async () => {
    const { navigateByUrl } = await renderForm({
      ...COLLEGATO,
      shopifySyncEnabled: true,
      shopify: {
        status: ShopifySyncStatus.OutOfSync,
        externalId: '111',
        lastError: SYNC_DISABLE_FAILED_MESSAGE + ': rete non raggiungibile',
      },
    } as unknown as Product);

    await spegniESalva();

    const avviso = await screen.findByRole('alert');
    expect(avviso.textContent ?? '').not.toMatch(/salvataggio|non salvat/i);
    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it('Shopify CONFERMA: nessun avviso, e si prosegue come sempre', async () => {
    const { navigateByUrl } = await renderForm({ ...COLLEGATO, shopifySyncEnabled: false });

    await spegniESalva();

    await vi.waitFor(() => expect(navigateByUrl).toHaveBeenCalledWith('/app/products/prod-1'));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
