import { describe, expect, it } from 'vitest';

import { ShopifyConnectionStatus } from '@core/models/shopify-connection.model';

import {
  shopifyConnectionStatusLabel,
  shopifyConnectionStatusTone,
} from './shopify-connection-labels.util';

describe('shopify-connection-labels.util', () => {
  for (const status of Object.values(ShopifyConnectionStatus)) {
    it(`copre ShopifyConnectionStatus.${status}`, () => {
      expect(shopifyConnectionStatusLabel(status)).toBeTruthy();
      expect(shopifyConnectionStatusTone(status)).toBeTruthy();
    });
  }
});
