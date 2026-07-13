import type { CurrencyCode, EntityId, IsoDateString } from '@core/models/common.model';
import type { PurchaseCostEntryMode, VatSnapshot } from '@core/models/vat-code.model';
import type {
  AdjustmentDirection,
  CausalGenerationMode,
  DocumentAttachment,
  DocumentLine,
  DocumentRecord,
  DocumentStatus,
  DocumentType,
  DocumentTypeSetting,
  GoodsReceiptLinkStatus,
  LinkedGoodsReceiptInfo,
  LinkedPurchaseInvoiceInfo,
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
  readonly vatRatePercent?: number | null;
  readonly vatCodeId?: EntityId | null;
  readonly vatSnapshot?: VatSnapshot | null;
  /** Costo digitato (Decimal serializzato come stringa dal backend). */
  readonly enteredUnitCost?: string | number | null;
  readonly lineTotalMinor: number;
  readonly loadsStock: boolean;
  readonly supplierOrderLineId?: EntityId | null;
  readonly lotCode?: string | null;
  readonly lotExpiryDate?: IsoDateString | null;
  readonly serialNumbers?: readonly string[] | null;
  readonly linkedGoodsReceiptId?: EntityId | null;
}

/** Fattura registrata collegata a un arrivo merce (payload API). */
export interface LinkedPurchaseInvoiceApiRow {
  readonly id: EntityId;
  readonly reference?: string | null;
  readonly externalDocNumber?: string | null;
  readonly externalDocDate?: IsoDateString | null;
  readonly documentDate: IsoDateString;
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
  readonly customerId?: EntityId | null;
  readonly customerName?: string | null;
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
  readonly causalText?: string | null;
  readonly causalGenerationMode?: string | null;
  readonly causalTemplateSnapshot?: string | null;
  readonly externalDocumentTypeId?: EntityId | null;
  readonly externalDocumentTypeSnapshot?: string | null;
  readonly currency: CurrencyCode;
  readonly subtotalMinor: number;
  readonly taxMinor: number;
  readonly totalMinor: number;
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
    vatRatePercent: row.vatRatePercent ?? undefined,
    vatCodeId: row.vatCodeId ?? undefined,
    vatSnapshot: row.vatSnapshot ?? undefined,
    enteredUnitCostMinor:
      row.enteredUnitCost != null ? Math.round(Number(row.enteredUnitCost) * 100) : undefined,
    lineTotal: { amountMinor: row.lineTotalMinor, currencyCode: currency },
    loadsStock: row.loadsStock,
    supplierOrderLineId: row.supplierOrderLineId ?? undefined,
    lotCode: row.lotCode ?? undefined,
    lotExpiryDate: row.lotExpiryDate ?? undefined,
    serialNumbers: row.serialNumbers ?? undefined,
    linkedGoodsReceiptId: row.linkedGoodsReceiptId ?? undefined,
  };
}

function mapLinkedPurchaseInvoice(row: LinkedPurchaseInvoiceApiRow): LinkedPurchaseInvoiceInfo {
  return {
    id: row.id,
    reference: row.reference ?? undefined,
    externalDocNumber: row.externalDocNumber ?? undefined,
    externalDocDate: row.externalDocDate ?? undefined,
    documentDate: row.documentDate,
  };
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
    customerId: row.customerId ?? undefined,
    customerName: row.customerName ?? undefined,
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
    linkedSupplierOrder: row.linkedSupplierOrder ?? row.supplierOrder ?? undefined,
    linkedSupplierOrderLines: row.linkedSupplierOrderLines,
    linkStatus: row.linkStatus ?? undefined,
    linkedPurchaseInvoice: row.linkedPurchaseInvoice
      ? mapLinkedPurchaseInvoice(row.linkedPurchaseInvoice)
      : undefined,
    linkedGoodsReceipts: row.linkedGoodsReceipts?.map((receipt) =>
      mapLinkedGoodsReceipt(receipt, row.currency),
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
  readonly lines?: readonly DocumentLineInputBody[];
}

/** Body PATCH /documents/:id (bozze e documenti confermati editabili). */
export type UpdateDocumentBody = Partial<Omit<CreateDocumentBody, 'type'>>;

/** Riga Arrivo merce in salvataggio unico: id presente = riga già salvata. */
export interface SaveGoodsReceiptLineBody extends DocumentLineInputBody {
  readonly id?: EntityId;
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
  readonly supplierOrderId?: EntityId;
  readonly currency?: CurrencyCode;
  readonly documentDiscountPercent?: number;
  /** Modalità costi del documento: netti o ivati (§11.1). */
  readonly purchaseCostEntryMode?: PurchaseCostEntryMode;
  readonly lines?: readonly SaveGoodsReceiptLineBody[];
  readonly applySupplierPriceUpdates?: boolean;
}

/** Body POST /documents/purchase-invoice/save (prompt §5-6). */
export interface SavePurchaseInvoiceBody {
  readonly id?: EntityId;
  readonly supplierId: EntityId;
  readonly documentDate: IsoDateString;
  readonly externalDocNumber?: string;
  readonly externalDocDate?: IsoDateString;
  readonly notes?: string;
  readonly internalComment?: string;
  readonly currency?: CurrencyCode;
  readonly totalMinor: number;
  readonly subtotalMinor?: number;
  readonly taxMinor?: number;
  readonly goodsReceiptIds?: readonly EntityId[];
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
}
