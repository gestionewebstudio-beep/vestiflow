import type { EntityId, IsoDateString, Money } from '@core/models/common.model';
import type { SalesOrderFinancialStatus } from '@core/models/sales-order.model';

// View model della dashboard: righe già aggregate dalla pagina smart.

/** Variante sotto soglia (o esaurita) in una location. */
export interface LowStockRow {
  readonly variantId: EntityId;
  readonly locationId: EntityId;
  readonly sku: string;
  /** Display completo della variante (es. 'T-shirt Basic — M / Bianco'). */
  readonly title: string;
  readonly locationName: string;
  readonly available: number;
  readonly minThreshold: number;
}

/** Vendita recente (per la lista "ultime vendite"). */
export interface RecentSaleRow {
  readonly orderId: EntityId;
  readonly orderNumber: string;
  readonly customerName: string;
  readonly placedAt: IsoDateString;
  readonly financialStatus: SalesOrderFinancialStatus;
  readonly total: Money;
}
