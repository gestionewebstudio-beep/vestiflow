import type { PaginatedResponse } from '@core/models/api.model';

import type { ApiPaginated } from './api-paginated.model';

export function toPaginatedResponse<T>(response: ApiPaginated<T>): PaginatedResponse<T> {
  const totalPages = Math.max(1, Math.ceil(response.total / response.pageSize));
  return {
    data: response.items,
    meta: {
      page: response.page,
      pageSize: response.pageSize,
      total: response.total,
      totalPages,
    },
  };
}
