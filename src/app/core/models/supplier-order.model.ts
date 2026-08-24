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
  /**
   * Snapshot della descrizione articolo: il SOLO nome del prodotto.
   *
   * La variante sta in `variantLabel`. Prima ci finiva dentro ogni volta che
   * la maschera ripiegava su `summary.title`, che il display completo lo
   * contiene gia'.
   */
  readonly description: string;
  /**
   * Etichetta della VARIANTE: «M / Rosso». Vuota se l'articolo non ha opzioni
   * visibili, e vuota anche sulle righe salvate prima che la colonna
   * esistesse — la' la variante e' impastata nella descrizione, e riscriverla
   * significherebbe riscrivere un ordine gia' emesso.
   */
  readonly variantLabel: string;
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
  /**
   * Unità di misura fotografata sulla riga. Assente sulle righe salvate prima
   * che la colonna esistesse: lì vale quella dell'anagrafica.
   */
  readonly unitOfMeasure?: string;
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
  /** Numero interno, dal numeratore del tipo. Assente sugli ordini più vecchi. */
  readonly number?: number | null;
  /** Serie del numeratore; assente o vuota = «Senza serie». */
  readonly series?: string | null;
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
  // ── Documento della controparte ─────────────────────────────────────────
  //
  // Tipo, numero e data del documento che l'ALTRA parte ha emesso — qui la
  // conferma d'ordine del fornitore. È un'altra cosa da `supplierReference`,
  // che resta il riferimento libero: questo è un documento, con un tipo scelto
  // dall'elenco del tenant e una data propria.
  /** Numero del documento emesso dal fornitore (es. «145»). */
  readonly externalDocNumber?: string;
  /** Data del documento del fornitore (solo giorno). */
  readonly externalDocDate?: IsoDateString;
  readonly externalDocumentTypeId?: EntityId;
  /**
   * Etichetta del tipo fotografata al salvataggio. Un tipo può essere
   * eliminato: lo snapshot è ciò che tiene leggibile la dicitura sull'ordine
   * quando l'elenco non la porta più.
   */
  readonly externalDocumentTypeSnapshot?: string;
  /**
   * Sconto extra di chiusura sull'intero ordine, in percentuale. Arriva come
   * stringa decimale (colonna NUMERIC): non si parsa per confrontarlo, si
   * riporta nel campo. Aggiunto 11/08/2026 — era l'unico documento senza.
   */
  readonly documentDiscountPercent?: string | number;
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
