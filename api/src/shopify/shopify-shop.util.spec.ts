import { describe, expect, it } from 'vitest';

import { normalizeShopInput } from './shopify-shop.util';

describe('normalizeShopInput', () => {
  it('aggiunge .myshopify.com se mancante', () => {
    expect(normalizeShopInput('MyStore')).toBe('mystore.myshopify.com');
  });

  it('normalizza URL completo e trailing slash', () => {
    expect(normalizeShopInput('https://Brand-X.myshopify.com/')).toBe('brand-x.myshopify.com');
  });

  it('rimuove punto finale', () => {
    expect(normalizeShopInput('mystore.')).toBe('mystore.myshopify.com');
  });

  it('preserva dominio gia completo', () => {
    expect(normalizeShopInput('brand-x.myshopify.com')).toBe('brand-x.myshopify.com');
  });
});
