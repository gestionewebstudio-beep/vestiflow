import { describe, expect, it } from 'vitest';

import {
  computeShopifyRetryDelayMs,
  parseShopifyCallLimitHeader,
  parseShopifyRetryAfterHeader,
  sleepMs,
} from './shopify-rate-limiter.util';

describe('shopify-rate-limiter.util', () => {
  describe('parseShopifyCallLimitHeader', () => {
    it('parsa header X-Shopify-Shop-Api-Call-Limit', () => {
      expect(parseShopifyCallLimitHeader('32/40')).toEqual({ used: 32, max: 40 });
      expect(parseShopifyCallLimitHeader(' 10 / 40 ')).toEqual({ used: 10, max: 40 });
    });

    it('ritorna null per header invalidi', () => {
      expect(parseShopifyCallLimitHeader(null)).toBeNull();
      expect(parseShopifyCallLimitHeader('invalid')).toBeNull();
      expect(parseShopifyCallLimitHeader('0/0')).toBeNull();
    });
  });

  describe('parseShopifyRetryAfterHeader', () => {
    it('parsa secondi Retry-After', () => {
      expect(parseShopifyRetryAfterHeader('2.5')).toBe(2.5);
      expect(parseShopifyRetryAfterHeader('0')).toBe(0);
    });

    it('ritorna null per valori non validi', () => {
      expect(parseShopifyRetryAfterHeader(undefined)).toBeNull();
      expect(parseShopifyRetryAfterHeader('-1')).toBeNull();
      expect(parseShopifyRetryAfterHeader('abc')).toBeNull();
    });
  });

  describe('computeShopifyRetryDelayMs', () => {
    it('preferisce Retry-After in millisecondi', () => {
      expect(computeShopifyRetryDelayMs(0, 2)).toBe(2000);
    });

    it('usa backoff esponenziale capped senza Retry-After', () => {
      expect(computeShopifyRetryDelayMs(0, null)).toBe(1000);
      expect(computeShopifyRetryDelayMs(3, null)).toBe(8000);
      expect(computeShopifyRetryDelayMs(10, null)).toBe(30_000);
    });
  });

  describe('sleepMs', () => {
    it('risolve immediatamente per ms <= 0', async () => {
      await expect(sleepMs(0)).resolves.toBeUndefined();
      await expect(sleepMs(-1)).resolves.toBeUndefined();
    });
  });
});
