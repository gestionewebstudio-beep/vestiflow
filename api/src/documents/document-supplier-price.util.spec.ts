import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  applySupplierPriceUpdates,
  findSupplierPriceDiffs,
} from './document-supplier-price.util';

function createTxMock() {
  return {
    supplierVariantLink: {
      // Le righe vengono lette in blocco (una query per documento, non per riga).
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn(),
    },
    productVariant: {
      updateMany: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    product: {
      updateMany: vi.fn(),
    },
  };
}

describe('document-supplier-price.util', () => {
  let tx: ReturnType<typeof createTxMock>;

  beforeEach(() => {
    tx = createTxMock();
  });

  describe('findSupplierPriceDiffs', () => {
    it('ritorna array vuoto senza fornitore', async () => {
      await expect(
        findSupplierPriceDiffs(tx as never, 'tenant-1', null, [
          {
            variantId: 'var-1',
            unitPriceMinor: new Prisma.Decimal(1000),
            loadsStock: true,
            quantity: 1,
          },
        ]),
      ).resolves.toEqual([]);
    });

    it('segnala diff quando il prezzo differisce dal link fornitore', async () => {
      tx.supplierVariantLink.findMany.mockResolvedValue([
        { variantId: 'var-1', lastPurchasePriceMinor: 800 },
      ]);

      await expect(
        findSupplierPriceDiffs(tx as never, 'tenant-1', 'sup-1', [
          {
            variantId: 'var-1',
            unitPriceMinor: new Prisma.Decimal(1000),
            loadsStock: true,
            quantity: 2,
          },
        ]),
      ).resolves.toEqual([
        { variantId: 'var-1', previousMinor: 800, nextMinor: 1000 },
      ]);
    });

    it('ignora righe senza carico magazzino o senza variante', async () => {
      await expect(
        findSupplierPriceDiffs(tx as never, 'tenant-1', 'sup-1', [
          {
            variantId: null,
            unitPriceMinor: new Prisma.Decimal(1000),
            loadsStock: true,
            quantity: 1,
          },
          {
            variantId: 'var-2',
            unitPriceMinor: new Prisma.Decimal(500),
            loadsStock: false,
            quantity: 1,
          },
        ]),
      ).resolves.toEqual([]);
      expect(tx.supplierVariantLink.findMany).not.toHaveBeenCalled();
    });
  });

  describe('applySupplierPriceUpdates', () => {
    it('aggiorna sempre il costo effettivo della variante e il link fornitore', async () => {
      await applySupplierPriceUpdates(
        tx as never,
        'tenant-1',
        'sup-1',
        [
          {
            variantId: 'var-1',
            unitPriceMinor: new Prisma.Decimal(1200),
            loadsStock: true,
            quantity: 3,
          },
        ],
        false,
      );

      expect(tx.productVariant.updateMany).toHaveBeenCalledWith({
        where: { id: 'var-1', tenantId: 'tenant-1' },
        data: { purchasePriceMinor: 1200 },
      });
      expect(tx.supplierVariantLink.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId_supplierId_variantId: {
              tenantId: 'tenant-1',
              supplierId: 'sup-1',
              variantId: 'var-1',
            },
          },
          update: { lastPurchasePriceMinor: 1200 },
        }),
      );
      // Spunta off: il costo di riferimento dell'articolo non viene toccato.
      expect(tx.product.updateMany).not.toHaveBeenCalled();
    });

    it('senza fornitore aggiorna solo il costo variante, non il link', async () => {
      await applySupplierPriceUpdates(
        tx as never,
        'tenant-1',
        null,
        [
          {
            variantId: 'var-1',
            unitPriceMinor: new Prisma.Decimal(900),
            loadsStock: true,
            quantity: 1,
          },
        ],
        false,
      );

      expect(tx.productVariant.updateMany).toHaveBeenCalledWith({
        where: { id: 'var-1', tenantId: 'tenant-1' },
        data: { purchasePriceMinor: 900 },
      });
      expect(tx.supplierVariantLink.upsert).not.toHaveBeenCalled();
      expect(tx.product.updateMany).not.toHaveBeenCalled();
    });

    it('propaga il costo di riferimento articolo quando la spunta è on', async () => {
      tx.productVariant.findMany.mockResolvedValue([{ id: 'var-1', productId: 'prod-1' }]);

      await applySupplierPriceUpdates(
        tx as never,
        'tenant-1',
        'sup-1',
        [
          {
            variantId: 'var-1',
            unitPriceMinor: new Prisma.Decimal(1500),
            loadsStock: true,
            quantity: 2,
          },
        ],
        true,
      );

      expect(tx.product.updateMany).toHaveBeenCalledWith({
        where: { id: 'prod-1', tenantId: 'tenant-1' },
        data: { purchasePriceMinor: 1500 },
      });
    });

    it('ignora righe senza carico magazzino o senza variante', async () => {
      await applySupplierPriceUpdates(
        tx as never,
        'tenant-1',
        'sup-1',
        [
          {
            variantId: null,
            unitPriceMinor: new Prisma.Decimal(1000),
            loadsStock: true,
            quantity: 1,
          },
          {
            variantId: 'var-2',
            unitPriceMinor: new Prisma.Decimal(500),
            loadsStock: false,
            quantity: 1,
          },
        ],
        true,
      );

      expect(tx.productVariant.updateMany).not.toHaveBeenCalled();
      expect(tx.supplierVariantLink.upsert).not.toHaveBeenCalled();
      expect(tx.product.updateMany).not.toHaveBeenCalled();
    });
  });
});
