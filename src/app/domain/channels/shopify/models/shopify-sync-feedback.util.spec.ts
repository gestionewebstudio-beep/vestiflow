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

    it('warning se prodotti remoti ma nessuna modifica e nessun saltato', () => {
      // ⛔ **Qui `skipped` valeva 5**, e il messaggio atteso era quello generico
      //    «nessuna modifica»: con cinque prodotti saltati da una regola, quel
      //    messaggio manda a controllare i filtri per una causa che è un'altra.
      //    Superato il 09/09/2026: il caso «solo saltati» ha il suo messaggio,
      //    ed è la prova qui sotto.
      const feedback = formatShopifyProductsSyncFeedback({
        synced: true,
        imported: 0,
        updated: 0,
        skipped: 0,
        remoteProductCount: 5,
        failed: [],
      });
      expect(feedback.tone).toBe('warning');
      expect(feedback.message).toContain('nessuna modifica');
    });

    it('⛔ tutti FALLITI non è un successo, e non dice «importato»', () => {
      const feedback = formatShopifyProductsSyncFeedback({
        synced: true,
        imported: 0,
        updated: 0,
        skipped: 0,
        remoteProductCount: 3,
        failed: [
          { shopifyProductId: '1', message: 'canale non raggiungibile' },
          { shopifyProductId: '2', message: 'canale non raggiungibile' },
          { shopifyProductId: '3', message: 'canale non raggiungibile' },
        ],
      });
      expect(feedback.tone).toBe('warning');
      expect(feedback.message).toContain('Import non riuscito');
      expect(feedback.message).toContain('nessuno dei 3 prodotti è entrato');
      // ⛔ La parola che rendeva il messaggio falso.
      expect(feedback.message).not.toContain('sincronizzato');
    });

    it('⭐ solo SALTATI: non sono errori, e il messaggio non li chiama tali', () => {
      const feedback = formatShopifyProductsSyncFeedback({
        synced: true,
        imported: 0,
        updated: 0,
        skipped: 5,
        remoteProductCount: 5,
        failed: [],
      });
      expect(feedback.tone).toBe('warning');
      expect(feedback.message).toContain('5 su 5 sono stati saltati');
      expect(feedback.message).toContain('Non sono errori');
      expect(feedback.message).not.toContain('errori:');
    });

    it('⭐ lotto MISTO: successi, errori e saltati sono tutti rappresentati', () => {
      const feedback = formatShopifyProductsSyncFeedback({
        synced: true,
        imported: 4,
        updated: 2,
        skipped: 3,
        remoteProductCount: 10,
        failed: [{ shopifyProductId: '9', message: 'SKU duplicato' }],
      });
      expect(feedback.tone).toBe('warning');
      expect(feedback.message).toContain('4 nuovi');
      expect(feedback.message).toContain('2 aggiornati');
      expect(feedback.message).toContain('1 falliti');
      expect(feedback.message).toContain('3 prodotti sono stati saltati');
      expect(feedback.message).toContain('SKU duplicato');
    });

    it('⭐ successo CON saltati: il tono avvisa, e il numero si vede', () => {
      // ⛔ Era il caso peggiore: 50 importati e 50 saltati davano un messaggio
      //    di successo che non nominava i saltati.
      const feedback = formatShopifyProductsSyncFeedback({
        synced: true,
        imported: 50,
        updated: 0,
        skipped: 50,
        remoteProductCount: 100,
        failed: [],
      });
      expect(feedback.tone).toBe('warning');
      expect(feedback.message).toContain('50 prodotti sono stati saltati');
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

    // L'esito nomina la direzione e non promette giacenze entrate: questa
    // operazione legge Shopify e semmai corregge Shopify. `imported` non
    // compare piu' perche' vale sempre zero (registro difetti 1.2).
    it('successo con disallineamenti: dichiara la direzione e non conta «nuove»', () => {
      const feedback = formatShopifyInventorySyncFeedback({
        ...inventoryBase,
        imported: 2,
        updated: 3,
        unchanged: 1,
        remoteLevelCount: 6,
      });
      expect(feedback.tone).toBe('success');
      expect(feedback.message).toContain('3 disallineate');
      expect(feedback.message).toContain('Le giacenze di VestiFlow non cambiano');
      expect(feedback.message).not.toContain('nuove');
    });

    it('⭐ ripubblicate, rifiutate e fallite sono classi DISTINTE nel messaggio', () => {
      const feedback = formatShopifyInventorySyncFeedback({
        ...inventoryBase,
        imported: 0,
        updated: 3,
        unchanged: 1,
        remoteLevelCount: 4,
        republishedLevels: 1,
        refusedLevels: 1,
        failedLevels: 1,
        pendingMismatches: 2,
      });
      expect(feedback.tone).toBe('warning');
      expect(feedback.message).toContain('Ripubblicata su Shopify 1 giacenza');
      expect(feedback.message).toContain('collegamento con Shopify non è utilizzabile');
      expect(feedback.message).toContain('errore del canale');
      expect(feedback.message).toContain('2 restano disallineate');
    });

    it('⛔ con soli RIFIUTI non si propone di riprovare: ritentare non risolve', () => {
      const feedback = formatShopifyInventorySyncFeedback({
        ...inventoryBase,
        imported: 0,
        updated: 1,
        unchanged: 0,
        remoteLevelCount: 1,
        republishedLevels: 0,
        refusedLevels: 1,
        failedLevels: 0,
        pendingMismatches: 1,
      });
      expect(feedback.message).toContain('non è utilizzabile');
      expect(feedback.message).not.toContain('Riprova');
    });

    it('⭐ un invio NON effettuato non compare come ripubblicato', () => {
      // La passata ha tentato una riga e non ha mandato niente: il messaggio
      // non deve dire che una giacenza è stata ripubblicata.
      const feedback = formatShopifyInventorySyncFeedback({
        ...inventoryBase,
        imported: 0,
        updated: 1,
        unchanged: 0,
        remoteLevelCount: 1,
        republishedLevels: 0,
        refusedLevels: 0,
        failedLevels: 0,
        pendingMismatches: 1,
      });
      expect(feedback.message).not.toContain('Ripubblicat');
      expect(feedback.message).toContain('1 resta disallineata');
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
