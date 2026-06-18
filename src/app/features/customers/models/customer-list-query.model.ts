import type { ParamMap } from '@angular/router';

export const DEFAULT_CUSTOMER_PAGE_SIZE = 20;
export const CUSTOMER_PAGE_SIZE_OPTIONS: readonly number[] = [10, 20, 50];

/** Query lista clienti (ordinamento fisso: cognome/nome ascendente). */
export interface CustomerListQuery {
  readonly page?: number;
  readonly pageSize?: number;
  /** Ricerca libera su nome, cognome ed email. */
  readonly search?: string;
}

/** Filtri export CSV (stessi filtri lista, senza paginazione). */
export type CustomerExportQuery = Omit<CustomerListQuery, 'page' | 'pageSize'>;

/** Parsing difensivo dei query param URL (URL = fonte di verita' della lista). */
export function parseCustomerListQuery(params: ParamMap): CustomerListQuery {
  const page = Number(params.get('page'));
  const pageSize = Number(params.get('pageSize'));
  const search = params.get('search')?.trim();

  return {
    page: Number.isInteger(page) && page > 0 ? page : 1,
    pageSize:
      Number.isInteger(pageSize) && CUSTOMER_PAGE_SIZE_OPTIONS.includes(pageSize)
        ? pageSize
        : DEFAULT_CUSTOMER_PAGE_SIZE,
    search: search || undefined,
  };
}
