import { describe, expect, it } from 'vitest';

import {
  formatShopifyCustomersSyncFeedback,
  formatShopifyInventorySyncFeedback,
  formatShopifyOrdersSyncFeedback,
  formatShopifyProductsSyncFeedback,
} from './shopify-sync-feedback.util';

describe('shopify-sync-feedback.util', () => {
  describe('formatShopifyProductsSyncFeedback', () => {
    it('successo con import e update', () => {
      const feedback = formatShopifyProductsSyncFeedback({
        synced: true,
        imported: 3,
        updated: 2,
        skipped: 0,
        remoteProductCount: 10,
        failed: [],
      });
      expect(feedback.tone).toBe('success');
      expect(feedback.message).toContain('3 nuovi');
    });

    it('warning con errori parziali', () => {
      const feedback = formatShopifyProductsSyncFeedback({
        synced: true,
        imported: 1,
        updated: 0,
        skipped: 0,
        remoteProductCount: 5,
        failed: [{ shopifyProductId: '1', message: 'SKU duplicato' }],
      });
      expect(feedback.tone).toBe('warning');
      expect(feedback.message).toContain('SKU duplicato');
    });

    it('warning se catalogo remoto vuoto', () => {
      const feedback = formatShopifyProductsSyncFeedback({
        synced: true,
        imported: 0,
        updated: 0,
        skipped: 0,
        remoteProductCount: 0,
        failed: [],
      });
      expect(feedback.tone).toBe('warning');
      expect(feedback.message).toContain('Nessun prodotto');
    });

    it('warning se prodotti remoti ma nessuna modifica', () => {
      const feedback = formatShopifyProductsSyncFeedback({
        synced: true,
        imported: 0,
        updated: 0,
        skipped: 5,
        remoteProductCount: 5,
        failed: [],
      });
      expect(feedback.tone).toBe('warning');
      expect(feedback.message).toContain('nessuna modifica');
    });
  });

  describe('formatShopifyInventorySyncFeedback', () => {
    const inventoryBase = {
      synced: true as const,
      skipped: 0,
      linkedVariantCount: 10,
      linkedLocationCount: 2,
    };

    it('warning se nessun livello remoto', () => {
      const feedback = formatShopifyInventorySyncFeedback({
        ...inventoryBase,
        imported: 0,
        updated: 0,
        unchanged: 0,
        remoteLevelCount: 0,
      });
      expect(feedback.tone).toBe('warning');
    });

    it('successo se gia allineato', () => {
      const feedback = formatShopifyInventorySyncFeedback({
        ...inventoryBase,
        imported: 0,
        updated: 0,
        unchanged: 12,
        remoteLevelCount: 12,
      });
      expect(feedback.tone).toBe('success');
      expect(feedback.message).toContain('allineate');
    });

    it('successo con modifiche', () => {
      const feedback = formatShopifyInventorySyncFeedback({
        ...inventoryBase,
        imported: 2,
        updated: 3,
        unchanged: 1,
        remoteLevelCount: 6,
      });
      expect(feedback.tone).toBe('success');
      expect(feedback.message).toContain('2 nuove');
    });
  });

  describe('formatShopifyCustomersSyncFeedback', () => {
    it('warning con errori', () => {
      const feedback = formatShopifyCustomersSyncFeedback({
        synced: true,
        imported: 0,
        updated: 1,
        skipped: 0,
        remoteCustomerCount: 5,
        failed: [{ shopifyCustomerId: '1', message: 'Email invalida' }],
      });
      expect(feedback.tone).toBe('warning');
    });

    it('successo allineato', () => {
      const feedback = formatShopifyCustomersSyncFeedback({
        synced: true,
        imported: 0,
        updated: 0,
        skipped: 0,
        remoteCustomerCount: 8,
        failed: [],
      });
      expect(feedback.tone).toBe('success');
    });
  });

  describe('formatShopifyOrdersSyncFeedback', () => {
    it('warning catalogo ordini vuoto', () => {
      const feedback = formatShopifyOrdersSyncFeedback({
        synced: true,
        imported: 0,
        updated: 0,
        skipped: 0,
        remoteOrderCount: 0,
        failed: [],
      });
      expect(feedback.tone).toBe('warning');
      expect(feedback.message).toContain('Nessun ordine');
    });

    it('successo con nuove vendite', () => {
      const feedback = formatShopifyOrdersSyncFeedback({
        synced: true,
        imported: 4,
        updated: 1,
        skipped: 0,
        remoteOrderCount: 20,
        failed: [],
      });
      expect(feedback.tone).toBe('success');
      expect(feedback.message).toContain('4 nuove');
    });
  });
});
