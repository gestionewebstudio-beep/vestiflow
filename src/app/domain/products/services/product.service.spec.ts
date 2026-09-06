import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { APP_CONFIG } from '@core/config/app-config.token';
import { ProductStatus } from '@core/models/product.model';
import { DEFAULT_CURRENCY } from '@core/utils/money.util';

import type { CreateProductDto, UpdateProductDto } from '../models/product.dto';
import { ProductService } from './product.service';

const API_BASE = 'http://localhost:3000/api/v1';

/** Riga prodotto come la restituisce l'API: base minima riusata dai test. */
function productRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'prod-1',
    tenantId: 'tenant-1',
    name: 'Maglietta',
    status: ProductStatus.Active,
    options: [],
    shopifySyncStatus: 'not_connected',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    variants: [],
    ...overrides,
  };
}

function asFormData(body: unknown): FormData {
  if (!(body instanceof FormData)) {
    throw new Error('Corpo della richiesta: atteso FormData');
  }
  return body;
}

function asRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null) {
    throw new Error('Corpo della richiesta: atteso oggetto JSON');
  }
  return body as Record<string, unknown>;
}

const createDto: CreateProductDto = {
  name: 'Maglietta',
  status: ProductStatus.Active,
  sellingPrice: { amountMinor: 2990, currencyCode: DEFAULT_CURRENCY },
  options: [],
  variants: [],
};

