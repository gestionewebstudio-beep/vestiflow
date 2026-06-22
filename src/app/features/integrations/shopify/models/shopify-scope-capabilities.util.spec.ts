import { describe, expect, it } from 'vitest';

import type { ShopifyScopeDiagnostics } from '@core/models/shopify-connection.model';

import {
  shopifyProductReadScopeWarning,
  shopifyScopeDiagnosticsDetail,
} from './shopify-scope-capabilities.util';

describe('shopify-scope-capabilities.util', () => {
  describe('shopifyProductReadScopeWarning', () => {
    it('ritorna null se diagnostica assente o nessun blocco', () => {
      expect(shopifyProductReadScopeWarning(undefined)).toBeNull();
      expect(
        shopifyProductReadScopeWarning({
          requested: ['read_products'],
          granted: ['read_products'],
          missingFromGrant: [],
          missingForCatalogImport: [],
          catalogImportBlockedReason: 'none',
        }),
      ).toBeNull();
    });

    it('avvisa se read_products non richiesto dal server', () => {
      const msg = shopifyProductReadScopeWarning({
        requested: ['write_products'],
        granted: ['write_products'],
        missingFromGrant: ['read_products'],
        missingForCatalogImport: ['read_products'],
        catalogImportBlockedReason: 'not_requested',
      });
      expect(msg).toContain('SHOPIFY_SCOPES');
    });

    it('avvisa se scope non concesso da Shopify', () => {
      const msg = shopifyProductReadScopeWarning({
        requested: ['read_products'],
        granted: [],
        missingFromGrant: ['read_products'],
        missingForCatalogImport: ['read_products'],
        catalogImportBlockedReason: 'not_granted',
      });
      expect(msg).toContain('mancano: read_products');
    });
  });

  describe('shopifyScopeDiagnosticsDetail', () => {
    it('ritorna null se nessun blocco catalogo', () => {
      expect(shopifyScopeDiagnosticsDetail(undefined)).toBeNull();
    });

    it('elenca ambiti richiesti, concessi e mancanti', () => {
      const diagnostics: ShopifyScopeDiagnostics = {
        requested: ['read_products', 'read_inventory'],
        granted: ['read_inventory'],
        missingFromGrant: ['read_products'],
        missingForCatalogImport: ['read_products'],
        catalogImportBlockedReason: 'not_granted',
      };
      const detail = shopifyScopeDiagnosticsDetail(diagnostics);
      expect(detail).toContain('Ambiti richiesti dal server');
      expect(detail).toContain('read_products');
      expect(detail).toContain('read_inventory');
    });
  });
});
