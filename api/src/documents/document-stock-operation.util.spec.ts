import { AdjustmentDirection, type DocumentLine } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import {
  reconcileDocumentStockAdjustment,
  reverseDocumentStockAdjustment,
} from './document-stock-adjustment.util';
import {
  applyDocumentStockManualUnloads,
  reconcileDocumentStockManualUnload,
} from './document-stock-manual-unload.util';

/** Riga documento di test: solo i campi letti da aggregateStockLines. */
function line(partial: {
  variantId: string;
  sku: string;
  quantity: number;
  loadsStock: boolean;
}): DocumentLine {
  return partial as unknown as DocumentLine;
}

describe('document-stock-manual-unload.util (scarico diretto senza movimenti)', () => {
  it('applyDocumentStockManualUnloads sottrae la giacenza aggregata SENZA creare StockMovement', async () => {
    const tx = {
      inventoryLevel: {
        upsert: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue({ onHand: 10, available: 10 }),
      },
      stockMovement: { create: vi.fn().mockResolvedValue({}) },
    };

    const result = await applyDocumentStockManualUnloads(tx as never, {
      tenantId: 't1',
      locationId: 'loc-1',
      lines: [
        line({ variantId: 'v1', sku: 'SKU-1', quantity: 2, loadsStock: true }),
        line({ variantId: 'v1', sku: 'SKU-1', quantity: 1, loadsStock: true }),
      ],
    });

    // Deroga prompt Scarico manuale: giacenza modificata direttamente,
    // NESSUNA riga nel log movimenti magazzino.
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
    expect(tx.inventoryLevel.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.inventoryLevel.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ variantId: 'v1', locationId: 'loc-1' }),
        data: { onHand: { increment: -3 }, available: { increment: -3 } },
      }),
    );
    expect(result.deltas).toEqual([{ sku: 'SKU-1', delta: -3 }]);
  });

  it('reconcileDocumentStockManualUnload rettifica solo il delta a parità di location', async () => {
    const tx = {
      inventoryLevel: {
        upsert: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      stockMovement: { create: vi.fn().mockResolvedValue({}) },
    };

    const result = await reconcileDocumentStockManualUnload(tx as never, {
      tenantId: 't1',
      oldLocationId: 'loc-1',
      newLocationId: 'loc-1',
      oldLines: [line({ variantId: 'v1', sku: 'SKU-1', quantity: 3, loadsStock: true })],
      newLines: [line({ variantId: 'v1', sku: 'SKU-1', quantity: 5, loadsStock: true })],
    });

    expect(tx.stockMovement.create).not.toHaveBeenCalled();
    expect(tx.inventoryLevel.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { onHand: { increment: -2 }, available: { increment: -2 } },
      }),
    );
    expect(result.deltas).toEqual([{ sku: 'SKU-1', delta: -2 }]);
  });

  it('reconcileDocumentStockManualUnload su cambio location ripristina la vecchia e scarica la nuova', async () => {
    const tx = {
      inventoryLevel: {
        upsert: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      stockMovement: { create: vi.fn().mockResolvedValue({}) },
    };

    const result = await reconcileDocumentStockManualUnload(tx as never, {
      tenantId: 't1',
      oldLocationId: 'loc-1',
      newLocationId: 'loc-2',
      oldLines: [line({ variantId: 'v1', sku: 'SKU-1', quantity: 3, loadsStock: true })],
      newLines: [line({ variantId: 'v1', sku: 'SKU-1', quantity: 3, loadsStock: true })],
    });

    expect(tx.stockMovement.create).not.toHaveBeenCalled();
    expect(tx.inventoryLevel.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ locationId: 'loc-1' }),
        data: { onHand: { increment: 3 }, available: { increment: 3 } },
      }),
    );
    expect(tx.inventoryLevel.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ locationId: 'loc-2' }),
        data: { onHand: { increment: -3 }, available: { increment: -3 } },
      }),
    );
    expect(result.deltas).toEqual([
      { sku: 'SKU-1', delta: 3 },
      { sku: 'SKU-1', delta: -3 },
    ]);
  });
});

/**
 * NOTA: dopo la migrazione al modello per-riga (mirror arrivo merce), la
 * generazione dei movimenti adjustment alla conferma passa da
 * `syncAdjustmentLineMovements` (document-stock-adjustment-sync.util.spec.ts).
 * Queste funzioni aggregate restano SOLO come fallback di compatibilità per
 * documenti confermati che non hanno ancora movimenti per riga collegati
 * (mirror del gate `hasLineMovements` usato per l'arrivo merce in
 * DocumentsService.update()/cancel()).
 */
describe('document-stock-adjustment.util (fallback legacy aggregato)', () => {
  function createTx() {
    return {
      inventoryLevel: {
        upsert: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue({ onHand: 10, available: 10 }),
      },
      stockMovement: { create: vi.fn().mockResolvedValue({}) },
    };
  }

  it('reconcileDocumentStockAdjustment: quantità aumentata rettifica solo il delta', async () => {
    const tx = createTx();

    const result = await reconcileDocumentStockAdjustment(tx as never, {
      tenantId: 't1',
      documentId: 'doc-ret',
      reference: 'RET-2026-0001',
      reason: 'Conteggio',
      oldLocationId: 'loc-1',
      newLocationId: 'loc-1',
      oldDirection: AdjustmentDirection.increase,
      newDirection: AdjustmentDirection.increase,
      oldLines: [line({ variantId: 'v1', sku: 'SKU-1', quantity: 2, loadsStock: true })],
      newLines: [line({ variantId: 'v1', sku: 'SKU-1', quantity: 5, loadsStock: true })],
      actor: { createdByName: 'Test' },
    });

    expect(tx.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'adjustment',
          direction: 'increase',
          locationId: 'loc-1',
          quantity: 3,
        }),
      }),
    );
    expect(result.deltas).toEqual([{ sku: 'SKU-1', delta: 3 }]);
  });

  it('reverseDocumentStockAdjustment: storna l\'intera quantità con direzione opposta', async () => {
    const tx = createTx();

    const result = await reverseDocumentStockAdjustment(tx as never, {
      tenantId: 't1',
      documentId: 'doc-ret',
      reference: 'RET-2026-0001',
      reason: 'Conteggio',
      locationId: 'loc-1',
      direction: AdjustmentDirection.decrease,
      lines: [line({ variantId: 'v1', sku: 'SKU-1', quantity: 5, loadsStock: true })],
      actor: { createdByName: 'Test' },
    });

    expect(tx.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'adjustment',
          direction: 'increase',
          quantity: 5,
        }),
      }),
    );
    expect(result.deltas).toEqual([{ sku: 'SKU-1', delta: 5 }]);
  });
});
