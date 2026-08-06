import { describe, expect, it } from 'vitest';

import {
  buildAccountantDocumentsListQuery,
  buildPendingInvoiceDocumentsListQuery,
} from './accountant-register.model';

describe('accountant-register.model', () => {
  it('buildAccountantDocumentsListQuery filtra vista commercialista', () => {
    expect(buildAccountantDocumentsListQuery('2026-01-01', '2026-01-31')).toEqual({
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
      accountant: '1',
    });
  });

  it('buildPendingInvoiceDocumentsListQuery filtra DDT da fatturare', () => {
    expect(buildPendingInvoiceDocumentsListQuery('2026-01-01', '2026-01-31')).toEqual({
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
      type: 'sales_ddt',
      pendingInvoice: '1',
    });
  });
});
