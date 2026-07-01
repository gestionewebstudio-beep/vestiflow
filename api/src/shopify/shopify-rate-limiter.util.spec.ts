import { describe, expect, it } from 'vitest';

import {
  computeGraphQlRequestDelayMs,
  computeRestRequestDelayMs,
  computeShopifyRetryDelayMs,
  parseGraphQlCostExtensions,
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

  describe('computeRestRequestDelayMs', () => {
    const minInterval = 500;
    const burstRatio = 0.25;
    const highWatermark = 0.85;
    const coldStart = 150;

    it('usa cold start senza snapshot bucket', () => {
      expect(
        computeRestRequestDelayMs(null, minInterval, burstRatio, highWatermark, coldStart),
      ).toBe(150);
    });

    it('non ritarda sotto la soglia burst', () => {
      expect(
        computeRestRequestDelayMs(
          { used: 5, max: 40 },
          minInterval,
          burstRatio,
          highWatermark,
          coldStart,
        ),
      ).toBe(0);
    });

    it('scala linearmente tra burst e high watermark', () => {
      const delay = computeRestRequestDelayMs(
        { used: 22, max: 40 },
        minInterval,
        burstRatio,
        highWatermark,
        coldStart,
      );
      expect(delay).toBeGreaterThan(0);
      expect(delay).toBeLessThan(minInterval);
    });

    it('applica ritardo massimo vicino al pieno', () => {
      expect(
        computeRestRequestDelayMs(
          { used: 36, max: 40 },
          minInterval,
          burstRatio,
          highWatermark,
          coldStart,
        ),
      ).toBe(minInterval);
    });
  });

  describe('parseGraphQlCostExtensions', () => {
    it('parsa throttleStatus e costi query', () => {
      expect(
        parseGraphQlCostExtensions({
          cost: {
            requestedQueryCost: 120,
            actualQueryCost: 46,
            throttleStatus: {
              maximumAvailable: 2000,
              currentlyAvailable: 1954,
              restoreRate: 100,
            },
          },
        }),
      ).toEqual({
        requestedQueryCost: 120,
        actualQueryCost: 46,
        throttleStatus: {
          maximumAvailable: 2000,
          currentlyAvailable: 1954,
          restoreRate: 100,
        },
      });
    });

    it('ritorna null per payload invalidi', () => {
      expect(parseGraphQlCostExtensions(null)).toBeNull();
      expect(parseGraphQlCostExtensions({ cost: {} })).toBeNull();
    });
  });

  describe('computeGraphQlRequestDelayMs', () => {
    it('non ritarda con punti costo sufficienti', () => {
      expect(
        computeGraphQlRequestDelayMs(
          { maximumAvailable: 2000, currentlyAvailable: 500, restoreRate: 100 },
          100,
        ),
      ).toBe(0);
    });

    it('attende in base al deficit di punti', () => {
      expect(
        computeGraphQlRequestDelayMs(
          { maximumAvailable: 2000, currentlyAvailable: 40, restoreRate: 100 },
          100,
        ),
      ).toBe(600);
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
