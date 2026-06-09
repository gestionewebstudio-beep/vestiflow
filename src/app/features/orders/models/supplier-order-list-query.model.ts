import type { ParamMap } from '@angular/router';

import { SupplierOrderStatus } from '@core/models/supplier-order.model';

export const DEFAULT_SUPPLIER_ORDER_PAGE_SIZE = 20;
export const SUPPLIER_ORDER_PAGE_SIZE_OPTIONS: readonly number[] = [10, 20, 50];

/** Query lista ordini fornitori (ordinamento fisso: creazione discendente). */
export interface SupplierOrderListQuery {
  readonly page?: number;
  readonly pageSize?: number;
  /** Ricerca libera su riferimento e nome fornitore. */
  readonly search?: string;
  readonly status?: SupplierOrderStatus;
}

const STATUS_VALUES = new Set<string>(Object.values(SupplierOrderStatus));

/** Parsing difensivo dei query param URL (URL = fonte di verita' della lista). */
export function parseSupplierOrderListQuery(params: ParamMap): SupplierOrderListQuery {
  const page = Number(params.get('page'));
  const pageSize = Number(params.get('pageSize'));
  const search = params.get('search')?.trim();
  const status = params.get('status') ?? '';

  return {
    page: Number.isInteger(page) && page > 0 ? page : 1,
    pageSize:
      Number.isInteger(pageSize) && SUPPLIER_ORDER_PAGE_SIZE_OPTIONS.includes(pageSize)
        ? pageSize
        : DEFAULT_SUPPLIER_ORDER_PAGE_SIZE,
    search: search || undefined,
    status: STATUS_VALUES.has(status) ? (status as SupplierOrderStatus) : undefined,
  };
}
