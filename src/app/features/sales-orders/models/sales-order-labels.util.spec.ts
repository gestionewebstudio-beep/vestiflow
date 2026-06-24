import { describe, expect, it } from 'vitest';

import {
  SalesOrderFinancialStatus,
  SalesOrderFulfillmentStatus,
  SalesOrderSource,
} from '@core/models/sales-order.model';

import {
  financialStatusLabel,
  financialStatusTone,
  fulfillmentStatusLabel,
  fulfillmentStatusTone,
  salesOrderLinesSummary,
  sourceLabel,
} from './sales-order-labels.util';

describe('salesOrderLinesSummary', () => {
  it('formatta una riga singola', () => {
    expect(salesOrderLinesSummary([{ title: 'Pantalone', quantity: 1 }])).toBe('Pantalone');
  });

  it('formatta quantità e righe multiple', () => {
    expect(
      salesOrderLinesSummary([
        { title: 'Pantalone', quantity: 2 },
        { title: 'Maglietta', quantity: 1 },
      ]),
    ).toBe('Pantalone × 2 + 1 altro');
  });

  it('restituisce trattino senza righe', () => {
    expect(salesOrderLinesSummary([])).toBe('—');
  });
});

describe('sales-order-labels.util', () => {
  for (const status of Object.values(SalesOrderFinancialStatus)) {
    it(`copre SalesOrderFinancialStatus.${status}`, () => {
      expect(financialStatusLabel(status)).toBeTruthy();
      expect(financialStatusTone(status)).toBeTruthy();
    });
  }

  for (const status of Object.values(SalesOrderFulfillmentStatus)) {
    it(`copre SalesOrderFulfillmentStatus.${status}`, () => {
      expect(fulfillmentStatusLabel(status)).toBeTruthy();
      expect(fulfillmentStatusTone(status)).toBeTruthy();
    });
  }

  for (const source of Object.values(SalesOrderSource)) {
    it(`copre SalesOrderSource.${source}`, () => {
      expect(sourceLabel(source)).toBeTruthy();
    });
  }
});
