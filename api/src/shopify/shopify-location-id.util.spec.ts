import { describe, expect, it } from 'vitest';

import { isSameShopifyLocationId, normalizeShopifyLocationId } from './shopify-location-id.util';

describe('shopify-location-id.util', () => {
  it('normalizza GID GraphQL in id numerico', () => {
    expect(normalizeShopifyLocationId('gid://shopify/Location/12345')).toBe('12345');
  });

  it('confronta REST numerico e GID equivalente', () => {
    expect(isSameShopifyLocationId('12345', 'gid://shopify/Location/12345')).toBe(true);
  });
});
