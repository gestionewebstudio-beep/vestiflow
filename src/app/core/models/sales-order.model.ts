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

/** Canale di vendita (origine dell'ordine, fase 3 §2: registro multicanale). */
export const SalesOrderSource = {
  Online: 'online',
  Pos: 'pos',
  /** Ordine creato manualmente nel gestionale. */
  Manual: 'manual',
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
  // ── Righe Ordine cliente manuale ──
  /** EAN congelato al momento dell'ordine. */
  readonly barcode?: string;
  /** Unità di misura snapshot (es. pz). */
  readonly unitOfMeasure?: string;
  /** Sconto riga in notazione a cascata (es. "10%", "4+10%"). */
  readonly discount?: string;
  /** Codice IVA della riga. */
  readonly vatCodeId?: string;
  /** IVA riga (unità minori). */
  readonly lineVatTotal?: Money;
  /** Spunta "Impegna magazzino" della riga. */
  readonly commitsStock?: boolean;
  /** Riga «documento collegato»: separatore informativo, fuori dai totali. */
  readonly isReference?: boolean;
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
  /** Codice anagrafica cliente (colonna opzionale dell'elenco). */
  readonly customerCode?: string;
  readonly customerEmail?: string;
  /** Negozio/canale commerciale di vendita (opzionale). */
  readonly storeId?: EntityId;
  readonly lines: readonly SalesOrderLine[];
  readonly subtotal: Money;
  readonly total: Money;
  /** Data dell'ordine (Shopify processedAt). */
  readonly placedAt: IsoDateString;
  /** Annullamento comunicato dal canale (impegni rilasciati). */
  readonly cancelledAt?: IsoDateString;
  /** Evasione completa registrata dal canale (scarico in fase successiva). */
  readonly fulfilledAt?: IsoDateString;
  /** Evasione parziale o anomalia: richiede verifica manuale (fase 1 §7). */
  readonly requiresReview?: boolean;
  readonly reviewReason?: string;
  readonly shopify?: ShopifyLink;
  /** Quantità ancora impegnata dagli impegni attivi dell'ordine (fase 3 §2). */
  readonly committedQuantity?: number;
  /** Location principale degli impegni/scarico (fase 3 §2-§3). */
  readonly locationName?: string;
  /** DDT vendita collegato (sync Shopify). */
  readonly linkedDocument?: {
    readonly id: EntityId;
    readonly reference?: string;
    readonly type: string;
    readonly status: string;
  };
  /** Vendita online generata dall'evasione (fase 2): scarico + Corrispettivo. */
  readonly onlineSale?: SalesOrderOnlineSaleLink;
  // ── Testata Ordine cliente manuale (source = manual) ──
  /** Location/magazzino di origine degli impegni. */
  readonly locationId?: EntityId;
  /** Rif. ordine cliente esterno (testo libero). */
  readonly externalRef?: string;
  /** Data prevista consegna (solo giorno). */
  readonly expectedDeliveryDate?: IsoDateString;
  /** Note documento. */
  readonly notes?: string;
  /** Condizioni di pagamento (snapshot testo). */
  readonly paymentTerms?: string;
  /** Sconto extra % sull'intero documento, dopo gli sconti riga. */
  readonly documentDiscountPercent?: number;
}

/**
 * Stato dell'Ordine cliente manuale (§STATI + prompt DDT): stati derivati.
 * Non esiste Bozza: o Confermato, o non esiste. «Parzialmente concluso»
 * nasce quando il DDT che ha incluso l'ordine non copre tutti i prodotti.
 */
export const ManualOrderState = {
  Confirmed: 'confirmed',
  Cancelled: 'cancelled',
  Concluded: 'concluded',
  PartiallyConcluded: 'partially_concluded',
} as const;
export type ManualOrderState = (typeof ManualOrderState)[keyof typeof ManualOrderState];

/** Stato derivato: Annullato > Concluso > Parzialmente concluso > Confermato. */
export function manualOrderState(
  order: Pick<SalesOrder, 'cancelledAt' | 'fulfilledAt' | 'fulfillmentStatus'>,
): ManualOrderState {
  if (order.cancelledAt) {
    return ManualOrderState.Cancelled;
  }
  if (order.fulfilledAt) {
    return ManualOrderState.Concluded;
  }
  if (order.fulfillmentStatus === SalesOrderFulfillmentStatus.Partial) {
    return ManualOrderState.PartiallyConcluded;
  }
  return ManualOrderState.Confirmed;
}

/** Stato magazzino della Vendita online collegata. */
export const OnlineSaleInventoryStatus = {
  Unloaded: 'unloaded',
  PartiallyUnloaded: 'partially_unloaded',
  NotApplied: 'not_applied',
} as const;
export type OnlineSaleInventoryStatus =
  (typeof OnlineSaleInventoryStatus)[keyof typeof OnlineSaleInventoryStatus];

/** Stato della voce Corrispettivo collegata alla Vendita online. */
export const CorrispettivoEntryStatus = {
  ToVerify: 'to_verify',
  Included: 'included',
  ExcludedInvoiced: 'excluded_invoiced',
  Adjusted: 'adjusted',
  Refunded: 'refunded',
} as const;
export type CorrispettivoEntryStatus =
  (typeof CorrispettivoEntryStatus)[keyof typeof CorrispettivoEntryStatus];

/** Riferimento alla Vendita online collegata a un ordine evaso. */
export interface SalesOrderOnlineSaleLink {
  readonly id: EntityId;
  readonly reference: string;
  readonly fulfilledAt: IsoDateString;
  readonly inventoryStatus: OnlineSaleInventoryStatus;
  readonly refundedAt?: IsoDateString;
  readonly corrispettivo?: {
    readonly id: EntityId;
    readonly reference: string;
    readonly fiscalDate: IsoDateString;
    readonly status: CorrispettivoEntryStatus;
  };
}
