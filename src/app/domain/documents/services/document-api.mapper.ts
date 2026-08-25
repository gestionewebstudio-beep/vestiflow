import { toStorableMinor } from '@core/utils/money.util';

import type { CurrencyCode, EntityId, IsoDateString } from '@core/models/common.model';
import type { PurchaseCostEntryMode, VatSnapshot } from '@core/models/vat-code.model';
import type {
  AdjustmentDirection,
  CausalGenerationMode,
  ConvertedDocumentRef,
  DocumentAddress,
  DocumentAttachment,
  DocumentLine,
  DocumentPaymentInstallment,
  DocumentRecord,
  DocumentStatus,
  DocumentType,
  DocumentTypeSetting,
  GoodsReceiptLinkStatus,
  GoodsReceiptVatBreakdownEntry,
  LinkedGoodsReceiptInfo,
  LinkedPurchaseInvoiceInfo,
  LinkedSalesOrderInfo,
  TransportPort,
} from '@core/models/document.model';

export interface DocumentLineApiRow {
  readonly id: EntityId;
  readonly lineNumber: number;
  readonly variantId?: EntityId | null;
  readonly sku?: string | null;
  readonly description: string;
  readonly quantity: number;
  readonly unitPriceMinor: number;
  /** Sconto effettivo con decimali (Decimal serializzato come stringa). */
  readonly discountPercent: number;
  readonly vatCodeId?: EntityId | null;
  readonly vatSnapshot?: VatSnapshot | null;
  /** Costo digitato (Decimal serializzato come stringa dal backend). */
  readonly enteredUnitCost?: string | number | null;
  readonly lineTotalMinor: number;
  readonly unitOfMeasure?: string | null;
  readonly variantLabel?: string | null;
  readonly loadsStock: boolean;
  readonly isReference?: boolean;
  readonly supplierOrderLineId?: EntityId | null;
  readonly lotCode?: string | null;
  readonly lotExpiryDate?: IsoDateString | null;
  readonly serialNumbers?: readonly string[] | null;
  readonly linkedGoodsReceiptId?: EntityId | null;
  readonly lineVatTotalMinor?: number | null;
  readonly lineSource?: 'vat_summary' | 'manual' | null;
}

/** Fattura registrata collegata a un arrivo merce (payload API). */
export interface LinkedPurchaseInvoiceApiRow {
  readonly id: EntityId;
  readonly reference?: string | null;
  readonly externalDocNumber?: string | null;
  readonly externalDocDate?: IsoDateString | null;
  readonly documentDate: IsoDateString;
  readonly totalsCheckPending?: boolean | null;
}

/** Quota IVA di un arrivo merce (payload API). */
export interface VatBreakdownApiEntry {
  readonly ratePercent: number;
  readonly netMinor: number;
  readonly vatMinor: number;
}

/** Arrivo merce incluso in una registrazione fattura (payload API). */
export interface LinkedGoodsReceiptApiRow {
  readonly id: EntityId;
  readonly number?: number | null;
  readonly reference?: string | null;
  readonly documentDate: IsoDateString;
  readonly causalText?: string | null;
  readonly subtotalMinor: number;
  readonly taxMinor: number;
  readonly totalMinor: number;
  readonly vatBreakdown?: readonly VatBreakdownApiEntry[] | null;
}

/** Scadenza di pagamento (payload API, Registrazione fattura). */
export interface PaymentInstallmentApiRow {
  readonly id: EntityId;
  readonly position: number;
  readonly dueDate: IsoDateString;
  readonly amountMinor: number;
  readonly settled: boolean;
  readonly settledAt?: IsoDateString | null;
}

