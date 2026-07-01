import { describe, expect, it, vi } from 'vitest';

import { applyDocumentStockTransfers } from './document-stock-transfer.util';

describe('document-stock-transfer.util', () => {
  it('applyDocumentStockTransfers crea movimenti transfer per riga aggregata', async () => {
    const tx = {
      productVariant: { findFirst: vi.fn() },
      inventoryLevel: {
        upsert: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue({ onHand: 10, available: 10 }),
      },
      stockMovement: { create: vi.fn().mockResolvedValue({}) },
    };

    await applyDocumentStockTransfers(tx as never, {
      tenantId: 't1',
      documentId: 'doc-tr',
      reference: 'TR-2026-0001',
      locations: { originLocationId: 'loc-a', targetLocationId: 'loc-b' },
      lines: [
        { variantId: 'v1', sku: 'SKU-1', quantity: 2, loadsStock: true },
        { variantId: 'v1', sku: 'SKU-1', quantity: 3, loadsStock: true },
      ],
      actor: { createdByName: 'Test' },
    });

    expect(tx.stockMovement.create).toHaveBeenCalledTimes(1);
    expect(tx.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'transfer',
          variantId: 'v1',
          locationId: 'loc-a',
          targetLocationId: 'loc-b',
          quantity: 5,
          externalRef: 'doc-tr',
        }),
      }),
    );
  });
});
