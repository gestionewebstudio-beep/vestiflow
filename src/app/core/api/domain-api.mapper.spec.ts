import { describe, expect, it } from 'vitest';

import { ProductStatus } from '@core/models/product.model';
import { VariantLifecycleStatus, type ProductVariant } from '@core/models/product-variant.model';
import { CatalogOrigin } from '@core/models/catalog-origin.model';
import { ShopifySyncStatus } from '@core/models/shopify.model';
import { StockMovementType, AdjustmentDirection } from '@core/models/stock-movement.model';

import {
  mapInventoryLevelApiRow,
  mapLocationApiRow,
  mapProductApiRow,
  mapProductVariantApiRow,
  mapStockMovementApiRow,
} from './domain-api.mapper';

describe('domain-api.mapper', () => {
  describe('mapProductApiRow', () => {
    it('rimuove HTML dalla descrizione e mappa tag', () => {
      const product = mapProductApiRow({
        id: 'prod-1',
        tenantId: 'tenant-1',
        name: 'Maglietta',
        description: '<p>Descrizione <strong>bold</strong></p>',
        tags: ['primavera', 'cotone'],
        status: ProductStatus.Active,
        options: [{ name: 'Taglia', values: ['M'] }],
        shopifySyncStatus: ShopifySyncStatus.NotConnected,
        catalogOrigin: CatalogOrigin.VestiFlow,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });

      expect(product.description).toBe('Descrizione bold');
      expect(product.tags).toEqual(['primavera', 'cotone']);
      expect(product.catalogOrigin).toBe('vestiflow');
      expect(product.shopify).toBeUndefined();
    });

    it('mappa link Shopify quando connesso', () => {
      const product = mapProductApiRow({
        id: 'prod-2',
        tenantId: 'tenant-1',
        name: 'Pantaloni',
        status: ProductStatus.Active,
        options: [],
        sellingPriceMinor: 4990,
        compareAtPriceMinor: 6990,
        purchasePriceMinor: 2000,
        shopifySyncStatus: ShopifySyncStatus.Synced,
        shopifyProductId: 'gid://shopify/Product/123',
        shopifyLastSyncAt: '2026-06-01T12:00:00.000Z',
        shopifyLastError: 'Errore precedente',
        catalogOrigin: CatalogOrigin.VestiFlow,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-06-01T12:00:00.000Z',
      });

      expect(product.shopify).toEqual({
        status: ShopifySyncStatus.Synced,
        shopifyId: 'gid://shopify/Product/123',
        lastSyncedAt: '2026-06-01T12:00:00.000Z',
        lastError: 'Errore precedente',
      });
      expect(product.catalogOrigin).toBe('vestiflow');
      // Prezzo/costo a livello articolo.
      expect(product.sellingPrice).toEqual({ amountMinor: 4990, currencyCode: 'EUR' });
      expect(product.compareAtPrice).toEqual({ amountMinor: 6990, currencyCode: 'EUR' });
      expect(product.purchasePrice).toEqual({ amountMinor: 2000, currencyCode: 'EUR' });
    });

    it('mappa catalogOrigin shopify quando presente', () => {
      const product = mapProductApiRow({
        id: 'prod-shopify',
        tenantId: 'tenant-1',
        name: 'Da Shopify',
        status: ProductStatus.Active,
        options: [],
        catalogOrigin: 'shopify',
        shopifySyncStatus: ShopifySyncStatus.Synced,
        shopifyProductId: 'gid://shopify/Product/999',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });

      expect(product.catalogOrigin).toBe('shopify');
    });

    it('parsa collezioni e metafields Shopify validi', () => {
      const product = mapProductApiRow({
        id: 'prod-3',
        tenantId: 'tenant-1',
        name: 'Giacca',
        status: ProductStatus.Draft,
        options: [],
        shopifySyncStatus: ShopifySyncStatus.NotConnected,
        catalogOrigin: CatalogOrigin.VestiFlow,
        shopifyCollections: [{ id: 'col-1', title: 'Nuovi arrivi' }],
        shopifyMetafields: [{ namespace: 'custom', key: 'material', value: 'lana' }],
        shopifyCategoryMetafields: [
          {
            attributeId: 'attr-1',
            attributeName: 'Materiale',
            namespace: 'shopify',
            key: 'material',
            metafieldType: 'single_line_text_field',
            values: [{ id: 'v1', name: 'Lana' }],
          },
        ],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });

      expect(product.shopifyCollections).toEqual([{ id: 'col-1', title: 'Nuovi arrivi' }]);
      expect(product.shopifyMetafields?.[0]?.key).toBe('material');
      expect(product.shopifyCategoryMetafields?.[0]?.attributeId).toBe('attr-1');
    });
  });

  describe('mapProductVariantApiRow', () => {
    /*
      Contratto di `lifecycleStatus` (docs/24 §3.3): OPZIONALE nella risposta
      HTTP — un server precedente alla Tranche 1A non lo manda — e sempre
      valorizzato nel modello applicativo, che il mapper produce.
    */
    it('⭐ risposta LEGACY senza lifecycleStatus: il mapper scrive `active`, esplicito', () => {
      const variant = mapProductVariantApiRow({
        id: 'var-legacy',
        tenantId: 'tenant-1',
        productId: 'prod-1',
        sku: 'SKU-VECCHIO',
        optionValues: [],
        currency: 'EUR',
        sellingPriceMinor: 1000,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });

      // Non `undefined`: il campo esiste e vale «attiva».
      expect(variant.lifecycleStatus).toBe(VariantLifecycleStatus.Active);
      expect(variant.deletedAt).toBeNull();
    });

    it('quando la risposta lo porta, il valore passa intatto', () => {
      const variant = mapProductVariantApiRow({
        id: 'var-ritirata',
        tenantId: 'tenant-1',
        productId: 'prod-1',
        sku: 'SKU-OFF',
        optionValues: [],
        currency: 'EUR',
        sellingPriceMinor: 1000,
        lifecycleStatus: VariantLifecycleStatus.Inactive,
        deletedAt: '2026-09-01T10:00:00.000Z',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });

      expect(variant.lifecycleStatus).toBe(VariantLifecycleStatus.Inactive);
      expect(variant.deletedAt).toBe('2026-09-01T10:00:00.000Z');
    });

    it('⛔ il MODELLO applicativo non accetta una variante senza stato', () => {
      // @ts-expect-error — `lifecycleStatus` è obbligatorio su ProductVariant:
      // se un giorno tornasse opzionale, questa riga smetterebbe di errare e il
      // test fallirebbe. È l'unico modo di provare un contratto di tipo.
      const senzaStato: ProductVariant = {
        id: 'var-1',
        productId: 'prod-1',
        sku: 'SKU-M',
        optionValues: [],
        sellingPrice: { amountMinor: 1000, currencyCode: 'EUR' },
      };

      expect(senzaStato.id).toBe('var-1');
    });

    it('mappa prezzi in Money con valuta', () => {
      const variant = mapProductVariantApiRow({
        id: 'var-1',
        tenantId: 'tenant-1',
        productId: 'prod-1',
        sku: 'SKU-M-RED',
        optionValues: [{ name: 'Taglia', value: 'M' }],
        currency: 'EUR',
        sellingPriceMinor: 2990,
        purchasePriceMinor: 1500,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });

      expect(variant.sellingPrice).toEqual({ amountMinor: 2990, currencyCode: 'EUR' });
      expect(variant.purchasePrice).toEqual({ amountMinor: 1500, currencyCode: 'EUR' });
    });

    it('omette prezzi opzionali null', () => {
      const variant = mapProductVariantApiRow({
        id: 'var-2',
        tenantId: 'tenant-1',
        productId: 'prod-1',
        sku: 'SKU-S',
        optionValues: [],
        currency: 'EUR',
        sellingPriceMinor: 1000,
        purchasePriceMinor: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });

      expect(variant.purchasePrice).toBeUndefined();
    });

    it('SKU NULL a DB (facoltativo) diventa stringa vuota nel dominio', () => {
      const variant = mapProductVariantApiRow({
        id: 'var-3',
        tenantId: 'tenant-1',
        productId: 'prod-1',
        sku: null,
        optionValues: [],
        currency: 'EUR',
        sellingPriceMinor: 1000,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });

      expect(variant.sku).toBe('');
    });
  });

  describe('mapLocationApiRow', () => {
    it('costruisce indirizzo quando presente', () => {
      const location = mapLocationApiRow({
        id: 'loc-1',
        tenantId: 'tenant-1',
        name: 'Magazzino Napoli',
        isActive: true,
        addressLine1: 'Via Roma 1',
        city: 'Napoli',
        postalCode: '80100',
        countryCode: 'IT',
        shopifySyncStatus: ShopifySyncStatus.NotConnected,
        licensedInVf: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });

      expect(location.address).toEqual({
        line1: 'Via Roma 1',
        line2: undefined,
        city: 'Napoli',
        province: undefined,
        postalCode: '80100',
        country: 'IT',
      });
    });

    it('omette indirizzo se assente', () => {
      const location = mapLocationApiRow({
        id: 'loc-2',
        tenantId: 'tenant-1',
        name: 'Deposito',
        isActive: true,
        shopifySyncStatus: ShopifySyncStatus.NotConnected,
        licensedInVf: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });

      expect(location.address).toBeUndefined();
    });
  });

  describe('mapInventoryLevelApiRow', () => {
    it('mappa tutti gli stati quantità', () => {
      const level = mapInventoryLevelApiRow({
        id: 'lvl-1',
        tenantId: 'tenant-1',
        variantId: 'var-1',
        locationId: 'loc-1',
        onHand: 10,
        available: 8,
        committed: 1,
        incoming: 2,
        reserved: 1,
        minThreshold: 3,
        updatedAt: '2026-06-01T00:00:00.000Z',
      });

      expect(level).toEqual({
        id: 'lvl-1',
        variantId: 'var-1',
        locationId: 'loc-1',
        onHand: 10,
        available: 8,
        committed: 1,
        incoming: 2,
        reserved: 1,
        minThreshold: 3,
      });
    });
  });

  describe('mapStockMovementApiRow', () => {
    it('normalizza createdBy e campi opzionali', () => {
      const movement = mapStockMovementApiRow({
        id: 'mov-1',
        tenantId: 'tenant-1',
        type: StockMovementType.Transfer,
        variantId: 'var-1',
        sku: 'SKU-1',
        locationId: 'loc-1',
        targetLocationId: 'loc-2',
        quantity: 5,
        direction: AdjustmentDirection.Decrease,
        reason: 'Trasferimento',
        createdAt: '2026-06-01T00:00:00.000Z',
        createdById: null,
        createdByName: 'Mario Rossi',
      });

      expect(movement.createdBy).toBe('system');
      expect(movement.targetLocationId).toBe('loc-2');
      expect(movement.reason).toBe('Trasferimento');
    });

    it('mappa origin quando presente', () => {
      const movement = mapStockMovementApiRow({
        id: 'mov-2',
        tenantId: 'tenant-1',
        type: StockMovementType.Sale,
        variantId: 'var-1',
        sku: 'SKU-1',
        locationId: 'loc-1',
        quantity: 1,
        createdAt: '2026-06-01T00:00:00.000Z',
        createdByName: 'Shopify',
        origin: 'shopify',
      });

      expect(movement.origin).toBe('shopify');
    });
  });
});