export interface DocumentApiRow {
  readonly id: EntityId;
  readonly tenantId: EntityId;
  readonly type: DocumentType;
  readonly status: DocumentStatus;
  readonly series: string;
  readonly number?: number | null;
  readonly year: number;
  readonly reference?: string | null;
  readonly documentDate: IsoDateString;
  readonly registrationDate?: IsoDateString | null;
  readonly printTitle?: string | null;
  readonly notes?: string | null;
  readonly internalComment?: string | null;
  readonly supplierId?: EntityId | null;
  readonly supplierName?: string | null;
  readonly supplierCode?: string | null;
  readonly customerId?: EntityId | null;
  readonly customerName?: string | null;
  readonly customerCode?: string | null;
  readonly locationId?: EntityId | null;
  readonly locationName?: string | null;
  readonly targetLocationId?: EntityId | null;
  readonly adjustmentDirection?: AdjustmentDirection | null;
  readonly externalDocNumber?: string | null;
  readonly externalDocDate?: IsoDateString | null;
  readonly externallyIssuedAt?: IsoDateString | null;
  readonly externalRef?: string | null;
  readonly sourceDocumentId?: EntityId | null;
  readonly billingCause?: string | null;
  readonly paymentTerms?: string | null;
  readonly paymentMethod?: string | null;
  readonly paymentMethodNote?: string | null;
  readonly expectedDeliveryDate?: IsoDateString | null;
  readonly followedBySalesDoc?: boolean | null;
  readonly transportCausal?: string | null;
  readonly transportStartAt?: IsoDateString | null;
  readonly transportPort?: TransportPort | null;
  readonly transportCarrier?: string | null;
  readonly transportPackagesCount?: number | null;
  readonly transportWeight?: string | null;
  readonly transportGoodsAspect?: string | null;
  readonly transportShippingCode?: string | null;
  readonly transportTrackingCode?: string | null;
  readonly recipientAddress?: DocumentAddress | null;
  readonly destinationAddress?: DocumentAddress | null;
  readonly causalText?: string | null;
  readonly causalGenerationMode?: string | null;
  readonly causalTemplateSnapshot?: string | null;
  readonly externalDocumentTypeId?: EntityId | null;
  readonly externalDocumentTypeSnapshot?: string | null;
  readonly currency: CurrencyCode;
  readonly subtotalMinor: number;
  readonly taxMinor: number;
  readonly totalMinor: number;
  readonly outstandingMinor?: number | null;
  readonly documentDiscountPercent?: number;
  readonly pricesIncludeVat: boolean;
  readonly purchaseCostEntryMode?: PurchaseCostEntryMode | null;
  readonly createdByName: string;
  readonly confirmedAt?: IsoDateString | null;
  readonly cancelledAt?: IsoDateString | null;
  readonly createdAt: IsoDateString;
  readonly updatedAt: IsoDateString;
  readonly lines?: readonly DocumentLineApiRow[];
  readonly lineCount?: number;
  readonly sourceDocument?: ConvertedDocumentRef | null;
  readonly derivedDocuments?: readonly ConvertedDocumentRef[] | null;
  readonly salesOrder?: { readonly id: EntityId; readonly orderNumber: string } | null;
  readonly linkedSalesOrders?: readonly LinkedSalesOrderApiRow[] | null;
  readonly supplierOrder?: { readonly id: EntityId; readonly reference: string } | null;
  readonly linkedSupplierOrder?: { readonly id: EntityId; readonly reference: string } | null;
  readonly linkedSupplierOrderLines?: readonly {
    readonly id: EntityId;
    readonly variantId: EntityId;
    readonly sku: string;
    readonly orderedQuantity: number;
    readonly receivedQuantity: number;
  }[];
  readonly linkStatus?: GoodsReceiptLinkStatus | null;
  readonly linkedPurchaseInvoice?: LinkedPurchaseInvoiceApiRow | null;
  readonly linkedGoodsReceipts?: readonly LinkedGoodsReceiptApiRow[] | null;
  readonly paymentInstallments?: readonly PaymentInstallmentApiRow[] | null;
  readonly attachments?: readonly DocumentAttachmentApiRow[];
}

export interface DocumentAttachmentApiRow {
  readonly id: EntityId;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly createdByName: string;
  readonly createdAt: IsoDateString;
}

/** Ordine cliente agganciato al documento (payload API, DDT vendita). */
export interface LinkedSalesOrderApiRow {
  readonly id: EntityId;
  readonly orderNumber: string;
  readonly cancelledAt?: IsoDateString | null;
  readonly fulfilledAt?: IsoDateString | null;
  readonly fulfillmentStatus?: string | null;
}

function mapLinkedSalesOrder(row: LinkedSalesOrderApiRow): LinkedSalesOrderInfo {
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    cancelledAt: row.cancelledAt ?? undefined,
    fulfilledAt: row.fulfilledAt ?? undefined,
    fulfillmentStatus: row.fulfillmentStatus ?? undefined,
  };
}

