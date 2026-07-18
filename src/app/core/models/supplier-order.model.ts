import type {
  CurrencyCode,
  EntityId,
  IsoDateString,
  Money,
  TenantScoped,
  Timestamped,
} from './common.model';
import type { PurchaseCostEntryMode } from './vat-code.model';

/**
 * Stati Ordine fornitore (prompt 2026-07): Confermato è lo stato default
 * (nessun effetto su giacenze/disponibilità); Concluso scatta quando
 * l'ordine viene incluso/agganciato a un Arrivo merce.
 */
export const SupplierOrderStatus = {
  Confirmed: 'confirmed',
  Concluded: 'concluded',
  Cancelled: 'cancelled',
} as const;
export type SupplierOrderStatus = (typeof SupplierOrderStatus)[keyof typeof SupplierOrderStatus];

/** Riga di un ordine fornitore (una variante ordinata). */
export interface SupplierOrderLine {
  readonly id: EntityId;
  readonly variantId: EntityId;
  /** Snapshot dello SKU al momento dell'ordine. */
  readonly sku: string;
  /** Snapshot della descrizione articolo (nome prodotto). */
  readonly description: string;
  readonly orderedQuantity: number;
  readonly receivedQuantity: number;
  /** Costo unitario NETTO canonico. */
  readonly unitCost: Money;
  /** Costo digitato (nella modalità netto/ivato della testata). */
  readonly enteredUnitCost: Money;
  /** Sconto riga percentuale intero (0-100). */
  readonly discountPercent: number;
  readonly vatCodeId?: EntityId;
  /** Codice IVA display (dallo snapshot, es. "22"). */
  readonly vatCode?: string;
  /** Aliquota IVA display (dallo snapshot). */
  readonly vatRatePercent?: number;
  /** Totale riga netto (qty × costo netto − sconto). */
  readonly lineTotal: Money;
}

/** Documento collegato (arrivo merce): collegamento visibile nell'ordine. */
export interface SupplierOrderLinkedDocument {
  readonly id: EntityId;
  readonly type: string;
  readonly reference?: string;
  readonly number?: number;
  readonly documentDate: IsoDateString;
  readonly status: string;
}

/**
 * Ordine a un fornitore: documento SOLO commerciale, non incide mai su
 * giacenze o disponibilità. Numerazione dal numeratore supplier_order.
 */
export interface SupplierOrder extends TenantScoped, Timestamped {
  readonly id: EntityId;
  /** Riferimento leggibile dal numeratore (es. 'OF-2026-0042'). */
  readonly reference: string;
  readonly supplierId: EntityId;
  /** Snapshot del nome fornitore per la visualizzazione. */
  readonly supplierName: string;
  /** Legacy: destinazione merce dei vecchi ordini (i nuovi non la valorizzano). */
  readonly destinationLocationId?: EntityId;
  readonly status: SupplierOrderStatus;
  readonly currency: CurrencyCode;
  /** Switch costi netto/ivato (come Arrivo merce). */
  readonly costEntryMode: PurchaseCostEntryMode;
  /** Data ordine (testata). */
  readonly orderDate: IsoDateString;
  /** "Rif. ordine fornitore": riferimento libero comunicato dal fornitore. */
  readonly supplierReference?: string;
  readonly lines: readonly SupplierOrderLine[];
  /** Presente in lista: conteggio righe senza caricare il payload completo. */
  readonly lineCount?: number;
  readonly subtotal: Money;
  readonly tax: Money;
  readonly totalAmount: Money;
  /** Consegna prevista. */
  readonly expectedAt?: IsoDateString;
  /** Arrivi merce attivi agganciati (collegamento visibile nel documento). */
  readonly linkedDocuments?: readonly SupplierOrderLinkedDocument[];
}
