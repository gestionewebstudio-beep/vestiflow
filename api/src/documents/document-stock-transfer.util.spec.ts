import type { DocumentLine } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import {
  reconcileDocumentStockTransfer,
  reverseDocumentStockTransfer,
} from './document-stock-transfer.util';

/**
 * NOTA: dopo la migrazione al modello per-riga (mirror arrivo merce), la
 * generazione dei movimenti transfer alla conferma passa da
 * `syncTransferLineMovements` (document-stock-transfer-sync.util.spec.ts).
 * Queste funzioni aggregate restano SOLO come fallback di compatibilità per
 * documenti confermati che non hanno ancora movimenti per riga collegati
 * (mirror del gate `hasLineMovements` usato per l'arrivo merce in
 * DocumentsService.update()/cancel()).
 */

/** Riga documento di test: solo i campi letti da aggregateStockLines. */
function line(partial: {
  variantId: string;
  sku: string;
  quantity: number;
  loadsStock: boolean;
}): DocumentLine {
  return partial as unknown as DocumentLine;
}

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

describe('document-stock-transfer.util (fallback legacy aggregato)', () => {
  it('reconcileDocumentStockTransfer: quantità aumentata trasferisce solo il delta', async () => {
    const tx = createTx();

    const result = await reconcileDocumentStockTransfer(tx as never, {
      tenantId: 't1',
      documentId: 'doc-tr',
      reference: 'TR-2026-0001',
      oldLocations: { originLocationId: 'loc-a', targetLocationId: 'loc-b' },
      newLocations: { originLocationId: 'loc-a', targetLocationId: 'loc-b' },
      oldLines: [line({ variantId: 'v1', sku: 'SKU-1', quantity: 2, loadsStock: true })],
      newLines: [line({ variantId: 'v1', sku: 'SKU-1', quantity: 5, loadsStock: true })],
      actor: { createdByName: 'Test' },
    });

    expect(tx.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'transfer',
          locationId: 'loc-a',
          targetLocationId: 'loc-b',
          quantity: 3,
        }),
      }),
    );
    expect(result.deltas).toEqual([{ sku: 'SKU-1', delta: -3 }]);
  });

  it('reverseDocumentStockTransfer: storna l\'intera quantità verso l\'origine', async () => {
    const tx = createTx();

    const result = await reverseDocumentStockTransfer(tx as never, {
      tenantId: 't1',
      documentId: 'doc-tr',
      reference: 'TR-2026-0001',
      locations: { originLocationId: 'loc-a', targetLocationId: 'loc-b' },
      lines: [line({ variantId: 'v1', sku: 'SKU-1', quantity: 4, loadsStock: true })],
      actor: { createdByName: 'Test' },
    });

    expect(tx.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'transfer',
          locationId: 'loc-b',
          targetLocationId: 'loc-a',
          quantity: 4,
        }),
      }),
    );
    expect(result.deltas).toEqual([{ sku: 'SKU-1', delta: 4 }]);
  });
});
