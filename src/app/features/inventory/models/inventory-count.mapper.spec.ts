import { describe, expect, it } from 'vitest';

import { InventoryCountStatus } from '@core/models/inventory-count.model';

import {
  inventoryCountLineDelta,
  mapInventoryCountLineApiRow,
  mapInventoryCountSessionApiRow,
} from './inventory-count.mapper';

describe('inventory-count.mapper', () => {
  describe('mapInventoryCountLineApiRow', () => {
    it('mappa riga inventario fisico', () => {
      const line = mapInventoryCountLineApiRow({
        id: 'line-1',
        variantId: 'var-1',
        sku: 'SKU-1',
        productName: 'Maglietta',
        systemQuantity: 10,
        countedQuantity: 8,
      });

      expect(line).toEqual({
        id: 'line-1',
        variantId: 'var-1',
        sku: 'SKU-1',
        productName: 'Maglietta',
        systemQuantity: 10,
        countedQuantity: 8,
      });
    });
  });

  describe('mapInventoryCountSessionApiRow', () => {
    it('mappa sessione con conteggi derivati dalle righe', () => {
      const session = mapInventoryCountSessionApiRow({
        id: 'sess-1',
        locationId: 'loc-1',
        name: 'Conteggio giugno',
        notes: null,
        status: InventoryCountStatus.Review,
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-02T00:00:00.000Z',
        completedAt: null,
        createdByName: 'Mario',
        location: { name: 'Magazzino' },
        lines: [
          {
            id: 'l1',
            variantId: 'v1',
            sku: 'A',
            productName: 'Prodotto A',
            systemQuantity: 5,
            countedQuantity: 5,
          },
          {
            id: 'l2',
            variantId: 'v2',
            sku: 'B',
            productName: 'Prodotto B',
            systemQuantity: 3,
            countedQuantity: 1,
          },
          {
            id: 'l3',
            variantId: 'v3',
            sku: 'C',
            productName: 'Prodotto C',
            systemQuantity: 2,
            countedQuantity: null,
          },
        ],
      });

      expect(session.status).toBe(InventoryCountStatus.Review);
      expect(session.locationName).toBe('Magazzino');
      expect(session.lineCount).toBe(3);
      expect(session.linesCounted).toBe(2);
      expect(session.linesWithDelta).toBe(1);
    });

    it('usa _count.lines se lines assente', () => {
      const session = mapInventoryCountSessionApiRow({
        id: 'sess-2',
        locationId: 'loc-1',
        name: 'Conteggio',
        notes: 'Note',
        status: 'unknown_status',
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
        completedAt: null,
        createdByName: 'Luigi',
        location: { name: 'Deposito' },
        _count: { lines: 42 },
        linesCounted: 10,
        linesWithDelta: 2,
      });

      expect(session.status).toBe(InventoryCountStatus.InProgress);
      expect(session.lineCount).toBe(42);
      expect(session.linesCounted).toBe(10);
    });
  });

  describe('inventoryCountLineDelta', () => {
    it('calcola delta quando countedQuantity e presente', () => {
      expect(
        inventoryCountLineDelta({
          id: 'l1',
          variantId: 'v1',
          sku: 'A',
          productName: 'A',
          systemQuantity: 10,
          countedQuantity: 7,
        }),
      ).toBe(-3);
    });

    it('ritorna null se non contato', () => {
      expect(
        inventoryCountLineDelta({
          id: 'l2',
          variantId: 'v2',
          sku: 'B',
          productName: 'B',
          systemQuantity: 5,
          countedQuantity: null,
        }),
      ).toBeNull();
    });
  });
});
