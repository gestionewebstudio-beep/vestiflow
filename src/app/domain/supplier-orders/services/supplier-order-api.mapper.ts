import type { EntityId, IsoDateString, CurrencyCode } from '@core/models/common.model';
import { SupplierOrderStatus } from '@core/models/supplier-order.model';
import type {
  SupplierOrder,
  SupplierOrderLine,
  SupplierOrderLinkedDocument,
} from '@core/models/supplier-order.model';
import type { PurchaseCostEntryMode, VatSnapshot } from '@core/models/vat-code.model';

export interface SupplierOrderLineApiRow {
  readonly id: EntityId;
  readonly orderId: EntityId;
  readonly variantId: EntityId;
  readonly sku: string;
  readonly description?: string | null;
  readonly orderedQuantity: number;
  readonly receivedQuantity: number;
  readonly unitCostMinor: number;
  readonly enteredUnitCostMinor?: number | null;
  readonly discountPercent?: number;
  readonly vatCodeId?: string | null;
  readonly vatSnapshot?: Partial<VatSnapshot> | null;
  readonly lineTotalMinor?: number;
}

export interface SupplierOrderLinkedDocumentApiRow {
  readonly id: EntityId;
  readonly type: string;
  readonly reference?: string | null;
  readonly number?: number | null;
  readonly documentDate: IsoDateString;
  readonly status: string;
}

export interface SupplierOrderApiRow {
  readonly id: EntityId;
  readonly tenantId: EntityId;
  readonly reference: string;
  readonly supplierId: EntityId;
  readonly supplierName: string;
  readonly destinationLocationId?: EntityId | null;
  readonly status: SupplierOrderStatus;
  readonly currency: CurrencyCode;
  readonly costEntryMode?: PurchaseCostEntryMode;
  readonly orderDate?: IsoDateString;
  readonly supplierReference?: string | null;
  readonly subtotalMinor?: number;
  readonly taxMinor?: number;
  readonly totalMinor: number;
  readonly expectedAt?: string | null;
  readonly createdAt: IsoDateString;
  readonly updatedAt: IsoDateString;
  readonly lines: readonly SupplierOrderLineApiRow[];
  readonly lineCount?: number;
  readonly linkedDocuments?: readonly SupplierOrderLinkedDocumentApiRow[];
}

function mapLine(row: SupplierOrderLineApiRow, currency: CurrencyCode): SupplierOrderLine {
  return {
    id: row.id,
    variantId: row.variantId,
    sku: row.sku,
    description: row.description ?? row.sku,
    orderedQuantity: row.orderedQuantity,
    receivedQuantity: row.receivedQuantity,
    unitCost: { amountMinor: row.unitCostMinor, currencyCode: currency },
    enteredUnitCost: {
      amountMinor: row.enteredUnitCostMinor ?? row.unitCostMinor,
      currencyCode: currency,
    },
    discountPercent: row.discountPercent ?? 0,
    vatCodeId: row.vatCodeId ?? undefined,
    vatCode: row.vatSnapshot?.code,
    vatRatePercent: row.vatSnapshot?.ratePercent,
    lineTotal: {
      amountMinor: row.lineTotalMinor ?? row.orderedQuantity * row.unitCostMinor,
      currencyCode: currency,
    },
  };
}

function mapLinkedDocument(row: SupplierOrderLinkedDocumentApiRow): SupplierOrderLinkedDocument {
  return {
    id: row.id,
    type: row.type,
    reference: row.reference ?? undefined,
    number: row.number ?? undefined,
    documentDate: row.documentDate,
    status: row.status,
  };
}

/** Riga in creazione/modifica ordine (costo digitato in unità minori intere). */
export interface CreateSupplierOrderLineBody {
  readonly variantId: EntityId;
  readonly description?: string;
  readonly orderedQuantity: number;
  readonly enteredUnitCostMinor: number;
  readonly discountPercent?: number;
  readonly vatCodeId?: EntityId;
}

/** Body POST /supplier-orders. */
export interface CreateSupplierOrderBody {
  readonly supplierId: EntityId;
  readonly orderDate?: string;
  readonly expectedAt?: string;
  readonly supplierReference?: string;
  readonly costEntryMode?: PurchaseCostEntryMode;
  readonly currency?: CurrencyCode;
  readonly lines: readonly CreateSupplierOrderLineBody[];
}

/** Body PATCH /supplier-orders/:id (solo ordini Confermati). */
export type UpdateSupplierOrderBody = CreateSupplierOrderBody;

export function mapSupplierOrderApiRow(row: SupplierOrderApiRow): SupplierOrder {
  return {
    tenantId: row.tenantId,
    id: row.id,
    reference: row.reference,
    supplierId: row.supplierId,
    supplierName: row.supplierName,
    destinationLocationId: row.destinationLocationId ?? undefined,
    status: row.status,
    currency: row.currency,
    costEntryMode: row.costEntryMode ?? 'vat_excluded',
    orderDate: row.orderDate ?? row.createdAt,
    supplierReference: row.supplierReference ?? undefined,
    lines: row.lines.map((line) => mapLine(line, row.currency)),
    lineCount: row.lineCount,
    subtotal: { amountMinor: row.subtotalMinor ?? row.totalMinor, currencyCode: row.currency },
    tax: { amountMinor: row.taxMinor ?? 0, currencyCode: row.currency },
    totalAmount: { amountMinor: row.totalMinor, currencyCode: row.currency },
    expectedAt: row.expectedAt ?? undefined,
    linkedDocuments: row.linkedDocuments?.map(mapLinkedDocument),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