function mapLine(row: DocumentLineApiRow, currency: CurrencyCode): DocumentLine {
  return {
    id: row.id,
    lineNumber: row.lineNumber,
    variantId: row.variantId ?? undefined,
    sku: row.sku ?? undefined,
    description: row.description,
    quantity: row.quantity,
    unitPrice: { amountMinor: Number(row.unitPriceMinor), currencyCode: currency },
    discountPercent: Number(row.discountPercent),
    vatCodeId: row.vatCodeId ?? undefined,
    vatSnapshot: row.vatSnapshot ?? undefined,
    // ⛔ Qui c'era `Math.round(...)`, e la coda del costo moriva sull'ultimo
    // metro. La colonna è `NUMERIC(16,6)` in EURO, quindi il ponte a unità
    // minori è un ×100 che può lasciare una coda: 20,491803 EUR sono 2049,1803
    // centesimi, e arrotondarli a 2049 rimostra 24,99 dove l'operatore aveva
    // digitato 25,00 ivati. `toStorableMinor` riduce la coda a quello che il
    // contratto conserva, senza buttarla via. (regole-gestionale)
    enteredUnitCostMinor:
      row.enteredUnitCost != null ? toStorableMinor(Number(row.enteredUnitCost) * 100) : undefined,
    lineTotal: { amountMinor: row.lineTotalMinor, currencyCode: currency },
    unitOfMeasure: row.unitOfMeasure ?? undefined,
    variantLabel: row.variantLabel ?? undefined,
    loadsStock: row.loadsStock,
    isReference: row.isReference === true,
    supplierOrderLineId: row.supplierOrderLineId ?? undefined,
    lotCode: row.lotCode ?? undefined,
    lotExpiryDate: row.lotExpiryDate ?? undefined,
    serialNumbers: row.serialNumbers ?? undefined,
    linkedGoodsReceiptId: row.linkedGoodsReceiptId ?? undefined,
    lineVatTotal:
      row.lineVatTotalMinor != null
        ? { amountMinor: row.lineVatTotalMinor, currencyCode: currency }
        : undefined,
    lineSource: row.lineSource ?? undefined,
  };
}

function mapLinkedPurchaseInvoice(row: LinkedPurchaseInvoiceApiRow): LinkedPurchaseInvoiceInfo {
  return {
    id: row.id,
    reference: row.reference ?? undefined,
    externalDocNumber: row.externalDocNumber ?? undefined,
    externalDocDate: row.externalDocDate ?? undefined,
    documentDate: row.documentDate,
    totalsCheckPending: row.totalsCheckPending ?? false,
  };
}

export function mapVatBreakdown(
  entries: readonly VatBreakdownApiEntry[] | null | undefined,
  currency: CurrencyCode,
): readonly GoodsReceiptVatBreakdownEntry[] | undefined {
  return entries?.map((entry) => ({
    ratePercent: entry.ratePercent,
    net: { amountMinor: entry.netMinor, currencyCode: currency },
    vat: { amountMinor: entry.vatMinor, currencyCode: currency },
  }));
}

function mapLinkedGoodsReceipt(
  row: LinkedGoodsReceiptApiRow,
  currency: CurrencyCode,
): LinkedGoodsReceiptInfo {
  return {
    id: row.id,
    number: row.number ?? undefined,
    reference: row.reference ?? undefined,
    documentDate: row.documentDate,
    causalText: row.causalText ?? undefined,
    subtotal: { amountMinor: row.subtotalMinor, currencyCode: currency },
    tax: { amountMinor: row.taxMinor, currencyCode: currency },
    total: { amountMinor: row.totalMinor, currencyCode: currency },
    vatBreakdown: mapVatBreakdown(row.vatBreakdown, currency),
  };
}

function mapPaymentInstallment(
  row: PaymentInstallmentApiRow,
  currency: CurrencyCode,
): DocumentPaymentInstallment {
  return {
    id: row.id,
    position: row.position,
    dueDate: row.dueDate,
    amount: { amountMinor: row.amountMinor, currencyCode: currency },
    settled: row.settled,
    settledAt: row.settledAt ?? undefined,
  };
}

function mapAttachment(row: DocumentAttachmentApiRow): DocumentAttachment {
  return {
    id: row.id,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    createdByName: row.createdByName,
    createdAt: row.createdAt,
  };
}

