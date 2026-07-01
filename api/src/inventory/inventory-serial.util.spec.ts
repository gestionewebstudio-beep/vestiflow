import { UnprocessableEntityException } from '@nestjs/common';
import { InventorySerialStatus, InventoryTrackingMode } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  applyInventorySerialsFromDocumentLines,
  assertSerialNumbersForDocumentLines,
  assertSerialNumbersForUnloadLines,
  consumeInventorySerialsFromDocumentLines,
  parseSerialNumbers,
  restoreConsumedSerialsForDocument,
  reverseInventorySerialsForDocument,
  reverseTransferInventorySerialsForDocument,
  transferInventorySerialsFromDocumentLines,
} from './inventory-serial.util';

describe('parseSerialNumbers', () => {
  it('normalizza array stringhe ignorando vuoti', () => {
    expect(parseSerialNumbers([' SN-1 ', '', 'SN-2'])).toEqual(['SN-1', 'SN-2']);
  });

  it('restituisce array vuoto per input non array', () => {
    expect(parseSerialNumbers(null)).toEqual([]);
  });
});

describe('assertSerialNumbersForDocumentLines', () => {
  let tx: {
    productVariant: { findFirst: ReturnType<typeof vi.fn> };
    inventorySerial: { findMany: ReturnType<typeof vi.fn> };
  };

  beforeEach(() => {
    tx = {
      productVariant: { findFirst: vi.fn() },
      inventorySerial: { findMany: vi.fn().mockResolvedValue([]) },
    };
  });

  it('ignora prodotti senza tracciamento serial', async () => {
    tx.productVariant.findFirst.mockResolvedValue({
      sku: 'SKU-1',
      product: { inventoryTracking: InventoryTrackingMode.standard },
    });

    await assertSerialNumbersForDocumentLines(tx as never, 'tenant-1', [
      {
        id: 'line-1',
        variantId: 'var-1',
        quantity: 2,
        loadsStock: true,
        serialNumbers: [],
      },
    ]);

    expect(tx.inventorySerial.findMany).not.toHaveBeenCalled();
  });

  it('rifiuta quantità seriali diversa dalla riga', async () => {
    tx.productVariant.findFirst.mockResolvedValue({
      sku: 'SKU-SER',
      product: { inventoryTracking: InventoryTrackingMode.serial },
    });

    await expect(
      assertSerialNumbersForDocumentLines(tx as never, 'tenant-1', [
        {
          id: 'line-1',
          variantId: 'var-1',
          quantity: 2,
          loadsStock: true,
          serialNumbers: ['SN-1'],
        },
      ]),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('rifiuta seriali già presenti a magazzino', async () => {
    tx.productVariant.findFirst.mockResolvedValue({
      sku: 'SKU-SER',
      product: { inventoryTracking: InventoryTrackingMode.serial },
    });
    tx.inventorySerial.findMany.mockResolvedValue([{ serialNumber: 'SN-1' }]);

    await expect(
      assertSerialNumbersForDocumentLines(tx as never, 'tenant-1', [
        {
          id: 'line-1',
          variantId: 'var-1',
          quantity: 1,
          loadsStock: true,
          serialNumbers: ['SN-1'],
        },
      ]),
    ).rejects.toThrow('Seriali già presenti');
  });
});

describe('assertSerialNumbersForUnloadLines', () => {
  it('rifiuta seriali non in stock alla location', async () => {
    const tx = {
      productVariant: {
        findFirst: vi.fn().mockResolvedValue({
          sku: 'SKU-SER',
          product: { inventoryTracking: InventoryTrackingMode.serial },
        }),
      },
      inventorySerial: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };

    await expect(
      assertSerialNumbersForUnloadLines(tx as never, 'tenant-1', 'loc-1', [
        {
          id: 'line-1',
          variantId: 'var-1',
          quantity: 1,
          loadsStock: true,
          serialNumbers: ['SN-MISSING'],
        },
      ]),
    ).rejects.toThrow('non disponibile in stock');
  });
});

describe('applyInventorySerialsFromDocumentLines', () => {
  it('crea un record per ogni seriale su prodotti serial', async () => {
    const create = vi.fn();
    const tx = {
      productVariant: {
        findFirst: vi.fn().mockResolvedValue({
          sku: 'SKU-SER',
          product: { inventoryTracking: InventoryTrackingMode.serial },
        }),
      },
      inventorySerial: { create },
    };

    await applyInventorySerialsFromDocumentLines(tx as never, 'tenant-1', 'loc-1', [
      {
        id: 'line-1',
        variantId: 'var-1',
        quantity: 2,
        loadsStock: true,
        serialNumbers: ['SN-1', 'SN-2'],
      },
    ]);

    expect(create).toHaveBeenCalledTimes(2);
  });
});

describe('consumeInventorySerialsFromDocumentLines', () => {
  it('segna seriali come consumed', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const tx = {
      productVariant: {
        findFirst: vi.fn().mockResolvedValue({
          sku: 'SKU-SER',
          product: { inventoryTracking: InventoryTrackingMode.serial },
        }),
      },
      inventorySerial: { updateMany },
    };

    await consumeInventorySerialsFromDocumentLines(tx as never, 'tenant-1', 'loc-1', [
      {
        id: 'line-1',
        variantId: 'var-1',
        quantity: 1,
        loadsStock: true,
        serialNumbers: ['SN-1'],
      },
    ]);

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        serialNumber: 'SN-1',
        status: InventorySerialStatus.in_stock,
        variantId: 'var-1',
        locationId: 'loc-1',
      },
      data: {
        status: InventorySerialStatus.consumed,
        documentLineId: 'line-1',
      },
    });
  });
});

