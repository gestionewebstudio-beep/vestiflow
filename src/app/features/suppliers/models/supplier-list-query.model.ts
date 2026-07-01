export const DEFAULT_SUPPLIER_PAGE_SIZE = 20;
export const SUPPLIER_PAGE_SIZE_OPTIONS = [20, 50, 100] as const;

export interface SupplierListQuery {
  readonly page: number;
  readonly pageSize: number;
  readonly search: string;
}

export function parseSupplierListQuery(
  params: URLSearchParams | { get: (key: string) => string | null },
): SupplierListQuery {
  const page = Math.max(1, Number(params.get('page') ?? '1') || 1);
  const rawSize = Number(params.get('pageSize') ?? String(DEFAULT_SUPPLIER_PAGE_SIZE));
  const pageSize = SUPPLIER_PAGE_SIZE_OPTIONS.includes(
    rawSize as (typeof SUPPLIER_PAGE_SIZE_OPTIONS)[number],
  )
    ? rawSize
    : DEFAULT_SUPPLIER_PAGE_SIZE;
  return {
    page,
    pageSize,
    search: params.get('search') ?? '',
  };
}

export function supplierListQueryToParams(query: SupplierListQuery): Record<string, string> {
  const params: Record<string, string> = {
    page: String(query.page),
    pageSize: String(query.pageSize),
  };
  if (query.search.trim()) {
    params['search'] = query.search.trim();
  }
  return params;
}