export function mapDocumentApiRow(row: DocumentApiRow): DocumentRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    type: row.type,
    status: row.status,
    series: row.series,
    number: row.number ?? undefined,
    year: row.year,
    reference: row.reference ?? undefined,
    documentDate: row.documentDate,
    registrationDate: row.registrationDate ?? undefined,
    printTitle: row.printTitle ?? undefined,
    notes: row.notes ?? undefined,
    internalComment: row.internalComment ?? undefined,
    supplierId: row.supplierId ?? undefined,
    supplierName: row.supplierName ?? undefined,
    supplierCode: row.supplierCode ?? undefined,
    customerId: row.customerId ?? undefined,
    customerName: row.customerName ?? undefined,
    customerCode: row.customerCode ?? undefined,
    locationId: row.locationId ?? undefined,
    locationName: row.locationName ?? undefined,
    targetLocationId: row.targetLocationId ?? undefined,
    adjustmentDirection: row.adjustmentDirection ?? undefined,
    externalDocNumber: row.externalDocNumber ?? undefined,
    externalDocDate: row.externalDocDate ?? undefined,
    externallyIssuedAt: row.externallyIssuedAt ?? undefined,
    externalRef: row.externalRef ?? undefined,
    sourceDocumentId: row.sourceDocumentId ?? undefined,
    billingCause: row.billingCause ?? undefined,
    paymentTerms: row.paymentTerms ?? undefined,
    paymentMethod: row.paymentMethod ?? undefined,
    paymentMethodNote: row.paymentMethodNote ?? undefined,
    expectedDeliveryDate: row.expectedDeliveryDate ?? undefined,
    followedBySalesDoc: row.followedBySalesDoc ?? undefined,
    transportCausal: row.transportCausal ?? undefined,
    transportStartAt: row.transportStartAt ?? undefined,
    transportPort: row.transportPort ?? undefined,
    transportCarrier: row.transportCarrier ?? undefined,
    transportPackagesCount: row.transportPackagesCount ?? undefined,
    transportWeight: row.transportWeight ?? undefined,
    transportGoodsAspect: row.transportGoodsAspect ?? undefined,
    transportShippingCode: row.transportShippingCode ?? undefined,
    transportTrackingCode: row.transportTrackingCode ?? undefined,
    recipientAddress: row.recipientAddress ?? undefined,
    destinationAddress: row.destinationAddress ?? undefined,
    causalText: row.causalText ?? undefined,
    causalGenerationMode:
      (row.causalGenerationMode as CausalGenerationMode | null | undefined) ?? undefined,
    causalTemplateSnapshot: row.causalTemplateSnapshot ?? undefined,
    externalDocumentTypeId: row.externalDocumentTypeId ?? undefined,
    externalDocumentTypeSnapshot: row.externalDocumentTypeSnapshot ?? undefined,
    currency: row.currency,
    subtotal: { amountMinor: row.subtotalMinor, currencyCode: row.currency },
    tax: { amountMinor: row.taxMinor, currencyCode: row.currency },
    total: { amountMinor: row.totalMinor, currencyCode: row.currency },
    outstanding:
      row.outstandingMinor != null
        ? { amountMinor: row.outstandingMinor, currencyCode: row.currency }
        : undefined,
    documentDiscountPercent: Number(row.documentDiscountPercent ?? 0),
    pricesIncludeVat: row.pricesIncludeVat,
    purchaseCostEntryMode: row.purchaseCostEntryMode ?? undefined,
    createdByName: row.createdByName,
    confirmedAt: row.confirmedAt ?? undefined,
    cancelledAt: row.cancelledAt ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lines: row.lines?.map((line) => mapLine(line, row.currency)),
    lineCount: row.lineCount,
    sourceDocument: row.sourceDocument ?? undefined,
    derivedDocuments: row.derivedDocuments ?? undefined,
    linkedSalesOrder: row.salesOrder ?? undefined,
    linkedSalesOrders: row.linkedSalesOrders?.map(mapLinkedSalesOrder),
    linkedSupplierOrder: row.linkedSupplierOrder ?? row.supplierOrder ?? undefined,
    linkedSupplierOrderLines: row.linkedSupplierOrderLines,
    linkStatus: row.linkStatus ?? undefined,
    linkedPurchaseInvoice: row.linkedPurchaseInvoice
      ? mapLinkedPurchaseInvoice(row.linkedPurchaseInvoice)
      : undefined,
    linkedGoodsReceipts: row.linkedGoodsReceipts?.map((receipt) =>
      mapLinkedGoodsReceipt(receipt, row.currency),
    ),
    paymentInstallments: row.paymentInstallments?.map((installment) =>
      mapPaymentInstallment(installment, row.currency),
    ),
    attachments: row.attachments?.map(mapAttachment),
  };
}

