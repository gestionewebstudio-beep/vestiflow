import { AdjustmentDirection } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { applyDocumentStockAdjustments } from './document-stock-adjustment.util';
import { applyDocumentStockManualUnloads } from './document-stock-manual-unload.util';

describe('document-stock-manual-unload.util', () => {
  it('applyDocumentStockManualUnloads crea movimenti unload aggregati', async () => {
    const tx = {
      inventoryLevel: {
        upsert: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue({ onHand: 10, available: 10 }),
      },
      stockMovement: { create: vi.fn().mockResolvedValue({}) },
    };

    await applyDocumentStockManualUnloads(tx as never, {
      tenantId: 't1',
      documentId: 'doc-sca',
      reference: 'SCA-2026-0001',
      locationId: 'loc-1',
      reason: 'Danneggiato',
      lines: [
        { variantId: 'v1', sku: 'SKU-1', quantity: 2, loadsStock: true },
        { variantId: 'v1', sku: 'SKU-1', quantity: 1, loadsStock: true },
      ],
      actor: { createdByName: 'Test' },
    });

    expect(tx.stockMovement.create).toHaveBeenCalledTimes(1);
    expect(tx.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'unload',
          quantity: 3,
          externalRef: 'doc-sca',
        }),
      }),
    );
  });
});

describe('document-stock-adjustment.util', () => {
  it('applyDocumentStockAdjustments crea movimenti adjustment con direzione', async () => {
    const tx = {
      inventoryLevel: {
        upsert: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue({ onHand: 10, available: 10 }),
      },
      stockMovement: { create: vi.fn().mockResolvedValue({}) },
    };

    await applyDocumentStockAdjustments(tx as never, {
      tenantId: 't1',
      documentId: 'doc-ret',
      reference: 'RET-2026-0001',
      locationId: 'loc-1',
      direction: AdjustmentDirection.decrease,
      reason: 'Conteggio',
      lines: [{ variantId: 'v1', sku: 'SKU-1', quantity: 5, loadsStock: true }],
      actor: { createdByName: 'Test' },
    });

    expect(tx.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'adjustment',
          direction: 'decrease',
          quantity: 5,
        }),
      }),
    );
  });
});
