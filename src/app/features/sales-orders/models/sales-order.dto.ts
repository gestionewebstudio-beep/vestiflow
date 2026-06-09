import type { CurrencyCode, EntityId, IsoDateString, Money } from '@core/models/common.model';
import type {
  SalesOrderFinancialStatus,
  SalesOrderFulfillmentStatus,
  SalesOrderSource,
} from '@core/models/sales-order.model';
import type { ShopifyLink } from '@core/models/shopify.model';

// DTO di lettura vendite (Shopify-authoritative, esposte dal backend NestJS).
// Forma "wire": il backend popola tenantId e i timestamp. Read-only: nessun DTO
// di scrittura (le vendite non si creano dal gestionale in questa fase).

/** Riga vendita restituita dal backend (con snapshot sku/title). */
export interface SalesOrderLineDto {
  readonly id: EntityId;
  readonly variantId?: EntityId;
  readonly sku: string;
  readonly title: string;
  readonly quantity: number;
  readonly unitPrice: Money;
  readonly lineTotal: Money;
}

/** Vendita restituita dal backend. */
export interface SalesOrderDto {
  readonly id: EntityId;
  readonly tenantId: EntityId;
  readonly orderNumber: string;
  readonly financialStatus: SalesOrderFinancialStatus;
  readonly fulfillmentStatus: SalesOrderFulfillmentStatus;
  readonly source: SalesOrderSource;
  readonly currency: CurrencyCode;
  readonly customerId?: EntityId;
  readonly customerName: string;
  readonly customerEmail?: string;
  readonly storeId?: EntityId;
  readonly lines: readonly SalesOrderLineDto[];
  readonly subtotal: Money;
  readonly total: Money;
  readonly placedAt: IsoDateString;
  readonly shopify?: ShopifyLink;
  readonly createdAt: IsoDateString;
  readonly updatedAt: IsoDateString;
}
