import { SupplierPriceUpdatePolicy } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  applySupplierPriceUpdates,
  findSupplierPriceDiffs,
} from './document-supplier-price.util';

function createTxMock() {
  return {
    supplierVariantLink: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    productVariant: {
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
            unitPriceMinor: 1000,
            loadsStock: true,
            quantity: 1,
          },
        ]),
      ).resolves.toEqual([]);
    });

    it('segnala diff quando il prezzo differisce dal link fornitore', async () => {
      tx.supplierVariantLink.findUnique.mockResolvedValue({ lastPurchasePriceMinor: 800 });

      await expect(
        findSupplierPriceDiffs(tx as never, 'tenant-1', 'sup-1', [
          {
            variantId: 'var-1',
            unitPriceMinor: 1000,
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
            unitPriceMinor: 1000,
            loadsStock: true,
            quantity: 1,
          },
          {
            variantId: 'var-2',
            unitPriceMinor: 500,
            loadsStock: false,
            quantity: 1,
          },
        ]),
      ).resolves.toEqual([]);
      expect(tx.supplierVariantLink.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('applySupplierPriceUpdates', () => {
    it('non aggiorna se applyUpdates è false', async () => {
      await applySupplierPriceUpdates(
        tx as never,
        'tenant-1',
        'sup-1',
        [
          {
            variantId: 'var-1',
            unitPriceMinor: 1000,
            loadsStock: true,
            quantity: 1,
          },
        ],
        SupplierPriceUpdatePolicy.always,
        false,
      );

      expect(tx.supplierVariantLink.upsert).not.toHaveBeenCalled();
    });

    it('aggiorna link fornitore e purchasePrice variante quando consentito', async () => {
      await applySupplierPriceUpdates(
        tx as never,
        'tenant-1',
        'sup-1',
        [
          {
            variantId: 'var-1',
            unitPriceMinor: 1200,
            loadsStock: true,
            quantity: 3,
          },
        ],
        SupplierPriceUpdatePolicy.always,
        true,
      );

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
      expect(tx.productVariant.updateMany).toHaveBeenCalledWith({
        where: { id: 'var-1', tenantId: 'tenant-1' },
        data: { purchasePriceMinor: 1200 },
      });
    });

    it('non aggiorna con policy never anche se applyUpdates è true', async () => {
      await applySupplierPriceUpdates(
        tx as never,
        'tenant-1',
        'sup-1',
        [
          {
            variantId: 'var-1',
            unitPriceMinor: 1200,
            loadsStock: true,
            quantity: 1,
          },
        ],
        SupplierPriceUpdatePolicy.never,
        true,
      );

      expect(tx.supplierVariantLink.upsert).not.toHaveBeenCalled();
    });
  });
});
