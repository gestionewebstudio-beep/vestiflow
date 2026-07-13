import type { CurrencyCode, EntityId, IsoDateString } from '@core/models/common.model';
import {
  CorrispettivoEntryStatus,
  OnlineSaleInventoryStatus,
  SalesOrderFinancialStatus,
  SalesOrderFulfillmentStatus,
  SalesOrderSource,
} from '@core/models/sales-order.model';
import type {
  SalesOrder,
  SalesOrderLine,
  SalesOrderOnlineSaleLink,
} from '@core/models/sales-order.model';
import { ShopifySyncStatus } from '@core/models/shopify.model';

export interface SalesOrderLineApiRow {
  readonly id: EntityId;
  readonly orderId?: EntityId;
  readonly variantId?: EntityId | null;
  readonly sku?: string;
  readonly title: string;
  readonly quantity: number;
  readonly unitPriceMinor?: number;
  readonly totalMinor?: number;
}

export interface SalesOrderApiRow {
  readonly id: EntityId;
  readonly tenantId: EntityId;
  readonly orderNumber: string;
  readonly source: string;
  readonly financialStatus: string;
  readonly fulfillmentStatus: string;
  readonly customerId?: EntityId | null;
  readonly customerName: string;
  readonly currency: CurrencyCode;
  readonly subtotalMinor: number;
  readonly totalMinor: number;
  readonly placedAt: IsoDateString;
  readonly cancelledAt?: IsoDateString | null;
  readonly fulfilledAt?: IsoDateString | null;
  readonly requiresReview?: boolean;
  readonly reviewReason?: string | null;
  readonly shopifyOrderId?: string | null;
  readonly createdAt: IsoDateString;
  readonly updatedAt: IsoDateString;
  readonly customer?: { readonly email?: string | null } | null;
  readonly document?: {
    readonly id: EntityId;
    readonly reference?: string | null;
    readonly type: string;
    readonly status: string;
  } | null;
  readonly lines?: readonly SalesOrderLineApiRow[];
  /** Quantità impegnata residua degli impegni attivi (fase 3 §2). */
  readonly committedQuantity?: number;
  /** Location principale degli impegni (fase 3 §2-§3). */
  readonly locationName?: string | null;
  readonly onlineSale?: {
    readonly id: EntityId;
    readonly reference: string;
    readonly fulfilledAt: IsoDateString;
    readonly inventoryStatus: string;
    readonly refundedAt?: IsoDateString | null;
    readonly corrispettivo?: {
      readonly id: EntityId;
      readonly reference: string;
      readonly fiscalDate: IsoDateString;
      readonly status: string;
    } | null;
  } | null;
}

function mapFinancialStatus(status: string): SalesOrderFinancialStatus {
  switch (status) {
    case 'paid':
      return SalesOrderFinancialStatus.Paid;
    case 'partially_refunded':
      return SalesOrderFinancialStatus.PartiallyRefunded;
    case 'refunded':
      return SalesOrderFinancialStatus.Refunded;
    case 'voided':
      return SalesOrderFinancialStatus.Voided;
    case 'authorized':
    case 'pending':
    default:
      return SalesOrderFinancialStatus.Pending;
  }
}

function mapFulfillmentStatus(status: string): SalesOrderFulfillmentStatus {
  switch (status) {
    case 'partially_fulfilled':
      return SalesOrderFulfillmentStatus.Partial;
    case 'fulfilled':
      return SalesOrderFulfillmentStatus.Fulfilled;
    case 'unfulfilled':
    default:
      return SalesOrderFulfillmentStatus.Unfulfilled;
  }
}

function mapSource(source: string): SalesOrderSource {
  if (source === 'manual') {
    return SalesOrderSource.Manual;
  }
  return source === 'shopify_pos' ? SalesOrderSource.Pos : SalesOrderSource.Online;
}

export function mapInventoryStatus(status: string): OnlineSaleInventoryStatus {
  switch (status) {
    case 'unloaded':
      return OnlineSaleInventoryStatus.Unloaded;
    case 'partially_unloaded':
      return OnlineSaleInventoryStatus.PartiallyUnloaded;
    default:
      return OnlineSaleInventoryStatus.NotApplied;
  }
}

export function mapCorrispettivoStatus(status: string): CorrispettivoEntryStatus {
  switch (status) {
    case 'included':
      return CorrispettivoEntryStatus.Included;
    case 'excluded_invoiced':
      return CorrispettivoEntryStatus.ExcludedInvoiced;
    case 'adjusted':
      return CorrispettivoEntryStatus.Adjusted;
    case 'refunded':
      return CorrispettivoEntryStatus.Refunded;
    default:
      return CorrispettivoEntryStatus.ToVerify;
  }
}

function mapOnlineSale(row: NonNullable<SalesOrderApiRow['onlineSale']>): SalesOrderOnlineSaleLink {
  return {
    id: row.id,
    reference: row.reference,
    fulfilledAt: row.fulfilledAt,
    inventoryStatus: mapInventoryStatus(row.inventoryStatus),
    refundedAt: row.refundedAt ?? undefined,
    corrispettivo: row.corrispettivo
      ? {
          id: row.corrispettivo.id,
          reference: row.corrispettivo.reference,
          fiscalDate: row.corrispettivo.fiscalDate,
          status: mapCorrispettivoStatus(row.corrispettivo.status),
        }
      : undefined,
  };
}

function mapLine(row: SalesOrderLineApiRow, currency: CurrencyCode): SalesOrderLine {
  return {
    id: row.id,
    variantId: row.variantId ?? undefined,
    sku: row.sku ?? '',
    title: row.title,
    quantity: row.quantity,
    unitPrice: { amountMinor: row.unitPriceMinor ?? 0, currencyCode: currency },
    lineTotal: { amountMinor: row.totalMinor ?? 0, currencyCode: currency },
  };
}

export function mapSalesOrderApiRow(row: SalesOrderApiRow): SalesOrder {
  const currency = row.currency;
  return {
    tenantId: row.tenantId,
    id: row.id,
    orderNumber: row.orderNumber,
    financialStatus: mapFinancialStatus(row.financialStatus),
    fulfillmentStatus: mapFulfillmentStatus(row.fulfillmentStatus),
    source: mapSource(row.source),
    currency,
    customerId: row.customerId ?? undefined,
    customerName: row.customerName,
    customerEmail: row.customer?.email ?? undefined,
    lines: (row.lines ?? []).map((line) => mapLine(line, currency)),
    subtotal: { amountMinor: row.subtotalMinor, currencyCode: currency },
    total: { amountMinor: row.totalMinor, currencyCode: currency },
    placedAt: row.placedAt,
    cancelledAt: row.cancelledAt ?? undefined,
    fulfilledAt: row.fulfilledAt ?? undefined,
    requiresReview: row.requiresReview ?? false,
    reviewReason: row.reviewReason ?? undefined,
    shopify: row.shopifyOrderId
      ? { status: ShopifySyncStatus.Synced, shopifyId: row.shopifyOrderId }
      : undefined,
    committedQuantity: row.committedQuantity ?? 0,
    locationName: row.locationName ?? undefined,
    linkedDocument: row.document
      ? {
          id: row.document.id,
          reference: row.document.reference ?? undefined,
          type: row.document.type,
          status: row.document.status,
        }
      : undefined,
    onlineSale: row.onlineSale ? mapOnlineSale(row.onlineSale) : undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