export function mapDocumentTypeSettingApiRow(row: DocumentTypeSetting): DocumentTypeSetting {
  return { ...row };
}

/** Riga documento in creazione/aggiornamento. */
export interface DocumentLineInputBody {
  /**
   * Id della riga già salvata, inviato solo in modifica: dice al server di
   * aggiornare QUELLA riga invece di cancellarla e ricrearne una nuova.
   * Assente = riga nuova. Preservare l'id è ciò che tiene agganciati alla riga
   * il movimento di magazzino e i seriali — `docs/09-specifica-movimenti-per-riga.md`.
   */
  readonly id?: EntityId;
  readonly variantId?: EntityId;
  readonly sku?: string;
  readonly description: string;
  readonly quantity: number;
  readonly unitPriceMinor?: number;
  readonly discountPercent?: number;
  /** LEGACY: il backend lo deriva dal Codice IVA; accettato per compatibilità. */
  readonly vatRatePercent?: number;
  readonly vatCodeId?: EntityId;
  /** Costo unitario digitato (unità minori) nella modalità costo del documento. */
  readonly enteredUnitCostMinor?: number;
  readonly unitOfMeasure?: string;
  /**
   * ⛔ **La variante NON viaggia in questo payload, ed è deliberato.**
   *
   * Su `document_lines` il salvataggio è un upsert per id, quindi il server
   * la compone da sé: prende le opzioni della variante e conserva l'etichetta
   * persistita se la riga porta ancora lo stesso articolo
   * (`document-line-variant-snapshot.util`). Mandarla anche dal client
   * creerebbe una **seconda fonte** per lo stesso dato — che è precisamente
   * il difetto che questa colonna elimina.
   *
   * ⚠️ Sull'**Ordine fornitore** è l'opposto, e non è un'incoerenza: là il
   * salvataggio è `deleteMany` + `create`, le righe perdono l'id e non esiste
   * un persistito da ritrovare — quindi la fotografa la maschera e viaggia nel
   * payload. La differenza sta nell'identità della riga, non nel gusto.
   */
  readonly loadsStock?: boolean;
  readonly isReference?: boolean;
  readonly supplierOrderLineId?: EntityId;
  readonly lotCode?: string;
  readonly lotExpiryDate?: IsoDateString;
  readonly serialNumbers?: readonly string[];
}

/** Body POST /documents. */
/**
 * Risposta del precompilato di conversione: il corpo di creazione **più il tipo
 * dell'origine**, che serve a comporre la riga di riferimento al predecessore.
 * Specchio di `ConvertPrefillDto` dell'API — e tipo a sé, perché quel campo non
 * deve mai diventare accettabile in ingresso.
 */
export interface ConvertPrefillBody extends CreateDocumentBody {
  readonly sourceDocumentType: DocumentType;
}

/**
 * Risposta del precompilato «Concludi ordine»: il corpo di creazione più numero
 * e data dell'ordine, che servono a comporre la riga di riferimento.
 */
export interface ConcludePrefillBody extends CreateDocumentBody {
  readonly sourceSalesOrderNumber: string;
  readonly sourceSalesOrderPlacedAt: IsoDateString;
}

