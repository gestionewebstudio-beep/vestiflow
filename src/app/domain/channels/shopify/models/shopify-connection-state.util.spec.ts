import { describe, expect, it } from 'vitest';

import { ShopifyConnectionStatus } from '@core/models/shopify-connection.model';

import { isShopifySyncUiActive } from './shopify-connection-state.util';

describe('shopify-connection-state.util', () => {
  it('isShopifySyncUiActive è false quando non connesso', () => {
    expect(isShopifySyncUiActive(ShopifyConnectionStatus.NotConnected)).toBe(false);
    expect(isShopifySyncUiActive(null)).toBe(false);
  });

  it('isShopifySyncUiActive è true per stati operativi', () => {
    expect(isShopifySyncUiActive(ShopifyConnectionStatus.Connected)).toBe(true);
    expect(isShopifySyncUiActive(ShopifyConnectionStatus.Error)).toBe(true);
    expect(isShopifySyncUiActive(ShopifyConnectionStatus.ReauthRequired)).toBe(true);
  });
});
