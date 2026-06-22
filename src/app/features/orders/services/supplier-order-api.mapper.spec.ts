import { describe, expect, it } from 'vitest';

import { SupplierOrderStatus } from '@core/models/supplier-order.model';

import { mapSupplierOrderApiRow } from './supplier-order-api.mapper';

describe('mapSupplierOrderApiRow', () => {
  it('mappa totalMinor e unitCostMinor in Money', () => {
    const order = mapSupplierOrderApiRow({
      id: 'ord-1',
      tenantId: 'tenant-1',
      reference: 'PO-2026-001',
      supplierId: 'sup-1',
      supplierName: 'Fornitore ABC',
      destinationLocationId: 'loc-1',
      status: SupplierOrderStatus.Draft,
      currency: 'EUR',
      totalMinor: 5990,
      expectedAt: '2026-07-01',
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
      lines: [
        {
          id: 'line-1',
          orderId: 'ord-1',
          variantId: 'var-1',
          sku: 'SKU-RED-M',
          orderedQuantity: 10,
          receivedQuantity: 0,
          unitCostMinor: 599,
        },
      ],
    });

    expect(order.totalAmount).toEqual({ amountMinor: 5990, currencyCode: 'EUR' });
    expect(order.lines[0]?.unitCost).toEqual({ amountMinor: 599, currencyCode: 'EUR' });
    expect(order.supplierName).toBe('Fornitore ABC');
    expect(order.expectedAt).toBe('2026-07-01');
  });

  it('normalizza expectedAt null in undefined', () => {
    const order = mapSupplierOrderApiRow({
      id: 'ord-2',
      tenantId: 'tenant-1',
      reference: 'PO-2026-002',
      supplierId: 'sup-1',
      supplierName: 'Fornitore ABC',
      destinationLocationId: 'loc-1',
      status: SupplierOrderStatus.Sent,
      currency: 'EUR',
      totalMinor: 0,
      expectedAt: null,
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
      lines: [],
    });

    expect(order.expectedAt).toBeUndefined();
  });
});