export interface CreateDocumentBody {
  readonly type: DocumentType;
  readonly series?: string;
  /** Numero imposto in testata: assente = primo libero della serie. */
  readonly number?: number;
  readonly documentDate: IsoDateString;
  readonly supplierId?: EntityId;
  readonly customerId?: EntityId;
  /**
   * Cliente a testo libero (Scarico manuale): usato solo senza customerId —
   * snapshot per la stampa, mai salvato in anagrafica.
   */
  readonly customerName?: string;
  readonly locationId?: EntityId;
  readonly targetLocationId?: EntityId;
  readonly adjustmentDirection?: AdjustmentDirection;
  readonly currency?: CurrencyCode;
  readonly notes?: string;
  readonly internalComment?: string;
  readonly externalDocNumber?: string;
  readonly externalDocDate?: IsoDateString;
  /**
   * Tipo del documento della controparte. Omesso lascia il valore invariato,
   * `null` lo toglie: l'API distingue i due casi apposta, cosi' un salvataggio
   * che non nomina il campo non puo' cancellare lo snapshot del documento.
   */
  readonly externalDocumentTypeId?: EntityId | null;
  readonly sourceDocumentId?: EntityId;
  readonly supplierOrderId?: EntityId;
  readonly billingCause?: string;
  readonly externalRef?: string;
  readonly documentDiscountPercent?: number;
  /** Modalità prezzo del documento (netto/ivato): true = prezzi riga IVA inclusa. */
  readonly pricesIncludeVat?: boolean;
  /** Condizioni di pagamento in testata (Preventivo: campo «Pagamento»). */
  readonly paymentTerms?: string;
  /** Modalità di pagamento (DDT vendita: voce normativa MP01–MP23). */
  readonly paymentMethod?: string;
  /** Data prevista consegna (Preventivo: campo «Consegna prevista»). */
  readonly expectedDeliveryDate?: IsoDateString;
  // ── DDT vendita: testata operativa (prompt DDT) ──
  readonly followedBySalesDoc?: boolean;
  readonly transportCausal?: string;
  readonly transportStartAt?: IsoDateString;
  readonly transportPort?: TransportPort;
  readonly transportCarrier?: string;
  readonly transportPackagesCount?: number;
  readonly transportWeight?: string;
  readonly transportGoodsAspect?: string;
  readonly transportShippingCode?: string;
  readonly transportTrackingCode?: string;
  readonly recipientAddress?: DocumentAddress;
  readonly destinationAddress?: DocumentAddress;
  /** Ordini cliente inclusi nel DDT vendita (aggancio, prompt DDT). */
  readonly includedSalesOrderIds?: readonly EntityId[];
  readonly lines?: readonly DocumentLineInputBody[];
}

/** Campi di testata svuotabili con null nel PATCH (vedi UpdateDocumentBody). */
type NullableUpdateHeaderField =
  | 'customerId'
  | 'customerName'
  | 'externalRef'
  // Documento della controparte: una volta compilato dev'essere anche
  // cancellabile. Senza `null` il PATCH non ha modo di dire «svuota», e la data
  // resterebbe appiccicata al documento per sempre.
  | 'externalDocNumber'
  | 'externalDocDate'
  | 'paymentTerms'
  | 'paymentMethod'
  | 'expectedDeliveryDate'
  | 'transportCausal'
  | 'transportStartAt'
  | 'transportPort'
  | 'transportCarrier'
  | 'transportPackagesCount'
  | 'transportWeight'
  | 'transportGoodsAspect'
  | 'transportShippingCode'
  | 'transportTrackingCode'
  | 'recipientAddress'
  | 'destinationAddress';

/**
 * Body PATCH /documents/:id (bozze e documenti confermati editabili).
 * I campi liberi di testata accettano anche null: il PATCH distingue
 * «non toccare» (assente) da «svuota» (null) — usato dal form Preventivo
 * e dal DDT vendita.
 */
export type UpdateDocumentBody = Partial<
  Omit<CreateDocumentBody, 'type' | NullableUpdateHeaderField>
> & {
  readonly [K in NullableUpdateHeaderField]?: CreateDocumentBody[K] | null;
};

/**
 * Nuova anagrafica da creare atomicamente con la riga (punto A): il backend
 * crea Product + variante NELLA STESSA transazione del documento. Serializzata
 * solo sui gesti espliciti (mai in autosave passivo, punto C).
 */
export interface SaveGoodsReceiptNewProductBody {
  readonly name: string;
  readonly sku?: string;
  readonly barcode?: string;
  readonly sellingPriceMinor?: number;
  readonly compareAtPriceMinor?: number;
  readonly purchasePriceMinor?: number;
  readonly vatCodeId?: EntityId;
  /** False = articolo non gestito a magazzino: riga solo economica (punto B). */
  readonly managesStock?: boolean;
  /** Unità di misura del nuovo articolo (es. pz, kg); assente = default pz. */
  readonly unitOfMeasure?: string;
}

/** Riga Arrivo merce in salvataggio unico: id presente = riga già salvata. */
export interface SaveGoodsReceiptLineBody extends DocumentLineInputBody {
  readonly id?: EntityId;
  readonly newProduct?: SaveGoodsReceiptNewProductBody;
}

/**
 * Articolo creato atomicamente dal salvataggio (punto A): `lineIndex` è la
 * posizione della riga nel payload inviato, usata per riadottare
 * variantId/sku anche per le creazioni solo-anagrafica (quantità 0).
 */
