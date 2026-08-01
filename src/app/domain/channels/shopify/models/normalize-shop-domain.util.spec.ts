import { describe, expect, it } from 'vitest';

import { normalizeShopDomainInput } from './normalize-shop-domain.util';

describe('normalizeShopDomainInput', () => {
  it('aggiunge .myshopify.com se mancante', () => {
    expect(normalizeShopDomainInput('mystore')).toBe('mystore.myshopify.com');
  });

  it('normalizza URL completo e trailing slash', () => {
    expect(normalizeShopDomainInput('https://MyStore.myshopify.com/')).toBe(
      'mystore.myshopify.com',
    );
  });

  it('rimuove punto finale', () => {
    expect(normalizeShopDomainInput('mystore.')).toBe('mystore.myshopify.com');
  });

  it('preserva dominio gia completo', () => {
    expect(normalizeShopDomainInput('brand-x.myshopify.com')).toBe('brand-x.myshopify.com');
  });
});
