import { describe, expect, it } from 'vitest';

import { ProductStatus } from '@core/models/product.model';
import { DEFAULT_CURRENCY } from '@core/utils/money.util';

import type { CreateProductDto, UpdateProductDto } from '../models/product.dto';
import { toCreateProductBody, toUpdateProductBody } from './product-api.mapper';

const baseDto: CreateProductDto = {
  name: 'Maglietta',
  description: 'Cotone',
  tags: ['estate'],
  status: ProductStatus.Active,
  options: [{ name: 'Taglia', values: ['M'] }],
  variants: [
    {
      sku: 'SKU-M',
      optionValues: [{ name: 'Taglia', value: 'M' }],
      sellingPrice: { amountMinor: 2990, currencyCode: DEFAULT_CURRENCY },
      purchasePrice: { amountMinor: 1200, currencyCode: DEFAULT_CURRENCY },
      compareAtPrice: { amountMinor: 3990, currencyCode: DEFAULT_CURRENCY },
    },
  ],
};

describe('product-api.mapper', () => {
  describe('toCreateProductBody', () => {
    it('codice articolo vuoto non inviato (il backend genera il progressivo)', () => {
      expect(toCreateProductBody(baseDto)['articleCode']).toBeUndefined();
      expect(toCreateProductBody({ ...baseDto, articleCode: '  ' })['articleCode']).toBeUndefined();
      expect(toCreateProductBody({ ...baseDto, articleCode: 'ABC001' })['articleCode']).toBe(
        'ABC001',
      );
    });

    it('serializza Money con campo currency per l API', () => {
      const body = toCreateProductBody(baseDto);

      expect(body['name']).toBe('Maglietta');
      const variant = (body['variants'] as Record<string, unknown>[])[0];
      expect(variant?.['sellingPrice']).toEqual({ amountMinor: 2990, currency: DEFAULT_CURRENCY });
      expect(variant?.['purchasePrice']).toEqual({ amountMinor: 1200, currency: DEFAULT_CURRENCY });
      expect(variant?.['compareAtPrice']).toEqual({
        amountMinor: 3990,
        currency: DEFAULT_CURRENCY,
      });
    });
  });

  describe('toUpdateProductBody', () => {
    it('codice articolo: undefined = non toccare, valorizzato = inviato', () => {
      expect(toUpdateProductBody({ ...baseDto })['articleCode']).toBeUndefined();
      expect(toUpdateProductBody({ ...baseDto, articleCode: '00042' })['articleCode']).toBe(
        '00042',
      );
    });

    it('include id variante nel payload PATCH', () => {
      const updateDto: UpdateProductDto = {
        ...baseDto,
        variants: [{ ...baseDto.variants[0]!, id: 'var-1' }],
      };

      const body = toUpdateProductBody(updateDto);
      const variant = (body['variants'] as Record<string, unknown>[])[0];
      expect(variant?.['id']).toBe('var-1');
      expect(variant?.['sellingPrice']).toEqual({ amountMinor: 2990, currency: DEFAULT_CURRENCY });
    });
  });
});