export interface GoodsReceiptCreatedProductApiRow {
  readonly lineIndex: number;
  readonly productId: EntityId;
  readonly variantId: EntityId;
  readonly sku?: string | null;
  readonly barcode?: string | null;
}

/** Body POST /documents/goods-receipt/save (prompt §2.1). */
export interface SaveGoodsReceiptBody {
  readonly id?: EntityId;
  readonly type: DocumentType;
  readonly series?: string;
  /** Numero interno imposto: assente = primo libero della serie. */
  readonly number?: number;
  readonly documentDate: IsoDateString;
  readonly supplierId?: EntityId;
  readonly locationId?: EntityId;
  readonly causalText?: string;
  readonly causalGenerationMode?: CausalGenerationMode;
  readonly causalTemplateSnapshot?: string;
  readonly externalDocumentTypeId?: EntityId;
  readonly externalDocNumber?: string;
  readonly externalDocDate?: IsoDateString;
  readonly notes?: string;
  readonly internalComment?: string;
  readonly billingCause?: string;
  /** Modalità di pagamento (precompilata dal fornitore, modificabile). */
  readonly paymentMethod?: string;
  readonly supplierOrderId?: EntityId;
  readonly currency?: CurrencyCode;
  readonly documentDiscountPercent?: number;
  /** Modalità costi del documento: netti o ivati (§11.1). */
  readonly purchaseCostEntryMode?: PurchaseCostEntryMode;
  readonly lines?: readonly SaveGoodsReceiptLineBody[];
  /**
   * Spunta per-documento: il costo digitato sulla riga diventa il costo
   * dell'articolo in anagrafica, **riga per riga**.
   *
   * ⛔ Spenta, in anagrafica non va nulla: il costo resta un dato del DOCUMENTO,
   * per report e contabilità. L'ultimo prezzo pagato al fornitore si aggiorna
   * comunque — non è anagrafica, è il rapporto col fornitore (03b).
   */
  readonly updateArticleCost?: boolean;
}

/**
 * Riga Trasferimento/Rettifica in salvataggio dedicato: l'id è presente per
 * le righe già salvate, preservarlo è essenziale per aggiornare il movimento
 * collegato invece di crearne uno nuovo (mirror SaveGoodsReceiptLineBody).
 */
export interface SaveTransferOrAdjustmentLineBody {
  readonly id?: EntityId;
  readonly variantId?: EntityId;
  readonly sku?: string;
  readonly description: string;
  readonly quantity: number;
  readonly loadsStock?: boolean;
  readonly serialNumbers?: readonly string[];
}

/**
 * Body POST /documents/transfer/save. Riservato alla modifica di un
 * Trasferimento GIÀ CONFERMATO (mirror goods-receipt/save, ma solo per
 * l'edit: creazione e prima conferma restano sul flusso generico).
 */
export interface SaveTransferBody {
  readonly id: EntityId;
  /** Numero imposto in testata (flusso generico): ignorato dai salvataggi dedicati. */
  readonly number?: number;
  readonly series?: string;
  readonly documentDate: IsoDateString;
  readonly locationId: EntityId;
  readonly targetLocationId: EntityId;
  // ── Documento della controparte ──
  readonly externalDocumentTypeId?: EntityId | null;
  readonly externalDocNumber?: string;
  readonly externalDocDate?: IsoDateString;
  readonly notes?: string;
  readonly internalComment?: string;
  readonly lines?: readonly SaveTransferOrAdjustmentLineBody[];
}

/**
 * Body POST /documents/adjustment/save. Riservato alla modifica di una
 * Rettifica GIÀ CONFERMATA (mirror goods-receipt/save, ma solo per l'edit).
 */
export interface SaveAdjustmentBody {
  readonly id: EntityId;
  /** Numero imposto in testata (flusso generico): ignorato dai salvataggi dedicati. */
  readonly number?: number;
  readonly series?: string;
  readonly documentDate: IsoDateString;
  readonly locationId: EntityId;
  readonly adjustmentDirection: AdjustmentDirection;
  // ── Documento della controparte ──
  readonly externalDocumentTypeId?: EntityId | null;
  readonly externalDocNumber?: string;
  readonly externalDocDate?: IsoDateString;
  readonly notes?: string;
  readonly internalComment: string;
  readonly lines?: readonly SaveTransferOrAdjustmentLineBody[];
}

