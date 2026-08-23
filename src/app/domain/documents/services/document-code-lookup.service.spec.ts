import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { ProductService } from '@domain/products/services/product.service';
import type { VariantSummary } from '@domain/products/models/variant-summary.model';

import { DocumentCodeLookupService } from './document-code-lookup.service';

function variant(overrides: Partial<VariantSummary> & { variantId: string }): VariantSummary {
  return {
    productId: 'prod-1',
    sku: 'SKU-1',
    articleCode: 'ART-1',
    productName: 'Maglietta',
    title: 'Maglietta — M',
    variantLabel: '',
    sellingPrice: { amountMinor: 1000, currencyCode: 'EUR' },
    ...overrides,
  };
}

function setup(productServiceMock: {
  findVariantByCode?: ReturnType<typeof vi.fn>;
  searchVariantSummaries?: ReturnType<typeof vi.fn>;
}) {
  TestBed.configureTestingModule({
    providers: [{ provide: ProductService, useValue: productServiceMock }],
  });
  return {
    service: TestBed.inject(DocumentCodeLookupService),
    productService: productServiceMock,
  };
}

describe('DocumentCodeLookupService', () => {
  it('un codice vuoto non interroga il catalogo', async () => {
    const { service, productService } = setup({
      searchVariantSummaries: vi.fn(() => of([])),
      findVariantByCode: vi.fn(() => of({ variantId: 'var-1' })),
    });

    await expect(firstValueFrom(service.resolve('   ', 'sku'))).resolves.toEqual({ kind: 'none' });
    expect(productService.searchVariantSummaries).not.toHaveBeenCalled();
  });

  it('una corrispondenza esatta aggancia, e porta con sé il riepilogo', async () => {
    const { service } = setup({
      searchVariantSummaries: vi.fn(() => of([variant({ variantId: 'var-1', sku: 'MAG-M' })])),
    });

    const outcome = await firstValueFrom(service.resolve('mag-m', 'sku'));

    expect(outcome.kind).toBe('one');
    // Il riepilogo viaggia con l'esito: chi aggancia la riga ce l'ha già in
    // mano e non deve richiederlo al server una seconda volta.
    expect(outcome.kind === 'one' && outcome.summary?.variantId).toBe('var-1');
    expect(outcome.kind === 'one' && outcome.variantId).toBe('var-1');
  });

  // Il cuore della decisione: gli esiti sono tre. Appiattire «più d'una» su
  // «nessuna» fa comportare un codice giusto come un codice inesistente.
  it('più corrispondenze esatte non agganciano: aprono la scelta', async () => {
    const { service, productService } = setup({
      searchVariantSummaries: vi.fn(() =>
        of([
          variant({ variantId: 'var-M', articleCode: 'ART-9' }),
          variant({ variantId: 'var-L', articleCode: 'ART-9' }),
        ]),
      ),
      findVariantByCode: vi.fn(() => of({ variantId: 'var-M' })),
    });

    const outcome = await firstValueFrom(service.resolve('ART-9', 'articleCode'));

    expect(outcome.kind).toBe('many');
    expect(outcome.kind === 'many' && outcome.matches.map((row) => row.variantId)).toEqual([
      'var-M',
      'var-L',
    ]);
    // Il caso ambiguo non passa dall'endpoint: quello tace, e tacere qui
    // significherebbe far sparire un codice corretto.
    expect(productService.findVariantByCode).not.toHaveBeenCalled();
  });

  // La ricerca testuale guarda dentro nome e marca: senza filtro esatto,
  // digitando «100» comparirebbero i «Jeans 100 slim».
  it('scarta i risultati che non corrispondono esattamente', async () => {
    const { service } = setup({
      searchVariantSummaries: vi.fn(() =>
        of([variant({ variantId: 'var-1', sku: 'JEANS-100-SLIM' })]),
      ),
      findVariantByCode: vi.fn(() => throwError(() => new Error('404'))),
    });

    await expect(firstValueFrom(service.resolve('100', 'sku'))).resolves.toEqual({ kind: 'none' });
  });

  it('senza corrispondenze in pagina prova l’endpoint per codice', async () => {
    const { service, productService } = setup({
      searchVariantSummaries: vi.fn(() => of([])),
      findVariantByCode: vi.fn(() => of({ variantId: 'var-7' })),
    });

    await expect(firstValueFrom(service.resolve('8001234567890', 'barcode'))).resolves.toEqual({
      kind: 'one',
      variantId: 'var-7',
      summary: null,
    });
    expect(productService.findVariantByCode).toHaveBeenCalledWith('8001234567890');
  });

  it('nessuna corrispondenza da nessuna delle due strade: il valore resta scritto', async () => {
    const { service } = setup({
      searchVariantSummaries: vi.fn(() => of([])),
      findVariantByCode: vi.fn(() => throwError(() => new Error('404'))),
    });

    await expect(firstValueFrom(service.resolve('IGNOTO', 'articleCode'))).resolves.toEqual({
      kind: 'none',
    });
  });

  it('un errore di rete degrada a «nessuna corrispondenza», non blocca la riga', async () => {
    const { service } = setup({
      searchVariantSummaries: vi.fn(() => throwError(() => new Error('500'))),
      findVariantByCode: vi.fn(() => throwError(() => new Error('500'))),
    });

    await expect(firstValueFrom(service.resolve('ART-1', 'articleCode'))).resolves.toEqual({
      kind: 'none',
    });
  });

  // Il filtro per fornitore è ciò che faceva riconoscere lo stesso codice in un
  // documento e ignorarlo in un altro: non deve rientrare da questa porta.
  it('non filtra mai per fornitore, e chiede la pagina larga', async () => {
    const search = vi.fn(() => of([]));
    const { service } = setup({
      searchVariantSummaries: search,
      findVariantByCode: vi.fn(() => throwError(() => new Error('404'))),
    });

    await firstValueFrom(service.resolve('FORN-1', 'supplierCode', { locationId: 'loc-1' }));

    expect(search).toHaveBeenCalledWith({
      search: 'FORN-1',
      pageSize: 100,
      locationId: 'loc-1',
    });
  });
});
