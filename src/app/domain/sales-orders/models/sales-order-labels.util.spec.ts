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

  // ⭐ Un ordine annullato non è «da evadere» (collaudo del 13/09/2026, #1013).
  it('un ordine annullato e non evaso dice «Non evaso», in neutro — non «Da evadere» in ambra', () => {
    expect(fulfillmentStatusLabel(SalesOrderFulfillmentStatus.Unfulfilled, true)).toBe('Non evaso');
    expect(fulfillmentStatusTone(SalesOrderFulfillmentStatus.Unfulfilled, true)).toBe('neutral');
    // Non annullato: come prima.
    expect(fulfillmentStatusLabel(SalesOrderFulfillmentStatus.Unfulfilled)).toBe('Da evadere');
    expect(fulfillmentStatusTone(SalesOrderFulfillmentStatus.Unfulfilled)).toBe('warning');
    // Annullato dopo un'evasione parziale: la merce è uscita, e lo si dice.
    expect(fulfillmentStatusLabel(SalesOrderFulfillmentStatus.Partial, true)).toBe(
      'Evasione parziale',
    );
  });

  for (const source of Object.values(SalesOrderSource)) {
    it(`copre SalesOrderSource.${source}`, () => {
      expect(sourceLabel(source)).toBeTruthy();
    });
  }
});
