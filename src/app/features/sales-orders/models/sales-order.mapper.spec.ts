import { describe, expect, it } from 'vitest';

import {
  SalesOrderFinancialStatus,
  SalesOrderFulfillmentStatus,
  SalesOrderSource,
} from '@core/models/sales-order.model';
import { ShopifySyncStatus } from '@core/models/shopify.model';

import type { SalesOrderDto } from './sales-order.dto';
import { salesOrderFromDto } from './sales-order.mapper';

const dto: SalesOrderDto = {
  id: 'so-1',
  tenantId: 'tenant-1',
  orderNumber: '#1001',
  financialStatus: SalesOrderFinancialStatus.Paid,
  fulfillmentStatus: SalesOrderFulfillmentStatus.Fulfilled,
  source: SalesOrderSource.Online,
  currency: 'EUR',
  customerName: 'Mario Rossi',
  customerEmail: 'mario@example.com',
  lines: [
    {
      id: 'line-1',
      sku: 'SKU-M',
      title: 'Maglietta M',
      quantity: 2,
      unitPrice: { amountMinor: 2990, currencyCode: 'EUR' },
      lineTotal: { amountMinor: 5980, currencyCode: 'EUR' },
    },
  ],
  subtotal: { amountMinor: 5980, currencyCode: 'EUR' },
  total: { amountMinor: 5980, currencyCode: 'EUR' },
  placedAt: '2026-06-01T10:00:00.000Z',
  shopify: { status: ShopifySyncStatus.Synced, shopifyId: 'gid://shopify/Order/1' },
  createdAt: '2026-06-01T10:00:00.000Z',
  updatedAt: '2026-06-01T10:00:00.000Z',
};

describe('salesOrderFromDto', () => {
  it('mappa DTO in dominio preservando money e shopify link', () => {
    const order = salesOrderFromDto(dto);

    expect(order.orderNumber).toBe('#1001');
    expect(order.lines[0]?.lineTotal.amountMinor).toBe(5980);
    expect(order.shopify?.shopifyId).toBe('gid://shopify/Order/1');
    expect(order.customerEmail).toBe('mario@example.com');
  });
});
