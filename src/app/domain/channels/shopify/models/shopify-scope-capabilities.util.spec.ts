import { describe, expect, it } from 'vitest';

// ⛔ Il caso che conta è il negozio GIÀ COLLEGATO (Tranche 2A): il suo token non
//    contiene gli ambiti dei canali, e la UI deve dire «riautorizza» invece di
//    lasciare fallire la prima pubblicazione.

import type { ShopifyScopeDiagnostics } from '@core/models/shopify-connection.model';

import {
  shopifyProductReadScopeWarning,
  shopifyPublicationsScopeWarning,
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
          missingForPublications: [],
          publicationsBlockedReason: 'none',
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
        missingForPublications: ['read_publications', 'write_publications'],
        publicationsBlockedReason: 'not_requested',
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
        missingForPublications: ['read_publications', 'write_publications'],
        publicationsBlockedReason: 'not_granted',
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
        missingForPublications: ['read_publications', 'write_publications'],
        publicationsBlockedReason: 'not_granted',
      };
      const detail = shopifyScopeDiagnosticsDetail(diagnostics);
      expect(detail).toContain('Ambiti richiesti dal server');
      expect(detail).toContain('read_products');
      expect(detail).toContain('read_inventory');
    });
  });
});

describe('shopifyPublicationsScopeWarning', () => {
  it('token vecchio: dice di riautorizzare, e nomina gli ambiti mancanti', () => {
    const avviso = shopifyPublicationsScopeWarning({
      requested: ['read_publications', 'write_publications'],
      granted: [],
      missingFromGrant: ['read_publications', 'write_publications'],
      missingForCatalogImport: [],
      catalogImportBlockedReason: 'none',
      missingForPublications: ['read_publications', 'write_publications'],
      publicationsBlockedReason: 'not_granted',
    });

    expect(avviso).toContain('read_publications, write_publications');
    expect(avviso).toContain('riconnetti');
  });

  it('server che non li richiede: la correzione è sulla configurazione', () => {
    const avviso = shopifyPublicationsScopeWarning({
      requested: [],
      granted: [],
      missingFromGrant: [],
      missingForCatalogImport: [],
      catalogImportBlockedReason: 'none',
      missingForPublications: ['read_publications', 'write_publications'],
      publicationsBlockedReason: 'not_requested',
    });

    expect(avviso).toContain('SHOPIFY_SCOPES');
  });

  it('tutto a posto: nessun avviso', () => {
    expect(
      shopifyPublicationsScopeWarning({
        requested: [],
        granted: [],
        missingFromGrant: [],
        missingForCatalogImport: [],
        catalogImportBlockedReason: 'none',
        missingForPublications: [],
        publicationsBlockedReason: 'none',
      }),
    ).toBeNull();
  });

  it('diagnostica assente: nessun avviso', () => {
    expect(shopifyPublicationsScopeWarning(undefined)).toBeNull();
  });
});
