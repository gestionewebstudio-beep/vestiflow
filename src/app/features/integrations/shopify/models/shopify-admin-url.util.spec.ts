import { describe, expect, it } from 'vitest';

import { buildShopifyAdminOrderUrl, parseShopifyGidNumericId } from './shopify-admin-url.util';

describe('parseShopifyGidNumericId', () => {
  it('estrae l id numerico da un GID ordine', () => {
    expect(parseShopifyGidNumericId('gid://shopify/Order/12151286562889')).toBe('12151286562889');
  });

  it('restituisce null per input non valido', () => {
    expect(parseShopifyGidNumericId('12151286562889')).toBeNull();
    expect(parseShopifyGidNumericId('')).toBeNull();
  });
});

describe('buildShopifyAdminOrderUrl', () => {
  it('costruisce il link admin ordine', () => {
    expect(
      buildShopifyAdminOrderUrl('mystore.myshopify.com', 'gid://shopify/Order/12151286562889'),
    ).toBe('https://mystore.myshopify.com/admin/orders/12151286562889');
  });

  it('normalizza il dominio shop', () => {
    expect(buildShopifyAdminOrderUrl('mystore', 'gid://shopify/Order/42')).toBe(
      'https://mystore.myshopify.com/admin/orders/42',
    );
  });

  it('restituisce null se mancano dati', () => {
    expect(buildShopifyAdminOrderUrl(undefined, 'gid://shopify/Order/1')).toBeNull();
    expect(buildShopifyAdminOrderUrl('mystore.myshopify.com', undefined)).toBeNull();
    expect(buildShopifyAdminOrderUrl('mystore.myshopify.com', 'invalid')).toBeNull();
  });
});
