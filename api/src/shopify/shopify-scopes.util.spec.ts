import { describe, expect, it } from 'vitest';

import {
  buildShopifyScopeDiagnostics,
  mergeShopifyScopes,
  parseShopifyScopesString,
  SHOPIFY_READ_PRODUCTS_SCOPE,
  shopifyCatalogImportBlockMessage,
  shopifyCustomersReadScopeError,
  shopifyHasProductReadScope,
  shopifyInventoryReadScopeError,
  shopifyOrdersReadScopeError,
} from './shopify-scopes.util';

describe('shopify-scopes.util', () => {
  describe('mergeShopifyScopes', () => {
    it('unisce scope da liste multiple deduplicando', () => {
      const merged = mergeShopifyScopes(['read_products', 'write_products'], undefined, [
        ' write_products ',
        'read_inventory',
      ]);
      expect(merged).toEqual(['read_products', 'write_products', 'read_inventory']);
    });
  });

  describe('parseShopifyScopesString', () => {
    it('splitta per virgola o spazio', () => {
      expect(parseShopifyScopesString('read_products, write_inventory read_orders')).toEqual([
        'read_products',
        'write_inventory',
        'read_orders',
      ]);
    });
  });

  describe('scope error messages', () => {
    it('shopifyInventoryReadScopeError distingue write-only inventory', () => {
      expect(shopifyInventoryReadScopeError(['read_inventory'])).toBeNull();
      expect(shopifyInventoryReadScopeError(['write_inventory'])).toContain('leggerle');
    });

    it('shopifyOrdersReadScopeError e shopifyCustomersReadScopeError', () => {
      expect(shopifyOrdersReadScopeError(['read_orders'])).toBeNull();
      expect(shopifyOrdersReadScopeError([])).toContain('ordini');

      expect(shopifyCustomersReadScopeError(['read_customers'])).toBeNull();
      expect(shopifyCustomersReadScopeError([])).toContain('clienti');
    });
  });

  describe('buildShopifyScopeDiagnostics', () => {
    it('segnala scope mancanti nel grant', () => {
      const diagnostics = buildShopifyScopeDiagnostics(
        ['read_products', 'read_inventory'],
        ['read_inventory'],
      );

      expect(diagnostics.missingFromGrant).toEqual(['read_products']);
      expect(diagnostics.missingForCatalogImport).toEqual([SHOPIFY_READ_PRODUCTS_SCOPE]);
      expect(diagnostics.catalogImportBlockedReason).toBe('not_granted');
    });

    it('catalogImportBlockedReason none se read_products concesso', () => {
      const diagnostics = buildShopifyScopeDiagnostics(
        ['read_products'],
        ['read_products', 'write_products'],
      );
      expect(diagnostics.catalogImportBlockedReason).toBe('none');
      expect(shopifyCatalogImportBlockMessage(diagnostics)).toBeNull();
    });

    it('shopifyCatalogImportBlockMessage per scope non richiesti lato server', () => {
      const diagnostics = buildShopifyScopeDiagnostics(['write_products'], ['write_products']);
      expect(diagnostics.catalogImportBlockedReason).toBe('not_requested');
      expect(shopifyCatalogImportBlockMessage(diagnostics)).toContain('SHOPIFY_SCOPES');
    });
  });

  it('shopifyHasProductReadScope', () => {
    expect(shopifyHasProductReadScope(['read_products'])).toBe(true);
    expect(shopifyHasProductReadScope(['write_products'])).toBe(false);
  });
});
