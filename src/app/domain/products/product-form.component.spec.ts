import { signal } from '@angular/core';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { EMPTY, of, throwError } from 'rxjs';
import type { Observable } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { AuthService } from '@core/auth';
import type { Product } from '@core/models/product.model';
import { ProductStatus } from '@core/models/product.model';
import { CatalogOrigin } from '@core/models/catalog-origin.model';
import { ShopifyConnectionStatus } from '@core/models/shopify-connection.model';
import { ShopifySyncStatus } from '@core/models/shopify.model';
import { TenantChannelProfile } from '@core/models/tenant-channel-profile.model';
import { UserRole } from '@core/models/user.model';
import type { VatCode } from '@core/models/vat-code.model';
import type { UpdateProductDto } from './models/product.dto';
import { VatCodeService } from '@core/services/vat-code.service';
import { ShopifyConnectionService } from '@domain/channels/shopify/services/shopify-connection.service';
import { SupplierService } from '@domain/suppliers/services/supplier.service';
import { TenantFeatureSettingsService } from '@domain/tenant/services/tenant-feature-settings.service';
import { CatalogCategoryService } from './services/catalog-category.service';
import { ProductService } from './services/product.service';
import { ProductPriceModeMemoryService } from './services/product-price-mode-memory.service';
import { UnitOfMeasureOptionService } from './services/unit-of-measure-option.service';
import {
  ProductFormComponent,
  RIFERIMENTI_ERRORE,
  SYNC_DISABLE_FAILED_MESSAGE,
} from './product-form.component';

/** Come rispondono i riferimenti della scheda, e che cosa ricorda l’operatore. */
interface OpzioniMaschera {
  readonly vatCodes$?: Observable<readonly VatCode[]>;
  readonly settings$?: Observable<unknown>;
  /** `null` = nessuna memoria: vale la convenzione aziendale dal server. */
  readonly modalitaRicordata?: boolean | null;
}

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
      // ⛔ Le tre verifiche di unicità restituiscono un RISULTATO, non un elenco.
      //    Rese come array, `takenSkus()` diventa `undefined` e il template
      //    esplode su `.includes` — ma solo dopo i 400ms di debounce, quindi in
      //    isolamento il test finisce prima e resta verde. L'ha preso il
      //    pre-push, con la suite intera.
      checkArticleCodeAvailability: vi
        .fn()
        .mockReturnValue(of({ articleCode: '00001', available: true, takenBy: null })),
      checkSkuAvailability: vi.fn().mockReturnValue(of({ available: true, taken: [] })),
      checkBarcodeAvailability: vi.fn().mockReturnValue(of({ available: true, taken: [] })),
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

/**
 * ⭐ Deciso dal proprietario l’11/09/2026: la modalità Netti/Ivati è dell’operatore
 *    e si ricorda; un importo ivato senza aliquota nota resta in attesa e blocca
 *    il salvataggio; un errore di caricamento si DICE, non si presenta come
 *    «nessun listino / nessuna aliquota».
 */
