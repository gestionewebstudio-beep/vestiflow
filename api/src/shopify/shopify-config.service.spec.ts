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
      SHOPIFY_API_VERSION: '2026-07',
    });
    const incomplete = createService({ SHOPIFY_API_KEY: 'key' });

    expect(configured.isOAuthConfigured()).toBe(true);
    expect(incomplete.isOAuthConfigured()).toBe(false);
  });

  it('⛔ il default canonico degli scope include gli ambiti dei canali di vendita', () => {
    // Senza `read_publications`/`write_publications` la pubblicazione per
    // canale è impossibile: `publishablePublish` risponde «Access denied ...
    // Required access: write_publications access scope» (docs/24 §10).
    //
    // ⚠️ Perderli dal default non romperebbe nessun test di comportamento e
    //    non fallirebbe alcuna build: si scoprirebbe alla prossima
    //    riautorizzazione di un negozio, cioè settimane dopo.
    const service = createService({});

    expect(service.requestedScopes).toContain('read_publications');
    expect(service.requestedScopes).toContain('write_publications');
  });

  it("⚠️ SHOPIFY_SCOPES dell'ambiente VINCE sul default, anche se è più povero", () => {
    // È il motivo per cui aggiungere gli ambiti al default non basta: chi ha un
    // `.env` che dichiara SHOPIFY_SCOPES continua a richiedere quelli, e la
    // diagnostica lo classifica `not_requested` — dove riconnettere NON serve.
    const service = createService({ SHOPIFY_SCOPES: 'read_products,write_products' });

    expect(service.requestedScopes).toEqual(['read_products', 'write_products']);
    expect(service.requestedScopes).not.toContain('read_publications');
  });

  it('espone versione API e webhook URL derivati', () => {
    const service = createService({
      SHOPIFY_APP_URL: 'https://api.test/',
      FRONTEND_URL: 'https://app.test',
    });

    expect(service.apiVersion).toBe('2026-07');
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
