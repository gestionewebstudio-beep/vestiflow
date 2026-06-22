import { describe, expect, it } from 'vitest';

import {
  SalesOrderFinancialStatus,
  SalesOrderFulfillmentStatus,
  SalesOrderSource,
} from '@core/models/sales-order.model';
import { ShopifySyncStatus } from '@core/models/shopify.model';

import { mapSalesOrderApiRow } from './sales-order-api.mapper';

describe('mapSalesOrderApiRow', () => {
  it('mappa stati, money e link Shopify', () => {
    const order = mapSalesOrderApiRow({
      id: 'ord-1',
      tenantId: 'tenant-1',
      orderNumber: '#1001',
      source: 'shopify_pos',
      financialStatus: 'paid',
      fulfillmentStatus: 'partially_fulfilled',
      customerId: 'cust-1',
      customerName: 'Mario Rossi',
      currency: 'EUR',
      subtotalMinor: 5000,
      totalMinor: 5500,
      placedAt: '2026-06-15T10:00:00.000Z',
      shopifyOrderId: 'gid://shopify/Order/1001',
      createdAt: '2026-06-15T10:00:00.000Z',
      updatedAt: '2026-06-15T10:05:00.000Z',
      customer: { email: 'mario@example.com' },
      lines: [
        {
          id: 'line-1',
          orderId: 'ord-1',
          variantId: 'var-1',
          sku: 'SKU-1',
          title: 'Maglietta',
          quantity: 2,
          unitPriceMinor: 2500,
          totalMinor: 5000,
        },
      ],
    });

    expect(order.financialStatus).toBe(SalesOrderFinancialStatus.Paid);
    expect(order.fulfillmentStatus).toBe(SalesOrderFulfillmentStatus.Partial);
    expect(order.source).toBe(SalesOrderSource.Pos);
    expect(order.subtotal).toEqual({ amountMinor: 5000, currencyCode: 'EUR' });
    expect(order.lines[0]?.unitPrice.amountMinor).toBe(2500);
    expect(order.shopify?.status).toBe(ShopifySyncStatus.Synced);
    expect(order.customerEmail).toBe('mario@example.com');
  });

  it('normalizza stati pending e online', () => {
    const order = mapSalesOrderApiRow({
      id: 'ord-2',
      tenantId: 'tenant-1',
      orderNumber: '#1002',
      source: 'shopify_online',
      financialStatus: 'authorized',
      fulfillmentStatus: 'unfulfilled',
      customerName: 'Cliente',
      currency: 'EUR',
      subtotalMinor: 1000,
      totalMinor: 1000,
      placedAt: '2026-06-16T10:00:00.000Z',
      createdAt: '2026-06-16T10:00:00.000Z',
      updatedAt: '2026-06-16T10:00:00.000Z',
    });

    expect(order.financialStatus).toBe(SalesOrderFinancialStatus.Pending);
    expect(order.fulfillmentStatus).toBe(SalesOrderFulfillmentStatus.Unfulfilled);
    expect(order.source).toBe(SalesOrderSource.Online);
    expect(order.shopify).toBeUndefined();
  });
});