describe('ProductFormComponent — Netti/Ivati ricordata, prezzi in attesa, riferimenti che non arrivano', () => {
  const ARTICOLO = {
    id: 'prod-1',
    tenantId: 'ten-1',
    articleCode: '00001',
    name: 'Maglietta',
    status: ProductStatus.Active,
    shopifySyncEnabled: false,
    catalogOrigin: CatalogOrigin.VestiFlow,
    options: [],
    images: [],
    sellingPrice: { amountMinor: 1990, currencyCode: 'EUR' },
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

  async function apri(opzioni: OpzioniMaschera = {}) {
    const updateProduct = vi.fn().mockReturnValue(of(ARTICOLO));
    const listaCodici = vi.fn().mockImplementation(() => opzioni.vatCodes$ ?? of([]));
    const ricordaModalita = vi.fn();
    const getPriceModePreference = vi.fn().mockReturnValue(of(false));

    await render(ProductFormComponent, {
      providers: [
        {
          provide: ProductService,
          useValue: {
            getProductById: vi.fn().mockReturnValue(of(ARTICOLO)),
            getProductVariants: vi.fn().mockReturnValue(of([VARIANTE])),
            getFilterOptions: vi
              .fn()
              .mockReturnValue(of({ categories: [], brands: [], seasons: [] })),
            searchVariantSummaries: vi.fn().mockReturnValue(of([])),
            checkArticleCodeAvailability: vi
              .fn()
              .mockReturnValue(of({ articleCode: '00001', available: true, takenBy: null })),
            checkSkuAvailability: vi.fn().mockReturnValue(of({ available: true, taken: [] })),
            checkBarcodeAvailability: vi.fn().mockReturnValue(of({ available: true, taken: [] })),
            getPriceModePreference,
            updateProduct,
            createProduct: vi.fn(),
            uploadProductImage: vi.fn(),
            deleteProductImage: vi.fn(),
          },
        },
        {
          provide: UnitOfMeasureOptionService,
          useValue: {
            defaultCode: () => 'pz',
            options: () => signal([]).asReadonly(),
            reload: () => undefined,
          },
        },
        { provide: VatCodeService, useValue: { list: listaCodici } },
        {
          provide: ProductPriceModeMemoryService,
          useValue: {
            remembered: () => opzioni.modalitaRicordata ?? null,
            remember: ricordaModalita,
          },
        },
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
          useValue: { getConnection: () => of({ status: ShopifyConnectionStatus.NotConnected }) },
        },
        {
          provide: TenantFeatureSettingsService,
          useValue: { getSettings: () => opzioni.settings$ ?? of({}) },
        },
        {
          provide: AuthService,
          useValue: {
            currentUser: () => ({
              id: 'user-1',
              role: UserRole.Owner,
              permissions: [],
              tenantChannelProfile: TenantChannelProfile.Gestionale,
            }),
          },
        },
        {
          provide: Router,
          useValue: {
            navigate: vi.fn(),
            navigateByUrl: vi.fn().mockResolvedValue(true),
            events: EMPTY,
            url: '/app/products/prod-1/edit',
          },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({ id: 'prod-1' })),
            snapshot: { paramMap: convertToParamMap({ id: 'prod-1' }) },
          },
        },
      ],
    });
    await screen.findByLabelText('Prezzo di vendita');
    return { updateProduct, listaCodici, ricordaModalita, getPriceModePreference };
  }

  it('la modalità ricordata dall’operatore vince sulla convenzione aziendale, anche in una scheda esistente', async () => {
    const { getPriceModePreference } = await apri({ modalitaRicordata: true });

    expect(screen.getByRole('button', { name: 'Ivati' })).toHaveAttribute('aria-pressed', 'true');
    expect(getPriceModePreference).not.toHaveBeenCalled();
  });

  it('senza memoria vale la convenzione aziendale, e la scelta dell’operatore viene ricordata', async () => {
    const utente = userEvent.setup();
    const { ricordaModalita, getPriceModePreference } = await apri({ modalitaRicordata: null });

    expect(getPriceModePreference).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Netti' })).toHaveAttribute('aria-pressed', 'true');

    await utente.click(screen.getByRole('button', { name: 'Ivati' }));
    expect(ricordaModalita).toHaveBeenCalledWith(true);
  });

  it('in Ivati senza aliquota un prezzo digitato blocca «Salva modifiche»; ai Netti si sblocca', async () => {
    const utente = userEvent.setup();
    const { updateProduct } = await apri({ modalitaRicordata: true });

    const prezzo = screen.getByLabelText('Prezzo di vendita');
    await utente.clear(prezzo);
    await utente.type(prezzo, '100');
    expect(screen.getByText('Scegli il Codice IVA per salvare il prezzo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Salva modifiche/i })).toBeDisabled();

    await utente.click(screen.getByRole('button', { name: 'Netti' }));
    expect(screen.getByRole('button', { name: /Salva modifiche/i })).toBeEnabled();
    await utente.click(screen.getByRole('button', { name: /Salva modifiche/i }));
    expect(updateProduct).toHaveBeenCalledTimes(1);
    const inviato = updateProduct.mock.calls[0]?.[1] as UpdateProductDto;
    expect(inviato.sellingPrice).toEqual({ amountMinor: 10000, currencyCode: 'EUR' });
  });

  it('modificare solo il nome non riconverte né altera i prezzi esistenti', async () => {
    const utente = userEvent.setup();
    const { updateProduct } = await apri({ modalitaRicordata: true });

    await utente.type(screen.getByLabelText(/Nome prodotto/i), ' bio');
    await utente.click(screen.getByRole('button', { name: /Salva modifiche/i }));

    expect(updateProduct).toHaveBeenCalledTimes(1);
    const inviato = updateProduct.mock.calls[0]?.[1] as UpdateProductDto;
    expect(inviato.sellingPrice).toEqual({ amountMinor: 1990, currencyCode: 'EUR' });
  });

  it('Codici IVA non caricati: l’errore si vede, «Riprova» richiede, e non è «nessuna aliquota»', async () => {
    const utente = userEvent.setup();
    const { listaCodici } = await apri({
      vatCodes$: throwError(() => new Error('rete')),
      modalitaRicordata: true,
    });

    expect(screen.getByText(RIFERIMENTI_ERRORE.codiciIva)).toBeInTheDocument();
    expect(screen.getByLabelText('Codice IVA del prodotto')).toBeDisabled();
    expect(listaCodici).toHaveBeenCalledTimes(1);

    await utente.click(screen.getByRole('button', { name: 'Riprova' }));
    expect(listaCodici).toHaveBeenCalledTimes(2);
  });

  it('impostazioni aziendali non caricate: l’errore si vede invece di «nessun listino»', async () => {
    await apri({ settings$: throwError(() => new Error('rete')) });

    expect(screen.getByText(RIFERIMENTI_ERRORE.impostazioni)).toBeInTheDocument();
  });
});
