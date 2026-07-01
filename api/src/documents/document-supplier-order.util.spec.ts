import { UnprocessableEntityException } from '@nestjs/common';
import { SupplierOrderStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../inventory/inventory-incoming.util', () => ({
  applyIncomingDelta: vi.fn(),
}));

import { applyIncomingDelta } from '../inventory/inventory-incoming.util';

import {
  applySupplierOrderReceipt,
  assertSupplierOrderReceiptQuantities,
  reconcileSupplierOrderReceipt,
  reverseSupplierOrderReceipt,
} from './document-supplier-order.util';

function createTxMock() {
  const orderLines = new Map([
    [
      'line-1',
      {
        id: 'line-1',
        orderId: 'order-1',
        variantId: 'variant-1',
        sku: 'SKU-1',
        orderedQuantity: 10,
        receivedQuantity: 2,
      },
    ],
  ]);

  return {
    supplierOrderLine: {
      findMany: vi.fn(async ({ where }: { where: { orderId: string; id?: { in: string[] } } }) => {
        const lines = [...orderLines.values()].filter((line) => line.orderId === where.orderId);
        if (where.id?.in) {
          return lines.filter((line) => where.id!.in.includes(line.id));
        }
        return lines;
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => orderLines.get(where.id)),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: { receivedQuantity?: number | { increment: number } } }) => {
        const line = orderLines.get(where.id);
        if (!line) {
          return null;
        }
        if (typeof data.receivedQuantity === 'number') {
          line.receivedQuantity = data.receivedQuantity;
        } else if (data.receivedQuantity?.increment != null) {
          line.receivedQuantity += data.receivedQuantity.increment;
        }
        orderLines.set(where.id, line);
        return line;
      }),
    },
    supplierOrder: {
      update: vi.fn(),
    },
    _lines: orderLines,
  };
}

describe('document-supplier-order.util', () => {
  let tx: ReturnType<typeof createTxMock>;

  beforeEach(() => {
    tx = createTxMock();
    vi.mocked(applyIncomingDelta).mockReset();
  });

  it('assertSupplierOrderReceiptQuantities rifiuta quantità oltre il residuo', async () => {
    await expect(
      assertSupplierOrderReceiptQuantities(tx as never, 'order-1', [
        {
          variantId: 'variant-1',
          sku: 'SKU-1',
          quantity: 9,
          loadsStock: true,
          supplierOrderLineId: 'line-1',
        },
      ]),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('applySupplierOrderReceipt incrementa receivedQuantity e aggiorna lo stato ordine', async () => {
    await applySupplierOrderReceipt(tx as never, 'order-1', [
      {
        variantId: 'variant-1',
        sku: 'SKU-1',
        quantity: 3,
        loadsStock: true,
        supplierOrderLineId: 'line-1',
      },
    ]);

    expect(tx._lines.get('line-1')?.receivedQuantity).toBe(5);
    expect(tx.supplierOrder.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { status: SupplierOrderStatus.partially_received },
    });
  });

  it('reverseSupplierOrderReceipt decrementa receivedQuantity', async () => {
    await reverseSupplierOrderReceipt(tx as never, 'order-1', [
      {
        variantId: 'variant-1',
        sku: 'SKU-1',
        quantity: 2,
        loadsStock: true,
        supplierOrderLineId: 'line-1',
      },
    ]);

    expect(tx._lines.get('line-1')?.receivedQuantity).toBe(0);
  });

  it('applySupplierOrderReceipt decrementa incoming quando location e tenant sono forniti', async () => {
    await applySupplierOrderReceipt(
      tx as never,
      'order-1',
      [
        {
          variantId: 'variant-1',
          sku: 'SKU-1',
          quantity: 3,
          loadsStock: true,
          supplierOrderLineId: 'line-1',
        },
      ],
      'loc-1',
      'tenant-1',
    );

    expect(applyIncomingDelta).toHaveBeenCalledWith(
      tx,
      'tenant-1',
      'variant-1',
      'loc-1',
      -3,
    );
  });

  it('reverseSupplierOrderReceipt incrementa incoming al annullamento', async () => {
    await reverseSupplierOrderReceipt(
      tx as never,
      'order-1',
      [
        {
          variantId: 'variant-1',
          sku: 'SKU-1',
          quantity: 2,
          loadsStock: true,
          supplierOrderLineId: 'line-1',
        },
      ],
      'loc-1',
      'tenant-1',
    );

    expect(applyIncomingDelta).toHaveBeenCalledWith(
      tx,
      'tenant-1',
      'variant-1',
      'loc-1',
      2,
    );
  });

  it('reconcileSupplierOrderReceipt riconcilia incoming al variare quantità', async () => {
    await reconcileSupplierOrderReceipt(
      tx as never,
      'order-1',
      [
        {
          variantId: 'variant-1',
          sku: 'SKU-1',
          quantity: 2,
          loadsStock: true,
          supplierOrderLineId: 'line-1',
        },
      ],
      [
        {
          variantId: 'variant-1',
          sku: 'SKU-1',
          quantity: 5,
          loadsStock: true,
          supplierOrderLineId: 'line-1',
        },
      ],
      'loc-1',
      'tenant-1',
    );

    expect(applyIncomingDelta).toHaveBeenCalledWith(
      tx,
      'tenant-1',
      'variant-1',
      'loc-1',
      -3,
    );
  });
});
