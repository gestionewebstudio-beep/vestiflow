import { StockMovementType } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  currentVariantCostMap,
  frozenTotalCostMinor,
  originalSaleUnitCostMinor,
} from './movement-cost.util';

function createTxMock() {
  return {
    productVariant: { findMany: vi.fn().mockResolvedValue([]) },
    stockMovement: { findFirst: vi.fn().mockResolvedValue(null) },
  };
}

describe('movement-cost.util', () => {
  let tx: ReturnType<typeof createTxMock>;

  beforeEach(() => {
    tx = createTxMock();
  });

  describe('currentVariantCostMap', () => {
    it('ritorna mappa vuota senza id (nessuna query)', async () => {
      const map = await currentVariantCostMap(tx as never, 'tenant-1', []);
      expect(map.size).toBe(0);
      expect(tx.productVariant.findMany).not.toHaveBeenCalled();
    });

    it('mappa il costo corrente per variante (una query, id deduplicati)', async () => {
      tx.productVariant.findMany.mockResolvedValue([
        { id: 'var-1', purchasePriceMinor: 1200 },
        { id: 'var-2', purchasePriceMinor: null },
      ]);

      const map = await currentVariantCostMap(tx as never, 'tenant-1', ['var-1', 'var-2', 'var-1']);

      expect(tx.productVariant.findMany).toHaveBeenCalledTimes(1);
      expect(tx.productVariant.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', id: { in: ['var-1', 'var-2'] } },
        select: { id: true, purchasePriceMinor: true },
      });
      expect(map.get('var-1')).toBe(1200);
      expect(map.get('var-2')).toBeNull();
    });
  });

  describe('frozenTotalCostMinor', () => {
    it('null se il costo unitario manca', () => {
      expect(frozenTotalCostMinor(null, 5)).toBeNull();
    });

    it('unitario × quantità', () => {
      expect(frozenTotalCostMinor(1200, 3)).toBe(3600);
    });
  });

  describe('originalSaleUnitCostMinor', () => {
    it('ricade sul fallback senza vendita originale collegata', async () => {
      const cost = await originalSaleUnitCostMinor(
        tx as never,
        'tenant-1',
        null,
        'var-1',
        [StockMovementType.sale],
        999,
      );
      expect(cost).toBe(999);
      expect(tx.stockMovement.findFirst).not.toHaveBeenCalled();
    });

    it('usa il costo congelato della vendita originale', async () => {
      tx.stockMovement.findFirst.mockResolvedValue({ unitCostMinor: 1000 });

      const cost = await originalSaleUnitCostMinor(
        tx as never,
        'tenant-1',
        'sale-doc-1',
        'var-1',
        [StockMovementType.sale],
        999,
      );

      expect(cost).toBe(1000);
      expect(tx.stockMovement.findFirst).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-1',
          sourceDocumentId: 'sale-doc-1',
          variantId: 'var-1',
          type: { in: [StockMovementType.sale] },
        },
        select: { unitCostMinor: true },
      });
    });

    it('ricade sul fallback se la vendita originale non porta il costo (storico)', async () => {
      tx.stockMovement.findFirst.mockResolvedValue({ unitCostMinor: null });

      const cost = await originalSaleUnitCostMinor(
        tx as never,
        'tenant-1',
        'sale-doc-1',
        'var-1',
        [StockMovementType.online_sale],
        750,
      );

      expect(cost).toBe(750);
    });

    it('ricade sul fallback se la vendita originale non è trovata', async () => {
      tx.stockMovement.findFirst.mockResolvedValue(null);

      const cost = await originalSaleUnitCostMinor(
        tx as never,
        'tenant-1',
        'sale-doc-1',
        'var-1',
        [StockMovementType.sale],
        640,
      );

      expect(cost).toBe(640);
    });
  });
});
