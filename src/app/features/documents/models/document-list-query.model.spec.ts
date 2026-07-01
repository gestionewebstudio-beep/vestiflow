import { describe, expect, it } from 'vitest';

import { DEFAULT_DOCUMENT_PAGE_SIZE, parseDocumentListQuery } from './document-list-query.model';

function paramMap(values: Record<string, string | null>): import('@angular/router').ParamMap {
  return {
    get: (key: string) => values[key] ?? null,
    has: (key: string) => key in values && values[key] != null,
    getAll: (key: string) => {
      const value = values[key];
      return value == null ? [] : [value];
    },
    keys: Object.keys(values),
  };
}

describe('parseDocumentListQuery', () => {
  it('usa default paginazione', () => {
    const query = parseDocumentListQuery(paramMap({}));
    expect(query.page).toBe(1);
    expect(query.pageSize).toBe(DEFAULT_DOCUMENT_PAGE_SIZE);
  });

  it('parsa filtri tipo, stato e date', () => {
    const query = parseDocumentListQuery(
      paramMap({
        type: 'sales_ddt',
        status: 'confirmed',
        dateFrom: '2026-06-01',
        dateTo: '2026-06-30',
      }),
    );

    expect(query.type).toBe('sales_ddt');
    expect(query.status).toBe('confirmed');
    expect(query.dateFrom).toBe('2026-06-01');
    expect(query.dateTo).toBe('2026-06-30');
  });

  it('parsa customerId, accountant e pendingInvoice', () => {
    const customerId = 'c0011111-1111-4111-8111-111111111001';
    const query = parseDocumentListQuery(
      paramMap({
        customerId,
        accountant: '1',
        pendingInvoice: '1',
      }),
    );

    expect(query.customerId).toBe(customerId);
    expect(query.accountant).toBe(true);
    expect(query.pendingInvoice).toBe(true);
  });

  it('ignora customerId non UUID', () => {
    const query = parseDocumentListQuery(paramMap({ customerId: 'mario-rossi' }));
    expect(query.customerId).toBeUndefined();
  });
});
