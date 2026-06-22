import { describe, expect, it } from 'vitest';

import { toShopifyUserMessage } from './shopify-user-error.util';

describe('toShopifyUserMessage', () => {
  it('usa messaggi noti per codice', () => {
    expect(toShopifyUserMessage('catalog_scope_missing', '')).toContain('permessi');
    expect(toShopifyUserMessage('oauth_scope_not_requested', '')).toContain('SHOPIFY_SCOPES');
    expect(toShopifyUserMessage('oauth_scope_not_granted', '')).toContain('read_products');
  });

  it('gestisce rate limit e timeout', () => {
    expect(toShopifyUserMessage(undefined, 'HTTP 429 Too Many Requests')).toContain(
      'limitato temporaneamente',
    );
    expect(toShopifyUserMessage(undefined, '504 Gateway Timeout')).toContain(
      'impiegato troppo tempo',
    );
    expect(toShopifyUserMessage(undefined, 'transaction already closed')).toContain(
      'impiegato troppo tempo',
    );
  });

  it('gestisce errori scope e connessione', () => {
    expect(toShopifyUserMessage(undefined, 'Missing read_products scope')).toContain(
      'collegamento Shopify',
    );
    expect(toShopifyUserMessage(undefined, 'connessione shopify non attiva')).toContain(
      'connessione Shopify non è attiva',
    );
    expect(toShopifyUserMessage(undefined, '401 Unauthorized invalid api key')).toContain(
      'accesso a Shopify',
    );
  });

  it('propaga messaggi Shopify GraphQL e SKU duplicati', () => {
    const graphql = 'Shopify GraphQL error: field not found';
    expect(toShopifyUserMessage(undefined, graphql)).toBe(graphql);
    expect(toShopifyUserMessage(undefined, 'unique constraint failed on sku')).toContain('SKU');
  });

  it('fallback generico per messaggio vuoto o troppo lungo', () => {
    expect(toShopifyUserMessage(undefined, '')).toContain('problema con Shopify');
    expect(toShopifyUserMessage(undefined, 'x'.repeat(600))).toContain('problema con Shopify');
    expect(toShopifyUserMessage(undefined, 'Errore breve custom')).toBe('Errore breve custom');
  });
});
