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

    // §sei decimali: un netto scorporato non e' intero in unita' minori. Qui
    // l'importo lascia VestiFlow, quindi qui — e solo qui — si arrotonda.
    it('arrotonda la coda decimale al centesimo', () => {
      expect(minorToShopifyDecimal(10161.4754)).toBe('101.61');
      expect(minorToShopifyDecimal(2049.1803)).toBe('20.49');
      expect(minorToShopifyDecimal(2049.5)).toBe('20.50');
    });

    // `toFixed(2)` su `minor / 100` sembra equivalente: su mezzo centesimo non
    // lo e' quasi mai, e due canali pubblicherebbero prezzi diversi.
    it("non e' `toFixed` sul valore in euro", () => {
      expect(minorToShopifyDecimal(1.5)).toBe('0.02');
      expect((1.5 / 100).toFixed(2)).toBe('0.01');
    });
  });

  describe('shopifyGid', () => {
    it('costruisce GID GraphQL Shopify', () => {
      expect(shopifyGid('Product', 123)).toBe('gid://shopify/Product/123');
      expect(shopifyGid('ProductVariant', '456')).toBe('gid://shopify/ProductVariant/456');
    });
  });
});
