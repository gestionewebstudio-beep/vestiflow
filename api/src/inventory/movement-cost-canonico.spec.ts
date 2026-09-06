import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { StockMovementType } from '@prisma/client';

import {
  currentVariantCostMap,
  frozenTotalCostMinor,
  originalSaleUnitCostMinor,
} from './movement-cost.util';

/**
 * Il contratto del costo canonico dopo la migration
 * `20260823010000_costi_canonici_not_null`: un costo non è mai NULL, e zero è
 * un costo — non un'assenza.
 */
describe('costo canonico — zero è un costo, mai un vuoto', () => {
  it('una variante senza costo entra nella mappa come zero, non come null', async () => {
    const tx = {
      productVariant: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'var-1', purchasePriceMinor: new Prisma.Decimal(0) },
          { id: 'var-2', purchasePriceMinor: new Prisma.Decimal('84.4262') },
        ]),
      },
    };

    const map = await currentVariantCostMap(tx as never, 'tenant-1', ['var-1', 'var-2']);

    expect(map.get('var-1')).toBe(0);
    expect(map.get('var-2')).toBe(84.4262);
  });

  it('movimento a costo zero: unitario e totale valgono zero, entrambi presenti', () => {
    expect(frozenTotalCostMinor(0, 7)).toBe(0);
  });

  /**
   * ⭐ La coda decimale è la ragione per cui il costo unitario è `NUMERIC(16,6)`:
   * 1,03 € ivati al 22% valgono 84,4262 centesimi netti, e la fotografia sul
   * movimento deve conservarli.
   */
  it('movimento a costo reale: la fotografia resta precisa', () => {
    expect(frozenTotalCostMinor(new Prisma.Decimal('84.4262'), 1)).toBe(84);
    expect(frozenTotalCostMinor(new Prisma.Decimal('84.4262'), 3)).toBe(253);
    expect(frozenTotalCostMinor(new Prisma.Decimal('2049.1803'), 2)).toBe(4098);
  });

  describe('il reso eredita il costo della vendita originaria', () => {
    const reso = (unitCostMinor: number | null, fallback: number) =>
      originalSaleUnitCostMinor(
        {
          stockMovement: {
            findFirst: vi
              .fn()
              .mockResolvedValue(
                unitCostMinor === null
                  ? null
                  : { unitCostMinor: new Prisma.Decimal(unitCostMinor) },
              ),
          },
        } as never,
        'tenant-1',
        'vendita-1',
        'var-1',
        [StockMovementType.sale],
        fallback,
      );

    it('vendita a 25 → reso a 25', async () => {
      await expect(reso(2500, 999)).resolves.toBe(2500);
    });

    it('vendita a ZERO → reso a zero, non al costo corrente', async () => {
      await expect(reso(0, 999)).resolves.toBe(0);
    });

    it('vendita non trovata → fallback al costo corrente', async () => {
      await expect(reso(null, 999)).resolves.toBe(999);
    });
  });
});
