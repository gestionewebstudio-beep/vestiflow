import type { CurrencyCode, EntityId, IsoDateString } from '@core/models/common.model';
import {
  SalesOrderFinancialStatus,
  SalesOrderFulfillmentStatus,
  SalesOrderSource,
} from '@core/models/sales-order.model';
import type { SalesOrder, SalesOrderLine } from '@core/models/sales-order.model';
import { ShopifySyncStatus } from '@core/models/shopify.model';

export interface SalesOrderLineApiRow {
  readonly id: EntityId;
  readonly orderId: EntityId;
  readonly variantId?: EntityId | null;
  readonly sku: string;
  readonly title: string;
  readonly quantity: number;
  readonly unitPriceMinor: number;
  readonly totalMinor: number;
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
  readonly shopifyOrderId?: string | null;
  readonly createdAt: IsoDateString;
  readonly updatedAt: IsoDateString;
  readonly customer?: { readonly email?: string | null } | null;
  readonly lines?: readonly SalesOrderLineApiRow[];
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
  return source === 'shopify_pos' ? SalesOrderSource.Pos : SalesOrderSource.Online;
}

function mapLine(row: SalesOrderLineApiRow, currency: CurrencyCode): SalesOrderLine {
  return {
    id: row.id,
    variantId: row.variantId ?? undefined,
    sku: row.sku,
    title: row.title,
    quantity: row.quantity,
    unitPrice: { amountMinor: row.unitPriceMinor, currencyCode: currency },
    lineTotal: { amountMinor: row.totalMinor, currencyCode: currency },
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
    shopify: row.shopifyOrderId
      ? { status: ShopifySyncStatus.Synced, shopifyId: row.shopifyOrderId }
      : undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