/**
 * Riga economica della Registrazione fattura fornitore.
 *
 * ⛔ Si chiamava `PurchaseInvoiceManualLineBody` e copriva le sole voci libere:
 * le righe che venivano dagli arrivi non passavano di qui, perche' il server se
 * le ricalcolava da solo a ogni salvataggio. Erano DUE liste, e una delle due
 * non si poteva correggere — proprio quella che quasi mai coincide al centesimo
 * con la fattura che il fornitore ha davvero mandato.
 */
export interface PurchaseInvoiceLineBody {
  /**
   * L'id della riga già salvata. Assente = riga nuova.
   *
   * ⭐ È ciò che fa sopravvivere l'identità al risalvataggio: senza, il server
   * cancellava tutte le righe e le riscriveva, e l'id cambiava anche per la
   * riga che nessuno aveva toccato. È il prerequisito del Codice IVA.
   */
  readonly id?: EntityId;
  readonly description: string;
  readonly netMinor: number;
  /**
   * L'aliquota. Resta il veicolo per le righe senza Codice IVA — e oggi lo sono
   * TUTTE quelle salvate prima del 25/08/2026.
   */
  readonly vatRatePercent: number;
  readonly vatMinor: number;
  /**
   * Il Codice IVA della riga, **solo se dichiarato**.
   *
   * ⭐ Contratto binario: su una riga esistente, assente significa «non l'ho
   * modificato» e il server conserva codice e snapshot persistiti. Rimandare
   * sempre quello letto all'apertura ri-prezzerebbe una fattura vecchia il
   * giorno in cui quell'aliquota cambia.
   */
  readonly vatCodeId?: EntityId;
  /**
   * L'arrivo merce da cui la riga e' nata. Assente = voce libera.
   *
   * ⭐ E' l'UNICA fonte del collegamento: cancellate tutte le righe di un
   * arrivo, l'arrivo si scollega da se'.
   */
  readonly linkedGoodsReceiptId?: EntityId;
}

/** Scadenza di pagamento in salvataggio. */
export interface PurchaseInvoiceInstallmentBody {
  readonly dueDate: IsoDateString;
  readonly amountMinor: number;
  readonly settled?: boolean;
  readonly settledAt?: IsoDateString;
}

/** Body POST /documents/purchase-invoice/save (prompt §5-6). */
export interface SavePurchaseInvoiceBody {
  readonly id?: EntityId;
  readonly supplierId: EntityId;
  /** Data documento: data della fattura ricevuta dal fornitore. */
  readonly documentDate: IsoDateString;
  /** Data registrazione interna (default oggi, modificabile). */
  readonly registrationDate?: IsoDateString;
  /** Numero interno imposto: assente = primo libero della serie. */
  readonly number?: number;
  readonly series?: string;
  readonly externalDocNumber?: string;
  readonly externalDocDate?: IsoDateString;
  /** Tipo del documento della controparte (proposto: «Fattura»). */
  readonly externalDocumentTypeId?: EntityId | null;
  readonly notes?: string;
  readonly internalComment?: string;
  /** Tipo pagamento (auto-compilato dall'anagrafica fornitore, modificabile). */
  readonly paymentMethod?: string;
  /** Indirizzi: snapshot anagrafica fornitore, modificabile per eccezioni. */
  readonly recipientAddress?: DocumentAddress;
  readonly currency?: CurrencyCode;
  /** Totali legacy: ignorati se la registrazione ha righe. */
  readonly totalMinor?: number;
  readonly subtotalMinor?: number;
  readonly taxMinor?: number;
  // ⛔ Qui c'era `goodsReceiptIds`: l'elenco degli arrivi inclusi, tenuto a
  // parte dalle righe. Tolto il 25/08/2026 — il legame vive sulle righe.
  readonly lines?: readonly PurchaseInvoiceLineBody[];
  readonly installments?: readonly PurchaseInvoiceInstallmentBody[];
}

/** Riga GET /documents/linkable-goods-receipts (payload API). */
export interface LinkableGoodsReceiptApiRow {
  readonly id: EntityId;
  readonly number?: number | null;
  readonly reference?: string | null;
  readonly documentDate: IsoDateString;
  readonly causalText?: string | null;
  readonly internalComment?: string | null;
  readonly subtotalMinor: number;
  readonly taxMinor: number;
  readonly totalMinor: number;
  readonly currency: CurrencyCode;
  readonly locationName?: string | null;
  readonly vatBreakdown?: readonly VatBreakdownApiEntry[] | null;
}
