import { firstValueFrom, type Observable } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import { ProductStatus } from '@core/models/product.model';
import { moneyFromMajor } from '@core/utils/money.util';

import type { CreateProductDto } from '../models/product.dto';
import { ProductService } from './product.service';

// Le chiamate mock hanno latenza simulata: i timer finti la azzerano.
async function settle<T>(source: Observable<T>): Promise<T> {
  const promise = firstValueFrom(source);
  await vi.runAllTimersAsync();
  return promise;
}

async function settleError(source: Observable<unknown>): Promise<unknown> {
  const promise = firstValueFrom(source).then(
    () => {
      throw new Error('Atteso un errore, la chiamata e riuscita.');
    },
    (err: unknown) => err,
  );
  await vi.runAllTimersAsync();
  return promise;
}

function createDto(skus: readonly string[]): CreateProductDto {
  return {
    name: 'Prodotto di test',
    status: ProductStatus.Draft,
    options: [{ name: 'Taglia', values: ['M', 'L'] }],
    variants: skus.map((sku, index) => ({
      sku,
      optionValues: [{ name: 'Taglia', value: index === 0 ? 'M' : 'L' }],
      sellingPrice: moneyFromMajor(19.9),
    })),
  };
}

describe('ProductService', () => {
  let service: ProductService;

  beforeEach(() => {
    vi.useFakeTimers();
    service = new ProductService();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getProducts', () => {
    it('pagina e riporta i meta corretti', async () => {
      const response = await settle(service.getProducts({ page: 1, pageSize: 3 }));
      expect(response.data.length).toBeLessThanOrEqual(3);
      expect(response.meta.page).toBe(1);
      expect(response.meta.pageSize).toBe(3);
      expect(response.meta.totalPages).toBe(Math.ceil(response.meta.total / 3));
    });

    it('la sentinella "errore" nella ricerca produce un AppError server', async () => {
      const err = await settleError(
        service.getProducts({ page: 1, pageSize: 10, search: 'errore' }),
      );
      expect(isAppError(err) && err.kind === AppErrorKind.Server).toBe(true);
    });
  });

  describe('getProductById', () => {
    it('AppError NotFound per id inesistente', async () => {
      const err = await settleError(service.getProductById('id-che-non-esiste'));
      expect(isAppError(err) && err.kind === AppErrorKind.NotFound).toBe(true);
    });
  });

  describe('createProduct', () => {
    it('crea prodotto e varianti recuperabili', async () => {
      const created = await settle(service.createProduct(createDto(['TEST-001-M', 'TEST-001-L'])));
      expect(created.id).toBeTruthy();

      const fetched = await settle(service.getProductById(created.id));
      expect(fetched.name).toBe('Prodotto di test');

      const variants = await settle(service.getProductVariants(created.id));
      expect(variants.map((variant) => variant.sku)).toEqual(['TEST-001-M', 'TEST-001-L']);
    });

    it('blocca SKU duplicati nel payload con AppError Validation (422)', async () => {
      const err = await settleError(service.createProduct(createDto(['TEST-DUP', 'test-dup'])));
      expect(isAppError(err) && err.kind === AppErrorKind.Validation).toBe(true);
    });

    it('blocca SKU gia presenti a catalogo', async () => {
      const summaries = await settle(service.getVariantSummaries());
      const existingSku = summaries[0]?.sku ?? '';
      expect(existingSku).not.toBe('');

      const err = await settleError(service.createProduct(createDto([existingSku, 'TEST-NEW'])));
      expect(isAppError(err) && err.kind === AppErrorKind.Conflict).toBe(true);
    });
  });

  describe('updateProduct', () => {
    it('aggiorna i campi generali e tocca updatedAt', async () => {
      const created = await settle(service.createProduct(createDto(['TEST-UPD-M'])));
      const updated = await settle(service.updateProduct(created.id, { name: 'Nome nuovo' }));
      expect(updated.name).toBe('Nome nuovo');
      expect(updated.updatedAt >= created.updatedAt).toBe(true);
    });

    it('AppError NotFound per id inesistente', async () => {
      const err = await settleError(service.updateProduct('id-che-non-esiste', { name: 'X' }));
      expect(isAppError(err) && err.kind === AppErrorKind.NotFound).toBe(true);
    });
  });

  describe('deleteProduct', () => {
    it('rimuove prodotto e varianti', async () => {
      const created = await settle(service.createProduct(createDto(['TEST-DEL-M'])));
      await settle(service.deleteProduct(created.id));

      const err = await settleError(service.getProductById(created.id));
      expect(isAppError(err) && err.kind === AppErrorKind.NotFound).toBe(true);

      const variants = await settle(service.getProductVariants(created.id));
      expect(variants).toEqual([]);
    });

    it('AppError NotFound per id inesistente', async () => {
      const err = await settleError(service.deleteProduct('id-che-non-esiste'));
      expect(isAppError(err) && err.kind === AppErrorKind.NotFound).toBe(true);
    });
  });

  describe('checkSkuAvailability', () => {
    it('segnala gli SKU gia in uso (normalizzati)', async () => {
      const summaries = await settle(service.getVariantSummaries());
      const existingSku = summaries[0]?.sku ?? '';

      const result = await settle(
        service.checkSkuAvailability([existingSku.toLowerCase(), 'SKU-LIBERO-XYZ']),
      );
      expect(result.available).toBe(false);
      expect(result.taken).toEqual([existingSku.toUpperCase()]);
    });

    it('exclude del prodotto in modifica: i suoi SKU non si auto-bloccano', async () => {
      const created = await settle(service.createProduct(createDto(['TEST-EXCL-M'])));
      const result = await settle(service.checkSkuAvailability(['TEST-EXCL-M'], created.id));
      expect(result.available).toBe(true);
    });
  });
});
