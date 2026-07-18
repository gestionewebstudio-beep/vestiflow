import type {
  CurrencyCode,
  EntityId,
  IsoDateString,
  Money,
  TenantScoped,
  Timestamped,
} from './common.model';
import type { PurchaseCostEntryMode, VatSnapshot } from './vat-code.model';

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
  // Fase 3: creati solo dal flusso cassa (mai dai form documenti generici).
  StoreSale: 'store_sale',
  StoreReturn: 'store_return',
  /** Preventivo cliente: numerazione PRE dedicata, mai effetti magazzino. */
  Quote: 'quote',
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

/** Modalità causale di carico: generata dal modello o testo manuale (§10). */
export const CausalGenerationMode = {
  Auto: 'auto',
  Manual: 'manual',
} as const;
export type CausalGenerationMode = (typeof CausalGenerationMode)[keyof typeof CausalGenerationMode];

/** Porto del trasporto DDT: franco (spese mittente) o assegnato (destinatario). */
export const TransportPort = {
  Franco: 'franco',
  Assegnato: 'assegnato',
} as const;
export type TransportPort = (typeof TransportPort)[keyof typeof TransportPort];

/**
 * Snapshot indirizzo di testata DDT vendita (prompt DDT §INDIRIZZI):
 * intestatario e destinazione condividono lo stesso schema.
 */
export interface DocumentAddress {
  readonly name?: string;
  readonly address?: string;
  readonly zip?: string;
  readonly city?: string;
  readonly province?: string;
  readonly country?: string;
  readonly fiscalCode?: string;
  readonly vatNumber?: string;
}

/** Ordine cliente agganciato a un DDT vendita (aggancio 1:N, prompt DDT). */
export interface LinkedSalesOrderInfo {
  readonly id: EntityId;
  readonly orderNumber: string;
  readonly cancelledAt?: IsoDateString;
  readonly fulfilledAt?: IsoDateString;
  /** Stato evasione (unfulfilled | partially_fulfilled | fulfilled). */
  readonly fulfillmentStatus?: string;
}

/** Fattura registrata collegata a un Arrivo merce. */
export interface LinkedPurchaseInvoiceInfo {
  readonly id: EntityId;
  readonly reference?: string;
  readonly externalDocNumber?: string;
  readonly externalDocDate?: IsoDateString;
  readonly documentDate: IsoDateString;
  /** "Totali da verificare": l'arrivo è stato modificato dopo il collegamento. */
  readonly totalsCheckPending?: boolean;
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
  /** Codice IVA della riga (tabella vat_codes, §9). */
  readonly vatCodeId?: EntityId;
  /** Snapshot IVA salvato alla registrazione (indipendente da modifiche future). */
  readonly vatSnapshot?: VatSnapshot;
  /** Costo unitario digitato (unità minori) nella modalità costo del documento. */
  readonly enteredUnitCostMinor?: number;
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
  /** Condizioni di pagamento in testata (Preventivo: campo «Pagamento»). */
  readonly paymentTerms?: string;
  /** Modalità di pagamento (DDT vendita: voce normativa MP01–MP23, snapshot nome). */
  readonly paymentMethod?: string;
  /** Data prevista consegna (Preventivo: campo «Consegna prevista»). */
  readonly expectedDeliveryDate?: IsoDateString;
  // ── DDT vendita: testata operativa (prompt DDT) ──
  /** "Seguirà doc. di vendita". */
  readonly followedBySalesDoc?: boolean;
  /** Causale trasporto (es. "Vendita"). */
  readonly transportCausal?: string;
  /** Data e ora inizio trasporto. */
  readonly transportStartAt?: IsoDateString;
  /** Porto: franco o assegnato. */
  readonly transportPort?: TransportPort;
  /** Incaricato del trasporto (vettore/mittente/destinatario). */
  readonly transportCarrier?: string;
  /** Numero colli. */
  readonly transportPackagesCount?: number;
  /** Peso (testo libero, es. "12,5 kg"). */
  readonly transportWeight?: string;
  /** Aspetto esteriore dei beni. */
  readonly transportGoodsAspect?: string;
  /** Codice spedizione del vettore. */
  readonly transportShippingCode?: string;
  /** Tracking spedizione. */
  readonly transportTrackingCode?: string;
  /** Intestatario documento (snapshot indirizzo). */
  readonly recipientAddress?: DocumentAddress;
  /** Destinazione merce (può differire dall'intestatario). */
  readonly destinationAddress?: DocumentAddress;
  /** Causale di carico (Arrivo merce, prompt §9.2). */
  readonly causalText?: string;
  /** Modalità causale: auto (dal modello) o manual (testo utente, §10). */
  readonly causalGenerationMode?: CausalGenerationMode;
  /** Modello causale usato in modalità auto (snapshot, §13). */
  readonly causalTemplateSnapshot?: string;
  /** Tipo documento fornitore (tabella per tenant, §3-4). */
  readonly externalDocumentTypeId?: EntityId;
  /** Snapshot etichetta breve del tipo al salvataggio (storico stabile, §13). */
  readonly externalDocumentTypeSnapshot?: string;
  readonly currency: CurrencyCode;
  readonly subtotal: Money;
  readonly tax: Money;
  readonly total: Money;
  readonly documentDiscountPercent?: number;
  readonly pricesIncludeVat: boolean;
  /** Modalità costi dell'Arrivo merce: netti o ivati (§11.1). */
  readonly purchaseCostEntryMode?: PurchaseCostEntryMode;
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
  /** Ordini cliente agganciati (DDT vendita può includerne più di uno). */
  readonly linkedSalesOrders?: readonly LinkedSalesOrderInfo[];
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
