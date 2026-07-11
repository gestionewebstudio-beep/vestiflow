import type {
  CurrencyCode,
  EntityId,
  IsoDateString,
  Money,
  TenantScoped,
  Timestamped,
} from './common.model';

/** Tipo di documento gestionale (§2.1 piano funzionale). */
export const DocumentType = {
  SupplierOrder: 'supplier_order',
  GoodsReceipt: 'goods_receipt',
  SupplierDdt: 'supplier_ddt',
  SupplierInvoiceAccompanying: 'supplier_invoice_accompanying',
  SupplierInvoice: 'supplier_invoice',
  ManualLoad: 'manual_load',
  InitialLoad: 'initial_load',
  SalesDdt: 'sales_ddt',
  Transfer: 'transfer',
  ManualUnload: 'manual_unload',
  Adjustment: 'adjustment',
  Inventory: 'inventory',
  Proforma: 'proforma',
  InvoiceDraft: 'invoice_draft',
} as const;
export type DocumentType = (typeof DocumentType)[keyof typeof DocumentType];

/** Direzione rettifica inventario (documento adjustment). */
export const AdjustmentDirection = {
  Increase: 'increase',
  Decrease: 'decrease',
} as const;
export type AdjustmentDirection = (typeof AdjustmentDirection)[keyof typeof AdjustmentDirection];

/** Ciclo di vita del documento (§2, §4 piano funzionale). */
export const DocumentStatus = {
  Draft: 'draft',
  Confirmed: 'confirmed',
  Printed: 'printed',
  Sent: 'sent',
  ExternallyRegistered: 'externally_registered',
  Cancelled: 'cancelled',
} as const;
export type DocumentStatus = (typeof DocumentStatus)[keyof typeof DocumentStatus];

/** Stato collegamento fattura di un Arrivo merce (lista esterna, prompt §3). */
export const GoodsReceiptLinkStatus = {
  Suspended: 'suspended',
  Linked: 'linked',
  Cancelled: 'cancelled',
} as const;
export type GoodsReceiptLinkStatus =
  (typeof GoodsReceiptLinkStatus)[keyof typeof GoodsReceiptLinkStatus];

/** Tipo riferimento documento fornitore sull'Arrivo merce (§9.3). */
export const SupplierRefType = {
  Ddt: 'ddt',
  Invoice: 'invoice',
  Return: 'return',
  Other: 'other',
} as const;
export type SupplierRefType = (typeof SupplierRefType)[keyof typeof SupplierRefType];

/** Fattura registrata collegata a un Arrivo merce. */
export interface LinkedPurchaseInvoiceInfo {
  readonly id: EntityId;
  readonly reference?: string;
  readonly externalDocNumber?: string;
  readonly externalDocDate?: IsoDateString;
  readonly documentDate: IsoDateString;
}

/** Arrivo merce incluso in una Registrazione fattura. */
export interface LinkedGoodsReceiptInfo {
  readonly id: EntityId;
  readonly number?: number;
  readonly reference?: string;
  readonly documentDate: IsoDateString;
  readonly causalText?: string;
  readonly subtotal: Money;
  readonly tax: Money;
  readonly total: Money;
}

/** Riga di un documento (§2, §3.2). */
export interface DocumentLine {
  readonly id: EntityId;
  readonly lineNumber: number;
  readonly variantId?: EntityId;
  readonly sku?: string;
  readonly description: string;
  readonly quantity: number;
  readonly unitPrice: Money;
  readonly discountPercent: number;
  readonly vatRatePercent?: number;
  readonly lineTotal: Money;
  /** Flag "carica magazzino": righe spese/servizi non movimentano stock. */
  readonly loadsStock: boolean;
  /** Riga ordine fornitore collegata (§10.1). */
  readonly supplierOrderLineId?: EntityId;
  /** Codice lotto (tracciamento lot/expiry — C1). */
  readonly lotCode?: string;
  /** Data scadenza lotto ISO date (C1). */
  readonly lotExpiryDate?: IsoDateString;
  /** Numeri seriali (tracciamento serial). */
  readonly serialNumbers?: readonly string[];
  /** Arrivo merce collegato (righe riepilogative Registrazione fattura). */
  readonly linkedGoodsReceiptId?: EntityId;
}

/** Allegato documento (PDF/XML — B4). */
export interface DocumentAttachment {
  readonly id: EntityId;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly createdByName: string;
  readonly createdAt: IsoDateString;
}

