import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { ProductService } from '@features/products/services/product.service';

import { BarcodeLookupService } from './barcode-lookup.service';

describe('BarcodeLookupService', () => {
  function setup(productServiceMock: {
    findVariantByCode?: ReturnType<typeof vi.fn>;
    searchVariantSummaries?: ReturnType<typeof vi.fn>;
  }) {
    TestBed.configureTestingModule({
      providers: [{ provide: ProductService, useValue: productServiceMock }],
    });
    return {
      service: TestBed.inject(BarcodeLookupService),
      productService: productServiceMock,
    };
  }

  describe('parseScanInput', () => {
    it('parsa il prefisso quantità N*codice', () => {
      const { service } = setup({});
      expect(service.parseScanInput('3*8001234567890')).toEqual({
        quantity: 3,
        code: '8001234567890',
      });
    });

    it('usa quantità 1 senza prefisso', () => {
      const { service } = setup({});
      expect(service.parseScanInput(' 8001234567890 ')).toEqual({
        quantity: 1,
        code: '8001234567890',
      });
    });
  });

  describe('resolveVariantIdByCode', () => {
    it('risolve subito dalla ricerca per codice esatto', async () => {
      const { service, productService } = setup({
        findVariantByCode: vi.fn(() => of({ variantId: 'var-1' })),
        searchVariantSummaries: vi.fn(() => of([])),
      });

      await expect(firstValueFrom(service.resolveVariantIdByCode('8001234567890'))).resolves.toBe(
        'var-1',
      );
      expect(productService.searchVariantSummaries).not.toHaveBeenCalled();
    });

    it('usa il fallback locale del modulo prima della ricerca libera', async () => {
      const { service, productService } = setup({
        findVariantByCode: vi.fn(() => throwError(() => new Error('404'))),
        searchVariantSummaries: vi.fn(() => of([])),
      });

      const resolved = await firstValueFrom(
        service.resolveVariantIdByCode('SKU-FORN', {
          localFallback: (code) => (code === 'SKU-FORN' ? 'var-local' : null),
        }),
      );

      expect(resolved).toBe('var-local');
      expect(productService.searchVariantSummaries).not.toHaveBeenCalled();
    });

    it('ricade sulla ricerca libera con match esatto barcode', async () => {
      const { service, productService } = setup({
        findVariantByCode: vi.fn(() => throwError(() => new Error('404'))),
        searchVariantSummaries: vi.fn(() =>
          of([
            { variantId: 'var-a', sku: 'ALTRO', barcode: '8001234567890' },
            { variantId: 'var-b', sku: 'B', barcode: '9999999999999' },
          ]),
        ),
      });

      await expect(firstValueFrom(service.resolveVariantIdByCode('8001234567890'))).resolves.toBe(
        'var-a',
      );
      expect(productService.searchVariantSummaries).toHaveBeenCalledWith({
        search: '8001234567890',
        pageSize: 5,
        supplierId: undefined,
        locationId: undefined,
      });
    });

    it('accetta il match esatto SKU case-insensitive, mai match parziali', async () => {
      const { service } = setup({
        findVariantByCode: vi.fn(() => throwError(() => new Error('404'))),
        searchVariantSummaries: vi.fn(() =>
          of([
            { variantId: 'var-partial', sku: 'MAG-001-XL', barcode: null },
            { variantId: 'var-exact', sku: 'mag-001', barcode: null },
          ]),
        ),
      });

      await expect(firstValueFrom(service.resolveVariantIdByCode('MAG-001'))).resolves.toBe(
        'var-exact',
      );
    });

    it('ritorna null se nessun match esatto e su errore della ricerca', async () => {
      const { service } = setup({
        findVariantByCode: vi.fn(() => throwError(() => new Error('404'))),
        searchVariantSummaries: vi.fn(() => throwError(() => new Error('500'))),
      });

      await expect(
        firstValueFrom(service.resolveVariantIdByCode('CODICE-IGNOTO')),
      ).resolves.toBeNull();
    });

    it('ritorna null per input vuoto senza chiamate HTTP', async () => {
      const { service, productService } = setup({
        findVariantByCode: vi.fn(),
        searchVariantSummaries: vi.fn(),
      });

      await expect(firstValueFrom(service.resolveVariantIdByCode('   '))).resolves.toBeNull();
      expect(productService.findVariantByCode).not.toHaveBeenCalled();
    });
  });
});
