import { describe, expect, it } from 'vitest';

import { CatalogOrigin } from '@core/models/catalog-origin.model';
import type { Product } from '@core/models/product.model';
import { ShopifySyncStatus } from '@core/models/shopify.model';

import { isShopifyCatalogProduct, isShopifyLinkedProduct } from './catalog-origin.util';

/**
 * ⭐ Origine e collegamento sono DUE assi, e l'eliminazione si ferma su
 *    entrambi per ragioni diverse (docs/24 §11.1, §3.1). Queste prove tengono
 *    separati i due predicati: confonderli farebbe passare un prodotto
 *    collegato solo perche' e' nato in VestiFlow.
 */
describe('catalog-origin.util — origine e collegamento', () => {
  const prodotto = (patch: Partial<Product>): Product =>
    ({
      id: 'prod-1',
      catalogOrigin: CatalogOrigin.VestiFlow,
      ...patch,
    }) as Product;

  describe('isShopifyLinkedProduct', () => {
    it('riconosce un prodotto con un id Shopify', () => {
      const p = prodotto({
        shopify: { status: ShopifySyncStatus.Synced, shopifyId: 'gid://shopify/Product/1' },
      });

      expect(isShopifyLinkedProduct(p)).toBe(true);
    });

    it('un prodotto senza blocco shopify non e’ collegato', () => {
      expect(isShopifyLinkedProduct(prodotto({}))).toBe(false);
    });

    it('⛔ uno stato di sync SENZA id non basta a dirlo collegato', () => {
      // Un prodotto puo' avere uno stato di sync (es. mai sincronizzato) senza
      // avere un id remoto: li' non c'e' nulla da cui staccarlo.
      const p = prodotto({ shopify: { status: ShopifySyncStatus.NotConnected } });

      expect(isShopifyLinkedProduct(p)).toBe(false);
    });
  });

  describe('i due assi non si confondono', () => {
    it('nato in VestiFlow e collegato: origine vestiflow, ma COLLEGATO', () => {
      const p = prodotto({
        catalogOrigin: CatalogOrigin.VestiFlow,
        shopify: { status: ShopifySyncStatus.Synced, shopifyId: 'gid://shopify/Product/1' },
      });

      // ⚠️ Il caso che la sola guardia sull'origine lascerebbe passare.
      expect(isShopifyCatalogProduct(p)).toBe(false);
      expect(isShopifyLinkedProduct(p)).toBe(true);
    });

    it('importato da Shopify e collegato: entrambi veri', () => {
      const p = prodotto({
        catalogOrigin: CatalogOrigin.Shopify,
        shopify: { status: ShopifySyncStatus.Synced, shopifyId: 'gid://shopify/Product/2' },
      });

      expect(isShopifyCatalogProduct(p)).toBe(true);
      expect(isShopifyLinkedProduct(p)).toBe(true);
    });
  });
});
