import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { applySupplierPriceUpdates, findSupplierPriceDiffs } from './document-supplier-price.util';

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
      ).resolves.toEqual([{ variantId: 'var-1', previousMinor: 800, nextMinor: 1000 }]);
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

  /**
   * ⛔ **Riscritto il 19/08/2026** con la correzione della spunta (`03b`). Prima
   * questi test asserivano che il costo della variante si scrivesse **sempre** e
   * che la spunta governasse `Product.purchasePriceMinor`: era il difetto, non il
   * contratto.
   */
  describe('applySupplierPriceUpdates', () => {
    const riga = (variantId: string, costo: number) => ({
      variantId,
      unitPriceMinor: new Prisma.Decimal(costo),
      loadsStock: true,
      quantity: 1,
    });

    it('senza spunta NON tocca il costo della variante, ma aggiorna il link fornitore', async () => {
      await applySupplierPriceUpdates(
        tx as never,
        'tenant-1',
        'sup-1',
        [riga('var-1', 1200)],
        false,
      );

      // Il cuore della correzione: chi toglie la spunta registra un costo solo
      // documentale, e il costo effettivo della variante resta quello che era.
      expect(tx.productVariant.updateMany).not.toHaveBeenCalled();
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
    });

    it('senza spunta e senza fornitore non scrive nulla', async () => {
      await applySupplierPriceUpdates(tx as never, 'tenant-1', null, [riga('var-1', 900)], false);

      expect(tx.productVariant.updateMany).not.toHaveBeenCalled();
      expect(tx.supplierVariantLink.upsert).not.toHaveBeenCalled();
    });

    it('con la spunta scrive il costo sulla VARIANTE, filtrando per tenant', async () => {
      await applySupplierPriceUpdates(
        tx as never,
        'tenant-1',
        'sup-1',
        [riga('var-1', 1500)],
        true,
      );

      expect(tx.productVariant.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['var-1'] }, tenantId: 'tenant-1' },
        data: { purchasePriceMinor: 1500 },
      });
    });

    it('con la spunta governa ogni riga SINGOLARMENTE, anche fra varianti dello stesso articolo', async () => {
      await applySupplierPriceUpdates(
        tx as never,
        'tenant-1',
        'sup-1',
        [riga('var-S', 1800), riga('var-M', 2200)],
        true,
      );

      // Due costi diversi ⇒ due scritture, ognuna sulla propria variante.
      // ⛔ Nessun «ultimo che vince»: richiamare tre taglie significa richiamare
      // tre righe, e ognuna porta il costo che l'operatore ha digitato.
      expect(tx.productVariant.updateMany).toHaveBeenCalledTimes(2);
      expect(tx.productVariant.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['var-S'] }, tenantId: 'tenant-1' },
        data: { purchasePriceMinor: 1800 },
      });
      expect(tx.productVariant.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['var-M'] }, tenantId: 'tenant-1' },
        data: { purchasePriceMinor: 2200 },
      });
    });

    it('con la spunta accorpa in UNA scrittura le righe allo stesso costo', async () => {
      await applySupplierPriceUpdates(
        tx as never,
        'tenant-1',
        'sup-1',
        [riga('var-S', 1800), riga('var-M', 1800), riga('var-L', 1800)],
        true,
      );

      // È il guadagno della fetta: tre righe, una scrittura. Il raggruppamento è
      // per COSTO, quindi nessuna variante perde il proprio valore.
      expect(tx.productVariant.updateMany).toHaveBeenCalledTimes(1);
      expect(tx.productVariant.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['var-S', 'var-M', 'var-L'] }, tenantId: 'tenant-1' },
        data: { purchasePriceMinor: 1800 },
      });
    });

    it('non scrive MAI su Product.purchasePriceMinor, con o senza spunta', async () => {
      // Guardia della decisione del 19/08/2026: `Product.purchasePriceMinor` è il
      // seed di NASCITA di una variante, non un costo che i carichi aggiornano.
      for (const spunta of [true, false]) {
        tx = createTxMock();
        await applySupplierPriceUpdates(
          tx as never,
          'tenant-1',
          'sup-1',
          [riga('var-1', 1000)],
          spunta,
        );
        expect(tx.product.updateMany).not.toHaveBeenCalled();
        expect(tx.productVariant.findMany).not.toHaveBeenCalled();
      }
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
          { ...riga('var-2', 500), loadsStock: false },
        ],
        true,
      );

      expect(tx.productVariant.updateMany).not.toHaveBeenCalled();
      expect(tx.supplierVariantLink.upsert).not.toHaveBeenCalled();
      expect(tx.product.updateMany).not.toHaveBeenCalled();
    });
  });
});
