import type { ParamMap } from '@angular/router';

import {
  SalesOrderFinancialStatus,
  SalesOrderFulfillmentStatus,
  SalesOrderSource,
} from '@core/models/sales-order.model';

// Query minimale per la lista vendite read-only. Ordinamento fisso per data
// discendente (le vendite si consultano dalla piu' recente); nessun sort param
// per restare conservativi finche' la UI non lo richiede.

export const DEFAULT_SALES_PAGE_SIZE = 20;
export const SALES_PAGE_SIZE_OPTIONS: readonly number[] = [10, 20, 50];

/** Filtro origine: canali singoli oppure 'shopify' (online + POS, fase 3 §3). */
export type SalesOrderSourceFilter = SalesOrderSource | 'shopify';

/**
 * Stato derivato dell'ordine (colonna Stato): aperto (Confermato/Aperto),
 * concluso (Concluso/Evaso), annullato. Rispecchia la logica della tabella.
 */
export const SALES_ORDER_STATE_VALUES = ['open', 'concluded', 'cancelled'] as const;
export type SalesOrderStateFilter = (typeof SALES_ORDER_STATE_VALUES)[number];

export interface SalesOrderListQuery {
  readonly page?: number;
  readonly pageSize?: number;
  /** Ricerca libera su numero ordine e nome cliente. */
  readonly search?: string;
  readonly financialStatus?: SalesOrderFinancialStatus;
  readonly fulfillmentStatus?: SalesOrderFulfillmentStatus;
  readonly source?: SalesOrderSourceFilter;
  readonly state?: SalesOrderStateFilter;
  readonly customerId?: string;
  readonly locationId?: string;
  /** Data ordine inclusiva (YYYY-MM-DD). */
  readonly placedFrom?: string;
  readonly placedTo?: string;
}

/** Filtri export CSV (stessi filtri lista, senza paginazione). */
export type SalesOrderExportQuery = Omit<SalesOrderListQuery, 'page' | 'pageSize'>;

const FINANCIAL_VALUES = new Set<string>(Object.values(SalesOrderFinancialStatus));
const FULFILLMENT_VALUES = new Set<string>(Object.values(SalesOrderFulfillmentStatus));
const SOURCE_VALUES = new Set<string>(Object.values(SalesOrderSource));
const STATE_VALUES = new Set<string>(SALES_ORDER_STATE_VALUES);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Parsing difensivo dei query param URL (URL = fonte di verita' della lista). */
export function parseSalesOrderListQuery(params: ParamMap): SalesOrderListQuery {
  const page = Number(params.get('page'));
  const pageSize = Number(params.get('pageSize'));
  const search = params.get('search')?.trim();
  const financialStatus = params.get('financialStatus') ?? '';
  const fulfillmentStatus = params.get('fulfillmentStatus') ?? '';
  const source = params.get('source') ?? '';
  const state = params.get('state') ?? '';
  const customerId = params.get('customerId')?.trim();
  const locationId = params.get('locationId')?.trim();
  const placedFrom = params.get('placedFrom')?.trim();
  const placedTo = params.get('placedTo')?.trim();

  return {
    page: Number.isInteger(page) && page > 0 ? page : 1,
    pageSize:
      Number.isInteger(pageSize) && SALES_PAGE_SIZE_OPTIONS.includes(pageSize)
        ? pageSize
        : DEFAULT_SALES_PAGE_SIZE,
    search: search || undefined,
    financialStatus: FINANCIAL_VALUES.has(financialStatus)
      ? (financialStatus as SalesOrderFinancialStatus)
      : undefined,
    fulfillmentStatus: FULFILLMENT_VALUES.has(fulfillmentStatus)
      ? (fulfillmentStatus as SalesOrderFulfillmentStatus)
      : undefined,
    source: SOURCE_VALUES.has(source) ? (source as SalesOrderSource) : undefined,
    state: STATE_VALUES.has(state) ? (state as SalesOrderStateFilter) : undefined,
    customerId: customerId || undefined,
    locationId: locationId || undefined,
    placedFrom: placedFrom && ISO_DATE.test(placedFrom) ? placedFrom : undefined,
    placedTo: placedTo && ISO_DATE.test(placedTo) ? placedTo : undefined,
  };
}

/** Query effettiva per la vista Ordini Shopify: forza i soli canali Shopify. */
export function withShopifySourceScope(query: SalesOrderListQuery): SalesOrderListQuery {
  if (query.source === SalesOrderSource.Online || query.source === SalesOrderSource.Pos) {
    return query;
  }
  return { ...query, source: 'shopify' };
}