describe('transferInventorySerialsFromDocumentLines', () => {
  it('sposta seriali verso location destinazione', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const tx = {
      productVariant: {
        findFirst: vi.fn().mockResolvedValue({
          sku: 'SKU-SER',
          product: { inventoryTracking: InventoryTrackingMode.serial },
        }),
      },
      inventorySerial: { updateMany },
    };

    await transferInventorySerialsFromDocumentLines(
      tx as never,
      'tenant-1',
      'loc-origin',
      'loc-target',
      [
        {
          id: 'line-1',
          variantId: 'var-1',
          quantity: 1,
          loadsStock: true,
          serialNumbers: ['SN-1'],
        },
      ],
    );

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        serialNumber: 'SN-1',
        status: InventorySerialStatus.in_stock,
        variantId: 'var-1',
        locationId: 'loc-origin',
      },
      data: {
        locationId: 'loc-target',
        documentLineId: 'line-1',
      },
    });
  });
});

describe('restoreConsumedSerialsForDocument', () => {
  it('ripristina seriali consumati', async () => {
    const updateMany = vi.fn();
    await restoreConsumedSerialsForDocument({ inventorySerial: { updateMany } } as never, 'tenant-1', [
      'line-1',
    ]);

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        documentLineId: { in: ['line-1'] },
        status: InventorySerialStatus.consumed,
      },
      data: {
        status: InventorySerialStatus.in_stock,
        documentLineId: null,
      },
    });
  });
});

describe('reverseTransferInventorySerialsForDocument', () => {
  it('riporta seriali dalla destinazione all origine', async () => {
    const updateMany = vi.fn();
    await reverseTransferInventorySerialsForDocument(
      { inventorySerial: { updateMany } } as never,
      'tenant-1',
      'loc-origin',
      'loc-target',
      ['line-1'],
    );

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        documentLineId: { in: ['line-1'] },
        status: InventorySerialStatus.in_stock,
        locationId: 'loc-target',
      },
      data: {
        locationId: 'loc-origin',
        documentLineId: null,
      },
    });
  });
});

describe('reverseInventorySerialsForDocument', () => {
  it('elimina seriali per righe documento', async () => {
    const deleteMany = vi.fn();
    await reverseInventorySerialsForDocument({ inventorySerial: { deleteMany } } as never, 'tenant-1', [
      'line-1',
      'line-2',
    ]);

    expect(deleteMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', documentLineId: { in: ['line-1', 'line-2'] } },
    });
  });
});
