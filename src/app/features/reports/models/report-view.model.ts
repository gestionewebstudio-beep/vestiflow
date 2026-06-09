import type { EntityId, Money } from '@core/models/common.model';
import type { SalesOrderFinancialStatus } from '@core/models/sales-order.model';

// View model dei report: righe già aggregate dalla pagina smart.

/** Aggregato giacenze per location. */
export interface LocationReportRow {
  readonly locationId: EntityId;
  readonly locationName: string;
  /** Numero di varianti con giacenza tracciata nella location. */
  readonly trackedVariants: number;
  /** Pezzi disponibili (somma available, oversell incluso). */
  readonly availableUnits: number;
  /** Varianti sotto soglia o esaurite. */
  readonly lowStockCount: number;
  /** Valore del disponibile a prezzo di vendita (available negativi esclusi). */
  readonly stockValue: Money;
}

/** Aggregato vendite per stato pagamento. */
export interface SalesReportRow {
  readonly status: SalesOrderFinancialStatus;
  readonly orders: number;
  /** Pezzi venduti (somma quantità righe). */
  readonly units: number;
  readonly total: Money;
}
