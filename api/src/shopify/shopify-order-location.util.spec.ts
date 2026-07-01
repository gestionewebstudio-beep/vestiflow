import { describe, expect, it } from 'vitest';

import { extractShopifyOrderLocationId } from './shopify-order-location.util';

describe('extractShopifyOrderLocationId', () => {
  it('usa location_id diretto sull ordine', () => {
    expect(
      extractShopifyOrderLocationId({ location_id: 12345 }),
    ).toBe('gid://shopify/Location/12345');
  });

  it('fallback su fulfillment location', () => {
    expect(
      extractShopifyOrderLocationId({
        fulfillments: [{ location_id: 99 }],
      }),
    ).toBe('gid://shopify/Location/99');
  });

  it('ritorna null se manca location', () => {
    expect(extractShopifyOrderLocationId({})).toBeNull();
  });
});
