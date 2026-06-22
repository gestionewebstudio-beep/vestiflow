import { describe, expect, it } from 'vitest';

import { toPaginatedResponse } from './api-pagination.mapper';

describe('toPaginatedResponse', () => {
  it('calcola totalPages arrotondando per eccesso', () => {
    const result = toPaginatedResponse({
      items: [{ id: '1' }],
      total: 21,
      page: 1,
      pageSize: 10,
    });

    expect(result.data).toHaveLength(1);
    expect(result.meta).toEqual({
      page: 1,
      pageSize: 10,
      total: 21,
      totalPages: 3,
    });
  });

  it('garantisce almeno 1 pagina anche con total 0', () => {
    const result = toPaginatedResponse({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });

    expect(result.meta.totalPages).toBe(1);
  });
});
