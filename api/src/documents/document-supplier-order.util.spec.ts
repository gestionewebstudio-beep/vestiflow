import { SupplierOrderStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  enrichReceiptLinesWithSupplierOrderLineIds,
  reconcileSupplierOrderReceipt,
  reverseSupplierOrderReceipt,
  syncSupplierOrderConclusion,
} from './document-supplier-order.util';

function createTxMock(options?: {
  orderStatus?: SupplierOrderStatus;
  activeLinkedDocuments?: number;
}) {
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

  const order = {
    id: 'order-1',
    status: options?.orderStatus ?? SupplierOrderStatus.confirmed,
  };

  return {
    supplierOrder: {
      findUnique: vi.fn(async () => order),
      update: vi.fn(async ({ data }: { data: { status?: SupplierOrderStatus } }) => {
        if (data.status) {
          order.status = data.status;
        }
        return order;
      }),
    },
    document: {
      count: vi.fn(async () => options?.activeLinkedDocuments ?? 0),
    },
    supplierOrderLine: {
      findMany: vi.fn(async ({ where }: { where: { orderId: string } }) =>
        [...orderLines.values()].filter((line) => line.orderId === where.orderId),
      ),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => orderLines.get(where.id)),
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: { receivedQuantity?: number } }) => {
          const line = orderLines.get(where.id);
          if (!line) {
            return null;
          }
          if (typeof data.receivedQuantity === 'number') {
            line.receivedQuantity = data.receivedQuantity;
          }
          orderLines.set(where.id, line);
          return line;
        },
      ),
    },
    _lines: orderLines,
    _order: order,
  };
}

describe('document-supplier-order.util', () => {
  let tx: ReturnType<typeof createTxMock>;

  beforeEach(() => {
    tx = createTxMock();
  });

  it('syncSupplierOrderConclusion marca Concluso con un arrivo merce attivo agganciato', async () => {
    tx = createTxMock({ activeLinkedDocuments: 1 });

    await syncSupplierOrderConclusion(tx as never, 'order-1');

    expect(tx._order.status).toBe(SupplierOrderStatus.concluded);
  });

  it('syncSupplierOrderConclusion riporta a Confermato senza documenti attivi', async () => {
    tx = createTxMock({
      orderStatus: SupplierOrderStatus.concluded,
      activeLinkedDocuments: 0,
    });

    await syncSupplierOrderConclusion(tx as never, 'order-1');

    expect(tx._order.status).toBe(SupplierOrderStatus.confirmed);
  });

  it('syncSupplierOrderConclusion esclude il documento in annullamento dal conteggio', async () => {
    tx = createTxMock({ orderStatus: SupplierOrderStatus.concluded });

    await syncSupplierOrderConclusion(tx as never, 'order-1', 'doc-cancelling');

    expect(tx.document.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { not: 'doc-cancelling' } }),
      }),
    );
  });

  it('syncSupplierOrderConclusion non tocca gli ordini annullati', async () => {
    tx = createTxMock({
      orderStatus: SupplierOrderStatus.cancelled,
      activeLinkedDocuments: 1,
    });

    await syncSupplierOrderConclusion(tx as never, 'order-1');

    expect(tx.supplierOrder.update).not.toHaveBeenCalled();
  });

  it('reverseSupplierOrderReceipt decrementa receivedQuantity e riapre l’ordine', async () => {
    tx = createTxMock({ orderStatus: SupplierOrderStatus.concluded });

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
      'doc-1',
    );

    expect(tx._lines.get('line-1')?.receivedQuantity).toBe(0);
    expect(tx._order.status).toBe(SupplierOrderStatus.confirmed);
  });

  it('reconcileSupplierOrderReceipt aggiorna il ricevuto e conclude l’ordine', async () => {
    tx = createTxMock({ activeLinkedDocuments: 1 });

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
    );

    expect(tx._lines.get('line-1')?.receivedQuantity).toBe(5);
    expect(tx._order.status).toBe(SupplierOrderStatus.concluded);
  });

  it('reconcileSupplierOrderReceipt rifiuta quantità oltre il residuo ordinato', async () => {
    await expect(
      reconcileSupplierOrderReceipt(
        tx as never,
        'order-1',
        [],
        [
          {
            variantId: 'variant-1',
            sku: 'SKU-1',
            quantity: 99,
            loadsStock: true,
            supplierOrderLineId: 'line-1',
          },
        ],
      ),
    ).rejects.toThrowError(/Quantità eccessiva/);
  });

  it('enrichReceiptLinesWithSupplierOrderLineIds collega righe per variantId', async () => {
    const lines = [
      {
        id: 'doc-line-1',
        supplierOrderLineId: null,
        variantId: 'variant-1',
      },
      {
        id: 'doc-line-2',
        supplierOrderLineId: 'line-1',
        variantId: 'variant-1',
      },
    ] as never[];

    const enriched = await enrichReceiptLinesWithSupplierOrderLineIds(
      tx as never,
      'order-1',
      lines,
    );

    expect(enriched[0]?.supplierOrderLineId).toBe('line-1');
    expect(enriched[1]?.supplierOrderLineId).toBe('line-1');
  });
});