/** Documento gestionale (§2). */
export interface DocumentRecord extends TenantScoped, Timestamped {
  readonly id: EntityId;
  readonly type: DocumentType;
  readonly status: DocumentStatus;
  readonly series: string;
  readonly number?: number;
  readonly year: number;
  /** Riferimento leggibile completo (es. 'DDT-2026-0001'); presente dopo la conferma. */
  readonly reference?: string;
  readonly documentDate: IsoDateString;
  readonly registrationDate?: IsoDateString;
  readonly printTitle?: string;
  readonly notes?: string;
  readonly internalComment?: string;
  readonly supplierId?: EntityId;
  readonly supplierName?: string;
  readonly customerId?: EntityId;
  readonly customerName?: string;
  readonly locationId?: EntityId;
  readonly locationName?: string;
  readonly targetLocationId?: EntityId;
  readonly adjustmentDirection?: AdjustmentDirection;
  readonly externalDocNumber?: string;
  readonly externalDocDate?: IsoDateString;
  /** Data emissione fattura esterna su bozza fattura (B6). */
  readonly externallyIssuedAt?: IsoDateString;
  readonly externalRef?: string;
  readonly sourceDocumentId?: EntityId;
  readonly billingCause?: string;
  /** Causale di carico (Arrivo merce, prompt §9.2). */
  readonly causalText?: string;
  /** Tipo riferimento documento fornitore (Arrivo merce, prompt §9.3). */
  readonly supplierRefType?: SupplierRefType;
  readonly currency: CurrencyCode;
  readonly subtotal: Money;
  readonly tax: Money;
  readonly total: Money;
  readonly documentDiscountPercent?: number;
  readonly pricesIncludeVat: boolean;
  readonly createdByName: string;
  readonly confirmedAt?: IsoDateString;
  readonly cancelledAt?: IsoDateString;
  /** Righe complete (dettaglio) o assenti in lista. */
  readonly lines?: readonly DocumentLine[];
  /** Presente in lista: conteggio righe senza payload completo. */
  readonly lineCount?: number;
  /** Da GET dettaglio: modifica post-conferma bloccata dalle impostazioni tipo. */
  readonly blockAfterConfirm?: boolean;
  /** Ordine vendita Shopify collegato (documento auto-generato). */
  readonly linkedSalesOrder?: {
    readonly id: EntityId;
    readonly orderNumber: string;
  };
  /** Ordine fornitore collegato (§10.1). */
  readonly linkedSupplierOrder?: {
    readonly id: EntityId;
    readonly reference: string;
  };
  /** Righe ordine fornitore per quantità ordinata/ricevuta/residua in arrivo merce. */
  readonly linkedSupplierOrderLines?: readonly LinkedSupplierOrderLineContext[];
  /** Stato collegamento fattura (solo Arrivo merce). */
  readonly linkStatus?: GoodsReceiptLinkStatus;
  /** Fattura registrata a cui l'arrivo è collegato (solo Arrivo merce). */
  readonly linkedPurchaseInvoice?: LinkedPurchaseInvoiceInfo;
  /** Arrivi merce inclusi (solo Registrazione fattura). */
  readonly linkedGoodsReceipts?: readonly LinkedGoodsReceiptInfo[];
  /** Allegati caricati sul documento (dettaglio). */
  readonly attachments?: readonly DocumentAttachment[];
}

/** Contesto riga ordine fornitore collegato (arrivo merce). */
export interface LinkedSupplierOrderLineContext {
  readonly id: EntityId;
  readonly variantId: EntityId;
  readonly sku: string;
  readonly orderedQuantity: number;
  readonly receivedQuantity: number;
}

/** Stati in cui il documento può essere modificato (§4), salvo blockAfterConfirm. */
export const CONFIRMED_EDITABLE_DOCUMENT_STATUSES: readonly DocumentStatus[] = [
  DocumentStatus.Confirmed,
  DocumentStatus.Printed,
  DocumentStatus.Sent,
] as const;

export function isConfirmedEditableDocumentStatus(status: DocumentStatus): boolean {
  return (CONFIRMED_EDITABLE_DOCUMENT_STATUSES as readonly string[]).includes(status);
}

/** Voce storico revisioni documento (Step 4). */
export interface DocumentRevision {
  readonly id: EntityId;
  readonly revisionNumber: number;
  readonly summary: string;
  readonly changedByName: string;
  readonly createdAt: IsoDateString;
}

/** Configurazione per tipo documento a livello tenant (§2.2). */
export interface DocumentTypeSetting {
  readonly type: DocumentType;
  readonly enabled: boolean;
  readonly printTitle: string;
  readonly autoNumbering: boolean;
  readonly numberPrefix: string;
  readonly defaultSeries: string;
  readonly blockAfterConfirm: boolean;
  readonly pricesIncludeVat: boolean;
  readonly defaultNotes: string | null;
}
