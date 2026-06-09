import type {
  CurrencyCode,
  EntityId,
  IsoDateString,
  Money,
  TenantScoped,
  Timestamped,
} from './common.model';
import type { ShopifyLink } from './shopify.model';

// Vendita (ordine cliente) come SNAPSHOT di sola lettura. Shopify è autoritativo
// su vendite e clienti: questo modello rappresenta la vista del gestionale, non
// un workflow modificabile. NON tocca le giacenze: il decremento stock è
// responsabilità del backend/Magazzino, mai di questo modello.

/** Stato di pagamento (sottoinsieme dei display status Shopify). */
export const SalesOrderFinancialStatus = {
  Pending: 'pending',
  Paid: 'paid',
  PartiallyRefunded: 'partially_refunded',
  Refunded: 'refunded',
  Voided: 'voided',
} as const;
export type SalesOrderFinancialStatus =
  (typeof SalesOrderFinancialStatus)[keyof typeof SalesOrderFinancialStatus];

/** Stato di evasione (sottoinsieme dei display status Shopify). */
export const SalesOrderFulfillmentStatus = {
  Unfulfilled: 'unfulfilled',
  Partial: 'partial',
  Fulfilled: 'fulfilled',
} as const;
export type SalesOrderFulfillmentStatus =
  (typeof SalesOrderFulfillmentStatus)[keyof typeof SalesOrderFulfillmentStatus];

/** Canale di vendita. */
export const SalesOrderSource = {
  Online: 'online',
  Pos: 'pos',
} as const;
export type SalesOrderSource = (typeof SalesOrderSource)[keyof typeof SalesOrderSource];

/**
 * Riga di una vendita. Porta snapshot di `sku`/`title` per restare coerente
 * anche se il catalogo cambia; `variantId` è opzionale (ordini storici o
 * varianti rimosse).
 */
export interface SalesOrderLine {
  readonly id: EntityId;
  /** Variante collegata, se ancora identificabile. */
  readonly variantId?: EntityId;
  /** SKU congelato al momento dell'ordine. */
  readonly sku: string;
  /** Nome prodotto/variante congelato (display). */
  readonly title: string;
  readonly quantity: number;
  readonly unitPrice: Money;
  readonly lineTotal: Money;
}

/** Vendita read-only (Shopify-authoritative). */
export interface SalesOrder extends TenantScoped, Timestamped {
  readonly id: EntityId;
  /** Numero ordine leggibile (Shopify order name, es. '#1001'). */
  readonly orderNumber: string;
  readonly financialStatus: SalesOrderFinancialStatus;
  readonly fulfillmentStatus: SalesOrderFulfillmentStatus;
  readonly source: SalesOrderSource;
  readonly currency: CurrencyCode;
  /** Cliente collegato, se non guest. */
  readonly customerId?: EntityId;
  /** Nome cliente snapshot (display; fallback per ordini guest). */
  readonly customerName: string;
  readonly customerEmail?: string;
  /** Negozio/canale commerciale di vendita (opzionale). */
  readonly storeId?: EntityId;
  readonly lines: readonly SalesOrderLine[];
  readonly subtotal: Money;
  readonly total: Money;
  /** Data dell'ordine (Shopify processedAt). */
  readonly placedAt: IsoDateString;
  readonly shopify?: ShopifyLink;
}
