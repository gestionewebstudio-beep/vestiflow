import type { CurrencyCode, EntityId, IsoDateString } from '@core/models/common.model';
import type { PurchaseCostEntryMode, VatSnapshot } from '@core/models/vat-code.model';
import type {
  AdjustmentDirection,
  CausalGenerationMode,
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
  readonly discountPercent: number;
  readonly vatCodeId?: EntityId | null;
  readonly vatSnapshot?: VatSnapshot | null;
  /** Costo digitato (Decimal serializzato come stringa dal backend). */
  readonly enteredUnitCost?: string | number | null;
  readonly lineTotalMinor: number;
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
  readonly blockAfterConfirm?: boolean;
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
    unitPrice: { amountMinor: row.unitPriceMinor, currencyCode: currency },
    discountPercent: row.discountPercent,
    vatCodeId: row.vatCodeId ?? undefined,
    vatSnapshot: row.vatSnapshot ?? undefined,
    enteredUnitCostMinor:
      row.enteredUnitCost != null ? Math.round(Number(row.enteredUnitCost) * 100) : undefined,
    lineTotal: { amountMinor: row.lineTotalMinor, currencyCode: currency },
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
    documentDiscountPercent: row.documentDiscountPercent ?? 0,
    pricesIncludeVat: row.pricesIncludeVat,
    purchaseCostEntryMode: row.purchaseCostEntryMode ?? undefined,
    createdByName: row.createdByName,
    confirmedAt: row.confirmedAt ?? undefined,
    cancelledAt: row.cancelledAt ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lines: row.lines?.map((line) => mapLine(line, row.currency)),
    lineCount: row.lineCount,
    blockAfterConfirm: row.blockAfterConfirm,
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
  readonly loadsStock?: boolean;
  readonly isReference?: boolean;
  readonly supplierOrderLineId?: EntityId;
  readonly lotCode?: string;
  readonly lotExpiryDate?: IsoDateString;
  readonly serialNumbers?: readonly string[];
}

/** Body POST /documents. */
export interface CreateDocumentBody {
  readonly type: DocumentType;
  readonly series?: string;
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
  readonly sourceDocumentId?: EntityId;
  readonly supplierOrderId?: EntityId;
  readonly billingCause?: string;
  readonly externalRef?: string;
  readonly documentDiscountPercent?: number;
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
  readonly applySupplierPriceUpdates?: boolean;
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
  readonly documentDate: IsoDateString;
  readonly locationId: EntityId;
  readonly targetLocationId: EntityId;
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
  readonly documentDate: IsoDateString;
  readonly locationId: EntityId;
  readonly adjustmentDirection: AdjustmentDirection;
  readonly notes?: string;
  readonly internalComment: string;
  readonly lines?: readonly SaveTransferOrAdjustmentLineBody[];
}

/** Riga manuale della registrazione (voci non legate ad arrivi merce). */
export interface PurchaseInvoiceManualLineBody {
  readonly description: string;
  readonly netMinor: number;
  readonly vatRatePercent: number;
  readonly vatMinor: number;
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
  readonly externalDocNumber?: string;
  readonly externalDocDate?: IsoDateString;
  readonly notes?: string;
  readonly internalComment?: string;
  /** Tipo pagamento (auto-compilato dall'anagrafica fornitore, modificabile). */
  readonly paymentMethod?: string;
  /** Indirizzi: snapshot anagrafica fornitore, modificabile per eccezioni. */
  readonly recipientAddress?: DocumentAddress;
  readonly currency?: CurrencyCode;
  /** Totali legacy: ignorati se la registrazione ha righe (auto o manuali). */
  readonly totalMinor?: number;
  readonly subtotalMinor?: number;
  readonly taxMinor?: number;
  readonly goodsReceiptIds?: readonly EntityId[];
  readonly manualLines?: readonly PurchaseInvoiceManualLineBody[];
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