describe('ProductService (HTTP)', () => {
  let service: ProductService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ProductService,
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: APP_CONFIG,
          useValue: {
            apiBaseUrl: API_BASE,
          },
        },
      ],
    });
    service = TestBed.inject(ProductService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('getProducts mappa la risposta paginata dell API', async () => {
    const promise = firstValueFrom(
      service.getProducts({ page: 1, pageSize: 10, sort: 'name', order: 'asc' }),
    );

    const req = httpMock.expectOne((request) => request.url.startsWith(`${API_BASE}/products`));
    expect(req.request.method).toBe('GET');
    req.flush({
      items: [productRow()],
      total: 1,
      page: 1,
      pageSize: 10,
    });

    const result = await promise;
    expect(result.data.length).toBe(1);
    expect(result.data[0]?.name).toBe('Maglietta');
    expect(result.meta.total).toBe(1);
  });

  /**
   * ⭐ **La distinzione fra «tutto» e «una pagina» va inchiodata**, perché è
   * appena costata un difetto: reso `all=1` incondizionato il 30/08/2026,
   * il contatore «Articoli da completare» — che chiede `pageSize: 1` per leggere
   * solo `meta.total` — avrebbe scaricato l'intero catalogo delle bozze a ogni
   * ricarica dell'elenco.
   *
   * ⚠️ **Nessun test lo vedeva**: la richiesta resta valida, la risposta resta
   * corretta, e l'unica differenza è quanti byte attraversano la rete.
   */
  it('⭐ `tutto` accende `all=1`; senza, la richiesta resta paginata', async () => {
    const conTutto = firstValueFrom(
      service.getProducts({ page: 1, pageSize: 10, sort: 'name', order: 'asc' }, { tutto: true }),
    );
    const primo = httpMock.expectOne((r) => r.url.startsWith(`${API_BASE}/products`));
    expect(primo.request.params.get('all')).toBe('1');
    primo.flush({ items: [], total: 0, page: 1, pageSize: 10 });
    await conTutto;

    const senzaTutto = firstValueFrom(
      service.getProducts({ page: 1, pageSize: 1, sort: 'name', order: 'asc' }),
    );
    const secondo = httpMock.expectOne((r) => r.url.startsWith(`${API_BASE}/products`));
    expect(secondo.request.params.get('all')).toBeNull();
    expect(secondo.request.params.get('pageSize')).toBe('1');
    secondo.flush({ items: [], total: 42, page: 1, pageSize: 1 });

    // ⚠️ Il conteggio arriva comunque intero: è il motivo per cui `pageSize: 1` basta.
    await expect(senzaTutto).resolves.toMatchObject({ meta: { total: 42 } });
  });

  it('getProducts inoltra ricerca, stato e filtri di catalogo come query param', async () => {
    const promise = firstValueFrom(
      service.getProducts({
        page: 2,
        pageSize: 20,
        sort: 'name',
        order: 'asc',
        search: 'magli',
        status: ProductStatus.Active,
        category: 'Maglieria',
        brand: 'Brand A',
        season: 'PE',
      }),
    );

    const req = httpMock.expectOne((request) => request.url.startsWith(`${API_BASE}/products`));
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('pageSize')).toBe('20');
    expect(req.request.params.get('search')).toBe('magli');
    expect(req.request.params.get('status')).toBe(ProductStatus.Active);
    expect(req.request.params.get('category')).toBe('Maglieria');
    expect(req.request.params.get('brand')).toBe('Brand A');
    expect(req.request.params.get('season')).toBe('PE');
    req.flush({ items: [], total: 0, page: 2, pageSize: 20 });

    await expect(promise).resolves.toMatchObject({ data: [] });
  });

  it('getProducts senza filtri non invia parametri opzionali', async () => {
    const promise = firstValueFrom(
      service.getProducts({ page: 1, pageSize: 10, sort: 'name', order: 'asc' }),
    );

    const req = httpMock.expectOne((request) => request.url.startsWith(`${API_BASE}/products`));
    expect(req.request.params.has('search')).toBe(false);
    expect(req.request.params.has('status')).toBe(false);
    expect(req.request.params.has('category')).toBe(false);
    req.flush({ items: [], total: 0, page: 1, pageSize: 10 });

    await promise;
  });

  it('checkArticleCodeAvailability interroga il server e riporta chi occupa il codice', async () => {
    const promise = firstValueFrom(service.checkArticleCodeAvailability('abc001', 'prod-1'));

    const req = httpMock.expectOne((request) =>
      request.url.includes('/products/article-code-availability'),
    );
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('articleCode')).toBe('abc001');
    expect(req.request.params.get('excludeProductId')).toBe('prod-1');
    req.flush({ articleCode: 'ABC001', available: false, takenBy: 'Maglia Basic' });

    await expect(promise).resolves.toEqual({
      articleCode: 'ABC001',
      available: false,
      takenBy: 'Maglia Basic',
    });
  });

  it('checkArticleCodeAvailability senza prodotto da escludere non invia excludeProductId', async () => {
    const promise = firstValueFrom(service.checkArticleCodeAvailability('  abc001  '));

    const req = httpMock.expectOne((request) =>
      request.url.includes('/products/article-code-availability'),
    );
    expect(req.request.params.get('articleCode')).toBe('abc001');
    expect(req.request.params.has('excludeProductId')).toBe(false);
    req.flush({ articleCode: 'ABC001', available: true, takenBy: null });

    await promise;
  });

  it('checkArticleCodeAvailability con codice vuoto non chiama il server', async () => {
    await expect(firstValueFrom(service.checkArticleCodeAvailability('   '))).resolves.toEqual({
      articleCode: '',
      available: true,
      takenBy: null,
    });
    httpMock.expectNone((request) => request.url.includes('/products/article-code-availability'));
  });

  it('checkSkuAvailability aggrega SKU non disponibili', async () => {
    const promise = firstValueFrom(service.checkSkuAvailability(['SKU-OK', 'SKU-BAD']));

    const requests = httpMock.match((req) => req.url.includes('/products/sku-availability'));
    expect(requests.length).toBe(2);
    requests[0]!.flush({ sku: 'SKU-OK', available: true });
    requests[1]!.flush({ sku: 'SKU-BAD', available: false });

    const result = await promise;
    expect(result.available).toBe(false);
    expect(result.taken).toEqual(['SKU-BAD']);
  });

  it('checkSkuAvailability normalizza lo SKU e inoltra il prodotto da escludere', async () => {
    const promise = firstValueFrom(service.checkSkuAvailability(['  SKU-A  '], 'prod-9'));

    const req = httpMock.expectOne((request) => request.url.includes('/products/sku-availability'));
    expect(req.request.params.get('sku')).toBe('SKU-A');
    expect(req.request.params.get('excludeProductId')).toBe('prod-9');
    req.flush({ sku: 'SKU-A', available: true });

    await expect(promise).resolves.toEqual({ available: true, taken: [] });
  });

  it('checkSkuAvailability con lista vuota ritorna available true', async () => {
    const result = await firstValueFrom(service.checkSkuAvailability([]));
    expect(result).toEqual({ available: true, taken: [] });
  });

  it('checkBarcodeAvailability aggrega barcode non disponibili', async () => {
    const promise = firstValueFrom(
      service.checkBarcodeAvailability(['8001111111111', '8002222222222']),
    );

    const requests = httpMock.match((req) => req.url.includes('/products/barcode-availability'));
    expect(requests.length).toBe(2);
    requests[0]!.flush({ barcode: '8001111111111', available: true });
    requests[1]!.flush({ barcode: '8002222222222', available: false });

    const result = await promise;
    expect(result.available).toBe(false);
    expect(result.taken).toEqual(['8002222222222']);
  });

  it('checkBarcodeAvailability scarta i barcode vuoti e inoltra il prodotto da escludere', async () => {
    const promise = firstValueFrom(
      service.checkBarcodeAvailability(['', '   ', ' 8003333333333 '], 'prod-7'),
    );

    const requests = httpMock.match((req) => req.url.includes('/products/barcode-availability'));
    expect(requests.length).toBe(1);
    expect(requests[0]!.request.params.get('barcode')).toBe('8003333333333');
    expect(requests[0]!.request.params.get('excludeProductId')).toBe('prod-7');
    requests[0]!.flush({ barcode: '8003333333333', available: true });

    await expect(promise).resolves.toEqual({ available: true, taken: [] });
  });

  it('checkBarcodeAvailability con lista vuota ritorna available true', async () => {
    const result = await firstValueFrom(service.checkBarcodeAvailability([]));
    expect(result).toEqual({ available: true, taken: [] });
  });

  it('checkBarcodeAvailability con soli barcode vuoti non chiama il server', async () => {
    await expect(firstValueFrom(service.checkBarcodeAvailability(['  ', '']))).resolves.toEqual({
      available: true,
      taken: [],
    });
    httpMock.expectNone((request) => request.url.includes('/products/barcode-availability'));
  });

  it('getProductById mappa il prodotto', async () => {
    const promise = firstValueFrom(service.getProductById('prod-1'));

    const req = httpMock.expectOne(`${API_BASE}/products/prod-1`);
    req.flush(productRow({ name: 'Giacca' }));

    const product = await promise;
    expect(product.name).toBe('Giacca');
  });

  it('getProductVariants mappa le varianti del prodotto', async () => {
    const promise = firstValueFrom(service.getProductVariants('prod-1'));

    const req = httpMock.expectOne(`${API_BASE}/products/prod-1`);
    expect(req.request.method).toBe('GET');
    req.flush(
      productRow({
        variants: [
          {
            id: 'var-1',
            tenantId: 'tenant-1',
            productId: 'prod-1',
            sku: 'SKU-M',
            optionValues: [{ name: 'Taglia', value: 'M' }],
            barcode: '8001111111111',
            currency: DEFAULT_CURRENCY,
            sellingPriceMinor: 2990,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      }),
    );

    const variants = await promise;
    expect(variants.length).toBe(1);
    expect(variants[0]?.sku).toBe('SKU-M');
    expect(variants[0]?.sellingPrice).toEqual({
      amountMinor: 2990,
      currencyCode: DEFAULT_CURRENCY,
    });
  });

  it('getProductVariants ritorna lista vuota se il prodotto non ne ha', async () => {
    const promise = firstValueFrom(service.getProductVariants('prod-1'));

    httpMock.expectOne(`${API_BASE}/products/prod-1`).flush(productRow({ variants: undefined }));

    await expect(promise).resolves.toEqual([]);
  });

  it('findVariantByCode interroga endpoint dedicato', async () => {
    const promise = firstValueFrom(service.findVariantByCode('SKU-XYZ'));

    const req = httpMock.expectOne((request) =>
      request.url.startsWith(`${API_BASE}/products/variants/by-code`),
    );
    expect(req.request.params.get('code')).toBe('SKU-XYZ');
    req.flush({
      variantId: 'var-1',
      productId: 'prod-1',
      sku: 'SKU-XYZ',
      barcode: null,
      productName: 'Prodotto',
    });

    const result = await promise;
    expect(result.sku).toBe('SKU-XYZ');
  });

  it('getFilterOptions interroga /products/facets e riusa la cache', async () => {
    const firstPromise = firstValueFrom(service.getFilterOptions());
    const secondPromise = firstValueFrom(service.getFilterOptions());

    const req = httpMock.expectOne(`${API_BASE}/products/facets`);
    req.flush({
      categories: ['Maglieria'],
      brands: ['Brand A'],
      seasons: ['SS26'],
    });

    const [first, second] = await Promise.all([firstPromise, secondPromise]);
    expect(first.categories).toContain('Maglieria');
    expect(second.brands).toContain('Brand A');
  });

  it('getFilterOptions deduplica, scarta i valori vuoti e ordina alfabeticamente', async () => {
    const promise = firstValueFrom(service.getFilterOptions());

    httpMock.expectOne(`${API_BASE}/products/facets`).flush({
      categories: ['Maglieria', 'Maglieria', '', 'Abbigliamento'],
      brands: ['Zeta', 'Alfa'],
      seasons: ['SS26', 'PE'],
    });

    const options = await promise;
    expect(options.categories).toEqual(['Abbigliamento', 'Maglieria']);
    expect(options.brands).toEqual(['Alfa', 'Zeta']);
    // Le stagioni standard entrano sempre, senza duplicare quelle gia' usate.
    expect(options.seasons).toContain('Primavera');
    expect(options.seasons).toContain('SS26');
    expect(options.seasons.filter((season) => season === 'PE').length).toBe(1);
  });

  it('getFilterOptions rilegge le facets quando la cache e scaduta', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    try {
      const firstPromise = firstValueFrom(service.getFilterOptions());
      httpMock
        .expectOne(`${API_BASE}/products/facets`)
        .flush({ categories: ['Vecchia'], brands: [], seasons: [] });
      await firstPromise;

      // Oltre i 5 minuti di validita' della cache.
      nowSpy.mockReturnValue(1_000_000 + 5 * 60_000 + 1);
      const secondPromise = firstValueFrom(service.getFilterOptions());
      httpMock
        .expectOne(`${API_BASE}/products/facets`)
        .flush({ categories: ['Nuova'], brands: [], seasons: [] });

      await expect(secondPromise).resolves.toMatchObject({ categories: ['Nuova'] });
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('invalidateVariantSummariesCache forza una nuova lettura delle facets', async () => {
    const firstPromise = firstValueFrom(service.getFilterOptions());
    httpMock
      .expectOne(`${API_BASE}/products/facets`)
      .flush({ categories: ['Maglieria'], brands: [], seasons: [] });
    await firstPromise;

    service.invalidateVariantSummariesCache();

    const secondPromise = firstValueFrom(service.getFilterOptions());
    httpMock
      .expectOne(`${API_BASE}/products/facets`)
      .flush({ categories: ['Camiceria'], brands: [], seasons: [] });

    await expect(secondPromise).resolves.toMatchObject({ categories: ['Camiceria'] });
  });

  it('searchVariantSummaries interroga endpoint paginato dedicato', async () => {
    const promise = firstValueFrom(
      service.searchVariantSummaries({ search: 'magli', pageSize: 10 }),
    );

    const req = httpMock.expectOne((request) =>
      request.url.startsWith(`${API_BASE}/products/variants/summaries`),
    );
    expect(req.request.params.get('search')).toBe('magli');
    expect(req.request.params.get('pageSize')).toBe('10');
    req.flush({
      items: [
        {
          variantId: 'var-1',
          productId: 'prod-1',
          sku: 'SKU-M',
          productName: 'Maglietta',
          title: 'Maglietta — M',
          sellingPrice: { amountMinor: 2990, currencyCode: 'EUR' },
        },
      ],
      total: 1,
      page: 1,
      pageSize: 10,
    });

    const result = await promise;
    expect(result.length).toBe(1);
    expect(result[0]?.sku).toBe('SKU-M');
  });

  it('searchVariantSummaries senza argomenti usa pagina 1 e 25 risultati', async () => {
    const promise = firstValueFrom(service.searchVariantSummaries());

    const req = httpMock.expectOne((request) =>
      request.url.startsWith(`${API_BASE}/products/variants/summaries`),
    );
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('pageSize')).toBe('25');
    expect(req.request.params.has('search')).toBe(false);
    req.flush({ items: [], total: 0, page: 1, pageSize: 25 });

    await expect(promise).resolves.toEqual([]);
  });

  it('searchVariantSummaries inoltra variante, prodotto, fornitore e location', async () => {
    const promise = firstValueFrom(
      service.searchVariantSummaries({
        search: '  ',
        variantId: 'var-1',
        productId: 'prod-1',
        supplierId: 'sup-1',
        locationId: 'loc-1',
        page: 3,
      }),
    );

    const req = httpMock.expectOne((request) =>
      request.url.startsWith(`${API_BASE}/products/variants/summaries`),
    );
    // Una ricerca di soli spazi non e' una ricerca: non deve diventare un filtro.
    expect(req.request.params.has('search')).toBe(false);
    expect(req.request.params.get('page')).toBe('3');
    expect(req.request.params.get('variantId')).toBe('var-1');
    expect(req.request.params.get('productId')).toBe('prod-1');
    expect(req.request.params.get('supplierId')).toBe('sup-1');
    expect(req.request.params.get('locationId')).toBe('loc-1');
    req.flush({ items: [], total: 0, page: 3, pageSize: 25 });

    await promise;
  });

  it('searchVariantSummaries mappa tutti i campi opzionali della variante', async () => {
    const promise = firstValueFrom(service.searchVariantSummaries({ search: 'magli' }));

    httpMock
      .expectOne((request) => request.url.startsWith(`${API_BASE}/products/variants/summaries`))
      .flush({
        items: [
          {
            variantId: 'var-1',
            productId: 'prod-1',
            sku: 'SKU-M',
            articleCode: '00042',
            productName: 'Maglietta',
            title: 'Maglietta — M',
            barcode: '8001111111111',
            sellingPrice: { amountMinor: 2990, currencyCode: 'EUR' },
            shopifyPrice: { amountMinor: 3190, currencyCode: 'EUR' },
            purchasePrice: { amountMinor: 1200, currencyCode: 'EUR' },
            compareAtPrice: { amountMinor: 3990, currencyCode: 'EUR' },
            listinoPrices: {
              '1': { amountMinor: 2500, currencyCode: 'EUR' },
              '2': null,
              '3': { amountMinor: 2100, currencyCode: 'EUR' },
            },
            supplierSku: 'FORN-1',
            stockOnHand: 10,
            stockAvailable: 7,
            stockMinThreshold: 2,
            imageUrl: 'https://cdn.test/img.jpg',
            category: '  Maglieria  ',
            unitOfMeasure: '  PZ  ',
            defaultVatCodeId: 'vat-22',
            managesStock: false,
            kind: 'service',
          },
        ],
        total: 1,
        page: 1,
        pageSize: 25,
      });

    const [summary] = await promise;
    expect(summary?.articleCode).toBe('00042');
    expect(summary?.barcode).toBe('8001111111111');
    expect(summary?.shopifyPrice).toEqual({ amountMinor: 3190, currencyCode: 'EUR' });
    expect(summary?.purchasePrice).toEqual({ amountMinor: 1200, currencyCode: 'EUR' });
    expect(summary?.compareAtPrice).toEqual({ amountMinor: 3990, currencyCode: 'EUR' });
    expect(summary?.listinoPrices).toEqual({
      1: { amountMinor: 2500, currencyCode: 'EUR' },
      2: null,
      3: { amountMinor: 2100, currencyCode: 'EUR' },
    });
    expect(summary?.supplierSku).toBe('FORN-1');
    expect(summary?.stockOnHand).toBe(10);
    expect(summary?.stockAvailable).toBe(7);
    expect(summary?.stockMinThreshold).toBe(2);
    expect(summary?.imageUrl).toBe('https://cdn.test/img.jpg');
    expect(summary?.category).toBe('Maglieria');
    expect(summary?.unitOfMeasure).toBe('PZ');
    expect(summary?.defaultVatCodeId).toBe('vat-22');
    expect(summary?.managesStock).toBe(false);
    expect(summary?.kind).toBe('service');
  });

  it('searchVariantSummaries applica i default sui campi assenti o vuoti', async () => {
    const promise = firstValueFrom(service.searchVariantSummaries({ search: 'magli' }));

    httpMock
      .expectOne((request) => request.url.startsWith(`${API_BASE}/products/variants/summaries`))
      .flush({
        items: [
          {
            variantId: 'var-1',
            productId: 'prod-1',
            sku: 'SKU-M',
            articleCode: null,
            productName: 'Maglietta',
            title: 'Maglietta — M',
            barcode: null,
            sellingPrice: { amountMinor: 2990, currencyCode: 'EUR' },
            shopifyPrice: null,
            purchasePrice: null,
            compareAtPrice: null,
            supplierSku: null,
            stockOnHand: null,
            stockAvailable: null,
            stockMinThreshold: null,
            imageUrl: null,
            category: '   ',
            unitOfMeasure: '   ',
            defaultVatCodeId: null,
          },
          {
            // Riga in cui i campi facoltativi mancano del tutto, non sono vuoti.
            variantId: 'var-2',
            productId: 'prod-2',
            sku: 'SKU-L',
            productName: 'Felpa',
            title: 'Felpa — L',
            sellingPrice: { amountMinor: 4990, currencyCode: 'EUR' },
          },
        ],
        total: 2,
        page: 1,
        pageSize: 25,
      });

    const [summary, senzaCampi] = await promise;
    expect(senzaCampi?.category).toBeUndefined();
    expect(senzaCampi?.unitOfMeasure).toBeUndefined();
    expect(senzaCampi?.articleCode).toBe('');
    expect(senzaCampi?.managesStock).toBe(true);
    expect(summary?.articleCode).toBe('');
    expect(summary?.barcode).toBeUndefined();
    expect(summary?.shopifyPrice).toBeUndefined();
    expect(summary?.purchasePrice).toBeUndefined();
    expect(summary?.compareAtPrice).toBeUndefined();
    expect(summary?.listinoPrices).toEqual({ 1: null, 2: null, 3: null });
    expect(summary?.supplierSku).toBeUndefined();
    expect(summary?.stockOnHand).toBeUndefined();
    expect(summary?.imageUrl).toBeUndefined();
    // Una stringa di soli spazi non e' una categoria: vale come assente.
    expect(summary?.category).toBeUndefined();
    expect(summary?.unitOfMeasure).toBeUndefined();
    expect(summary?.defaultVatCodeId).toBeUndefined();
    // Senza indicazione contraria l'articolo e' gestito a magazzino.
    expect(summary?.managesStock).toBe(true);
    expect(summary?.kind).toBe('article');
  });

  it('generateSku chiede al server il codice proposto senza salvare nulla', async () => {
    const promise = firstValueFrom(
      service.generateSku({
        productName: 'Maglietta',
        category: 'Maglieria',
        optionValues: [{ name: 'Taglia', value: 'M' }],
      }),
    );

    const req = httpMock.expectOne(`${API_BASE}/products/sku/generate`);
    expect(req.request.method).toBe('POST');
    expect(asRecord(req.request.body)['productName']).toBe('Maglietta');
    req.flush({ sku: 'MAG-MAGLIETTA-M' });

    await expect(promise).resolves.toEqual({ sku: 'MAG-MAGLIETTA-M' });
  });

  it('getPriceModePreference estrae il flag ricordato per l operatore', async () => {
    const promise = firstValueFrom(service.getPriceModePreference());

    const req = httpMock.expectOne(`${API_BASE}/products/price-mode-preference`);
    expect(req.request.method).toBe('GET');
    req.flush({ pricesIncludeVat: true });

    await expect(promise).resolves.toBe(true);
  });

  it('createProduct invia il payload mappato e restituisce il prodotto creato', async () => {
    const promise = firstValueFrom(service.createProduct(createDto));

    const req = httpMock.expectOne(`${API_BASE}/products`);
    expect(req.request.method).toBe('POST');
    const body = asRecord(req.request.body);
    expect(body['name']).toBe('Maglietta');
    expect(body['sellingPrice']).toEqual({ amountMinor: 2990, currency: DEFAULT_CURRENCY });
    req.flush(productRow({ id: 'prod-new', name: 'Maglietta' }));

    const product = await promise;
    expect(product.id).toBe('prod-new');
  });

  it('createProduct invalida la cache delle opzioni filtro', async () => {
    const optionsPromise = firstValueFrom(service.getFilterOptions());
    httpMock
      .expectOne(`${API_BASE}/products/facets`)
      .flush({ categories: ['Maglieria'], brands: [], seasons: [] });
    await optionsPromise;

    const createPromise = firstValueFrom(service.createProduct(createDto));
    httpMock.expectOne(`${API_BASE}/products`).flush(productRow({ id: 'prod-new' }));
    await createPromise;

    const secondOptions = firstValueFrom(service.getFilterOptions());
    httpMock
      .expectOne(`${API_BASE}/products/facets`)
      .flush({ categories: ['Camiceria'], brands: [], seasons: [] });

    await expect(secondOptions).resolves.toMatchObject({ categories: ['Camiceria'] });
  });

  it('updateProduct usa PATCH sull id e mappa il prodotto aggiornato', async () => {
    const updateDto: UpdateProductDto = { name: 'Maglietta girocollo' };
    const promise = firstValueFrom(service.updateProduct('prod-1', updateDto));

    const req = httpMock.expectOne(`${API_BASE}/products/prod-1`);
    expect(req.request.method).toBe('PATCH');
    expect(asRecord(req.request.body)['name']).toBe('Maglietta girocollo');
    req.flush(productRow({ name: 'Maglietta girocollo' }));

    await expect(promise).resolves.toMatchObject({ name: 'Maglietta girocollo' });
  });

  it('deleteProduct usa DELETE sull id del prodotto', async () => {
    const promise = firstValueFrom(service.deleteProduct('prod-1'));

    const req = httpMock.expectOne(`${API_BASE}/products/prod-1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);

    await promise;
  });

  it('duplicateProduct chiama l endpoint dedicato e mappa la copia', async () => {
    const promise = firstValueFrom(service.duplicateProduct('prod-1'));

    const req = httpMock.expectOne(`${API_BASE}/products/prod-1/duplicate`);
    expect(req.request.method).toBe('POST');
    req.flush(productRow({ id: 'prod-copia', name: 'Maglietta (copia)' }));

    await expect(promise).resolves.toMatchObject({ id: 'prod-copia' });
  });

  it('uploadProductImage invia il file in FormData e mappa l immagine', async () => {
    const file = new File(['bytes'], 'foto.jpg', { type: 'image/jpeg' });
    const promise = firstValueFrom(service.uploadProductImage('prod-1', file));

    const req = httpMock.expectOne(`${API_BASE}/products/prod-1/images`);
    expect(req.request.method).toBe('POST');
    expect(asFormData(req.request.body).get('file')).toBeInstanceOf(File);
    req.flush({ id: 'img-1', url: 'https://cdn.test/foto.jpg', altText: null, sortOrder: 0 });

    await expect(promise).resolves.toEqual({
      id: 'img-1',
      url: 'https://cdn.test/foto.jpg',
      altText: undefined,
      sortOrder: 0,
    });
  });

  it('uploadProductImage conserva il testo alternativo restituito', async () => {
    const file = new File(['bytes'], 'foto.jpg', { type: 'image/jpeg' });
    const promise = firstValueFrom(service.uploadProductImage('prod-1', file));

    httpMock
      .expectOne(`${API_BASE}/products/prod-1/images`)
      .flush({ id: 'img-2', url: 'https://cdn.test/b.jpg', altText: 'Maglia rossa', sortOrder: 2 });

    await expect(promise).resolves.toMatchObject({ altText: 'Maglia rossa', sortOrder: 2 });
  });

  it('deleteProductImage usa DELETE sull immagine del prodotto', async () => {
    const promise = firstValueFrom(service.deleteProductImage('prod-1', 'img-1'));

    const req = httpMock.expectOne(`${API_BASE}/products/prod-1/images/img-1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);

    await promise;
  });

  it('syncProductToShopify riporta l esito del push, anche quando prosegue in background', async () => {
    const promise = firstValueFrom(service.syncProductToShopify('prod-1'));

    const req = httpMock.expectOne(`${API_BASE}/products/prod-1/sync-shopify`);
    expect(req.request.method).toBe('POST');
    req.flush({ pushed: true, followUpInBackground: true });

    await expect(promise).resolves.toEqual({ pushed: true, followUpInBackground: true });
  });

  it('syncProductToShopify riporta il motivo quando il push non avviene', async () => {
    const promise = firstValueFrom(service.syncProductToShopify('prod-1'));

    httpMock
      .expectOne(`${API_BASE}/products/prod-1/sync-shopify`)
      .flush({ pushed: false, reason: 'Shopify non collegato' });

    await expect(promise).resolves.toMatchObject({
      pushed: false,
      reason: 'Shopify non collegato',
    });
  });

  it('previewProductImport classifica le righe in pronte, con avviso e in errore', async () => {
    const file = new File(['handle,name'], 'prodotti.csv', { type: 'text/csv' });
    const promise = firstValueFrom(service.previewProductImport(file));

    const req = httpMock.expectOne(`${API_BASE}/products/import/preview`);
    expect(req.request.method).toBe('POST');
    expect(asFormData(req.request.body).get('file')).toBeInstanceOf(File);
    req.flush({
      products: [
        { handle: 'h1', dto: { name: 'Pronto', variants: [{}, {}] }, issues: [], rowNumbers: [2] },
        {
          handle: 'h2',
          dto: { name: 'Avviso', variants: [{}] },
          issues: [{ level: 'warning', message: 'Prezzo mancante', rowNumber: 3 }],
          rowNumbers: [3],
          alreadyImported: true,
        },
        {
          handle: 'h3',
          dto: { name: 'Errore', variants: [] },
          issues: [{ level: 'error', message: 'SKU duplicato' }],
          rowNumbers: [4],
        },
      ],
      summary: { total: 3, ready: 1, warnings: 1, errors: 1, alreadyImported: 1 },
    });

    const preview = await promise;
    expect(preview.products.map((item) => item.status)).toEqual(['ready', 'warning', 'error']);
    expect(preview.products[0]?.variantCount).toBe(2);
    expect(preview.products[0]?.alreadyImported).toBe(false);
    expect(preview.products[1]?.alreadyImported).toBe(true);
    expect(preview.summary.total).toBe(3);
  });

  it('importProducts invia gli handle selezionati insieme al file', async () => {
    const file = new File(['handle,name'], 'prodotti.csv', { type: 'text/csv' });
    const promise = firstValueFrom(service.importProducts(file, ['h1', 'h2']));

    const req = httpMock.expectOne(`${API_BASE}/products/import`);
    expect(req.request.method).toBe('POST');
    const body = asFormData(req.request.body);
    expect(body.get('file')).toBeInstanceOf(File);
    expect(body.get('handles')).toBe(JSON.stringify(['h1', 'h2']));
    req.flush({ imported: 2, skipped: 0, failed: 0, articleCodesGenerated: 1, products: [] });

    await expect(promise).resolves.toMatchObject({ imported: 2, articleCodesGenerated: 1 });
  });

  it('importProducts senza handle non invia il campo handles', async () => {
    const file = new File(['handle,name'], 'prodotti.csv', { type: 'text/csv' });
    const promise = firstValueFrom(service.importProducts(file));

    const req = httpMock.expectOne(`${API_BASE}/products/import`);
    expect(asFormData(req.request.body).get('handles')).toBeNull();
    req.flush({ imported: 0, skipped: 0, failed: 0, articleCodesGenerated: 0, products: [] });

    await promise;
  });

  it('importProducts con lista handle vuota non invia il campo handles', async () => {
    const file = new File(['handle,name'], 'prodotti.csv', { type: 'text/csv' });
    const promise = firstValueFrom(service.importProducts(file, []));

    const req = httpMock.expectOne(`${API_BASE}/products/import`);
    expect(asFormData(req.request.body).get('handles')).toBeNull();
    req.flush({ imported: 0, skipped: 0, failed: 0, articleCodesGenerated: 0, products: [] });

    await promise;
  });

  it('exportProductsCsv richiede un blob applicando i filtri della lista', async () => {
    const promise = firstValueFrom(
      service.exportProductsCsv({
        search: 'magli',
        status: ProductStatus.Active,
        category: 'Maglieria',
        brand: 'Brand A',
        season: 'PE',
      }),
    );

    const req = httpMock.expectOne((request) => request.url.includes('/products/export/csv'));
    expect(req.request.responseType).toBe('blob');
    expect(req.request.params.get('search')).toBe('magli');
    expect(req.request.params.get('status')).toBe(ProductStatus.Active);
    expect(req.request.params.get('category')).toBe('Maglieria');
    expect(req.request.params.get('brand')).toBe('Brand A');
    expect(req.request.params.get('season')).toBe('PE');
    req.flush(new Blob(['sku,nome'], { type: 'text/csv' }));

    const blob = await promise;
    expect(blob.type).toContain('text/csv');
  });

  it('exportProductsCsv senza filtri non invia parametri', async () => {
    const promise = firstValueFrom(service.exportProductsCsv({}));

    const req = httpMock.expectOne((request) => request.url.includes('/products/export/csv'));
    expect(req.request.params.keys().length).toBe(0);
    req.flush(new Blob(['sku,nome'], { type: 'text/csv' }));

    await promise;
  });
});
