import { describe, expect, it } from 'vitest';

import { ShopifyConfigService } from './shopify-config.service';

describe('ShopifyConfigService', () => {
  function createService(values: Record<string, string | undefined>) {
    return new ShopifyConfigService({
      get: (key: string) => values[key],
    } as never);
  }

  it('isOAuthConfigured richiede tutte le variabili critiche', () => {
    const configured = createService({
      SHOPIFY_API_KEY: 'key',
      SHOPIFY_API_SECRET: 'secret',
      SHOPIFY_OAUTH_CALLBACK_URL: 'https://api.test/callback',
      SHOPIFY_TOKEN_ENCRYPTION_KEY: 'enc-key',
      SHOPIFY_API_VERSION: '2025-01',
    });
    const incomplete = createService({ SHOPIFY_API_KEY: 'key' });

    expect(configured.isOAuthConfigured()).toBe(true);
    expect(incomplete.isOAuthConfigured()).toBe(false);
  });

  it('espone versione API e webhook URL derivati', () => {
    const service = createService({
      SHOPIFY_APP_URL: 'https://api.test/',
      FRONTEND_URL: 'https://app.test',
    });

    expect(service.apiVersion).toBe('2025-01');
    expect(service.callbackUrl).toBe('https://api.test/api/v1/shopify/auth/callback');
    expect(service.webhookUrl).toBe('https://api.test/api/v1/shopify/webhooks');
    expect(service.frontendUrl).toBe('https://app.test');
  });

  it('normalizza dominio negozio', () => {
    const service = createService({});

    expect(service.normalizeShopDomain('my-shop')).toBe('my-shop.myshopify.com');
  });

  it('espone parametri rate limit con default', () => {
    const service = createService({});

    expect(service.apiMinIntervalMs).toBe(500);
    expect(service.apiBucketBurstRatio).toBe(0.25);
    expect(service.apiColdStartIntervalMs).toBe(150);
    expect(service.graphqlMinIntervalMs).toBe(50);
    expect(service.graphqlCostReservePoints).toBe(100);
    expect(service.apiMaxRetries).toBe(5);
    expect(service.apiBucketHighWatermark).toBe(0.85);
    expect(service.apiBucketPauseMs).toBe(1000);
    expect(service.requestedScopes.length).toBeGreaterThan(0);
  });
});
