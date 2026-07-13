import { describe, expect, it } from 'vitest';

import { computeShopifyPublishableAvailable } from './shopify-publishable-available.util';

describe('computeShopifyPublishableAvailable', () => {
  it('esempio positivo: Giacenza 10, Impegnata 3 → Shopify riceve 7', () => {
    expect(computeShopifyPublishableAvailable(10, 3)).toBe(7);
  });

  it('esempio negativo interno: Giacenza 5, Impegnata 7 → Shopify riceve 0', () => {
    expect(computeShopifyPublishableAvailable(5, 7)).toBe(0);
  });

  it('applica scorta di sicurezza quando configurata', () => {
    expect(computeShopifyPublishableAvailable(10, 3, 2)).toBe(5);
  });

  it('non invia mai valori negativi a Shopify', () => {
    expect(computeShopifyPublishableAvailable(-5, 0)).toBe(0);
    expect(computeShopifyPublishableAvailable(0, 10)).toBe(0);
  });
});
