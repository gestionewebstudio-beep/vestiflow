import type { EntityId, IsoDateString, CurrencyCode } from '@core/models/common.model';
import { SupplierOrderStatus } from '@core/models/supplier-order.model';
import type { SupplierOrder, SupplierOrderLine } from '@core/models/supplier-order.model';

export interface SupplierOrderLineApiRow {
  readonly id: EntityId;
  readonly orderId: EntityId;
  readonly variantId: EntityId;
  readonly sku: string;
  readonly orderedQuantity: number;
  readonly receivedQuantity: number;
  readonly unitCostMinor: number;
}

export interface SupplierOrderApiRow {
  readonly id: EntityId;
  readonly tenantId: EntityId;
  readonly reference: string;
  readonly supplierId: EntityId;
  readonly supplierName: string;
  readonly destinationLocationId: EntityId;
  readonly status: SupplierOrderStatus;
  readonly currency: CurrencyCode;
  readonly totalMinor: number;
  readonly expectedAt?: string | null;
  readonly createdAt: IsoDateString;
  readonly updatedAt: IsoDateString;
  readonly lines: readonly SupplierOrderLineApiRow[];
}

function mapLine(row: SupplierOrderLineApiRow, currency: CurrencyCode): SupplierOrderLine {
  return {
    id: row.id,
    variantId: row.variantId,
    sku: row.sku,
    orderedQuantity: row.orderedQuantity,
    receivedQuantity: row.receivedQuantity,
    unitCost: { amountMinor: row.unitCostMinor, currencyCode: currency },
  };
}

/** Riga in creazione ordine (costo in unità minori intere). */
export interface CreateSupplierOrderLineBody {
  readonly variantId: EntityId;
  readonly orderedQuantity: number;
  readonly unitCostMinor: number;
}

/** Body POST /supplier-orders. */
export interface CreateSupplierOrderBody {
  readonly supplierId: EntityId;
  readonly destinationLocationId: EntityId;
  readonly currency?: CurrencyCode;
  readonly expectedAt?: string;
  readonly status?: SupplierOrderStatus;
  readonly lines: readonly CreateSupplierOrderLineBody[];
}

export function mapSupplierOrderApiRow(row: SupplierOrderApiRow): SupplierOrder {
  return {
    tenantId: row.tenantId,
    id: row.id,
    reference: row.reference,
    supplierId: row.supplierId,
    supplierName: row.supplierName,
    destinationLocationId: row.destinationLocationId,
    status: row.status,
    currency: row.currency,
    lines: row.lines.map((line) => mapLine(line, row.currency)),
    totalAmount: { amountMinor: row.totalMinor, currencyCode: row.currency },
    expectedAt: row.expectedAt ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
