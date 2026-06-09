import type { SalesOrderFinancialStatus, SalesOrderSource } from '@core/models/sales-order.model';

// Query minimale per la lista vendite read-only. Ordinamento fisso per data
// discendente (le vendite si consultano dalla piu' recente); nessun sort param
// per restare conservativi finche' la UI non lo richiede.

export interface SalesOrderListQuery {
  readonly page?: number;
  readonly pageSize?: number;
  /** Ricerca libera su numero ordine e nome cliente. */
  readonly search?: string;
  readonly financialStatus?: SalesOrderFinancialStatus;
  readonly source?: SalesOrderSource;
}
