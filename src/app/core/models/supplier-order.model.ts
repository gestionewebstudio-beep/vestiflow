import type {
  CurrencyCode,
  EntityId,
  IsoDateString,
  Money,
  TenantScoped,
  Timestamped,
} from './common.model';

export const SupplierOrderStatus = {
  Draft: 'draft',
  Sent: 'sent',
  PartiallyReceived: 'partially_received',
  Received: 'received',
  Cancelled: 'cancelled',
} as const;
export type SupplierOrderStatus = (typeof SupplierOrderStatus)[keyof typeof SupplierOrderStatus];

/** Riga di un ordine fornitore (una variante ordinata). */
export interface SupplierOrderLine {
  readonly id: EntityId;
  readonly variantId: EntityId;
  /** Snapshot dello SKU al momento dell'ordine. */
  readonly sku: string;
  readonly orderedQuantity: number;
  readonly receivedQuantity: number;
  readonly unitCost: Money;
}

/** Ordine a un fornitore, con destinazione negozio e righe. */
export interface SupplierOrder extends TenantScoped, Timestamped {
  readonly id: EntityId;
  /** Riferimento leggibile (es. 'PO-2026-0042'). */
  readonly reference: string;
  readonly supplierId: EntityId;
  /** Snapshot del nome fornitore per la visualizzazione. */
  readonly supplierName: string;
  /** Location di destinazione della merce. */
  readonly destinationLocationId: EntityId;
  readonly status: SupplierOrderStatus;
  readonly currency: CurrencyCode;
  readonly lines: readonly SupplierOrderLine[];
  readonly totalAmount: Money;
  readonly expectedAt?: IsoDateString;
}
