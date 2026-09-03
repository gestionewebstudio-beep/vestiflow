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
  shopifyHasPublicationsScopes,
  shopifyMissingPublicationsScopes,
  shopifyPublicationsScopeError,
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

  /*
    Canali di vendita (Tranche 2A). ⛔ Il caso che conta è il negozio GIÀ
    COLLEGATO: il suo token è stato emesso prima che questi ambiti esistessero,
    e deve risultare «da riautorizzare» invece di fallire alla prima chiamata.
  */
  describe('ambiti publication', () => {
    const CONCESSI_VECCHI = ['read_products', 'write_products', 'read_inventory'];
    const RICHIESTI_OGGI = [...CONCESSI_VECCHI, 'read_publications', 'write_publications'];

    it('negozio già collegato: mancano entrambi → da RIAUTORIZZARE', () => {
      const d = buildShopifyScopeDiagnostics(RICHIESTI_OGGI, CONCESSI_VECCHI);

      expect(d.missingForPublications).toEqual(['read_publications', 'write_publications']);
      // `not_granted` = il server li chiede, il token no: si riconnette il negozio.
      expect(d.publicationsBlockedReason).toBe('not_granted');
      expect(shopifyPublicationsScopeError(CONCESSI_VECCHI)).toContain('riconnetti');
    });

    it('server che non li richiede: la correzione è sulla configurazione', () => {
      const d = buildShopifyScopeDiagnostics(CONCESSI_VECCHI, CONCESSI_VECCHI);
      expect(d.publicationsBlockedReason).toBe('not_requested');
    });

    it('token completo: nessun blocco e nessun messaggio', () => {
      const d = buildShopifyScopeDiagnostics(RICHIESTI_OGGI, RICHIESTI_OGGI);
      expect(d.missingForPublications).toEqual([]);
      expect(d.publicationsBlockedReason).toBe('none');
      expect(shopifyPublicationsScopeError(RICHIESTI_OGGI)).toBeNull();
    });

    it('mancante uno solo dei due: resta bloccato, e lo nomina', () => {
      const parziale = [...CONCESSI_VECCHI, 'read_publications'];
      expect(shopifyMissingPublicationsScopes(parziale)).toEqual(['write_publications']);
      expect(shopifyHasPublicationsScopes(parziale)).toBe(false);
      expect(shopifyPublicationsScopeError(parziale)).toContain('write_publications');
    });
  });

  it('shopifyHasProductReadScope', () => {
    expect(shopifyHasProductReadScope(['read_products'])).toBe(true);
    expect(shopifyHasProductReadScope(['write_products'])).toBe(false);
  });
});
