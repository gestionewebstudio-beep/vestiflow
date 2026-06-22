import { describe, expect, it } from 'vitest';

import {
  minorToShopifyDecimal,
  shopifyDecimalToMinor,
  shopifyGid,
} from './shopify-money.util';

describe('shopify-money.util', () => {
  describe('shopifyDecimalToMinor', () => {
    it('converte stringhe decimali Shopify in unità minori', () => {
      expect(shopifyDecimalToMinor('29.90')).toBe(2990);
      expect(shopifyDecimalToMinor('0.99')).toBe(99);
      expect(shopifyDecimalToMinor('100')).toBe(10000);
    });

    it('gestisce valori negativi', () => {
      expect(shopifyDecimalToMinor('-10.50')).toBe(-1050);
    });

    it('ritorna 0 per input non validi', () => {
      expect(shopifyDecimalToMinor('')).toBe(0);
      expect(shopifyDecimalToMinor('abc')).toBe(0);
      expect(shopifyDecimalToMinor('12,50')).toBe(0);
    });
  });

  describe('minorToShopifyDecimal', () => {
    it('converte unità minori in stringa decimale', () => {
      expect(minorToShopifyDecimal(2990)).toBe('29.90');
      expect(minorToShopifyDecimal(99)).toBe('0.99');
      expect(minorToShopifyDecimal(10000)).toBe('100.00');
    });

    it('gestisce valori negativi', () => {
      expect(minorToShopifyDecimal(-1050)).toBe('-10.50');
    });
  });

  describe('shopifyGid', () => {
    it('costruisce GID GraphQL Shopify', () => {
      expect(shopifyGid('Product', 123)).toBe('gid://shopify/Product/123');
      expect(shopifyGid('ProductVariant', '456')).toBe('gid://shopify/ProductVariant/456');
    });
  });
});
