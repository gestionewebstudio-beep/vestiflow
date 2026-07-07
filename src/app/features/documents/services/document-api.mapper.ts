import type { CurrencyCode, EntityId, IsoDateString } from '@core/models/common.model';
import type {
  AdjustmentDirection,
  DocumentAttachment,
  DocumentLine,
  DocumentRecord,
  DocumentStatus,
  DocumentType,
  DocumentTypeSetting,
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
  readonly lineTotalMinor: number;
  readonly loadsStock: boolean;
  readonly supplierOrderLineId?: EntityId | null;
  readonly lotCode?: string | null;
  readonly lotExpiryDate?: IsoDateString | null;
  readonly serialNumbers?: readonly string[] | null;
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
  readonly currency: CurrencyCode;
  readonly subtotalMinor: number;
  readonly taxMinor: number;
  readonly totalMinor: number;
  readonly pricesIncludeVat: boolean;
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
    lineTotal: { amountMinor: row.lineTotalMinor, currencyCode: currency },
    loadsStock: row.loadsStock,
    supplierOrderLineId: row.supplierOrderLineId ?? undefined,
    lotCode: row.lotCode ?? undefined,
    lotExpiryDate: row.lotExpiryDate ?? undefined,
    serialNumbers: row.serialNumbers ?? undefined,
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
    currency: row.currency,
    subtotal: { amountMinor: row.subtotalMinor, currencyCode: row.currency },
    tax: { amountMinor: row.taxMinor, currencyCode: row.currency },
    total: { amountMinor: row.totalMinor, currencyCode: row.currency },
    pricesIncludeVat: row.pricesIncludeVat,
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
  readonly vatRatePercent?: number;
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
  readonly lines?: readonly DocumentLineInputBody[];
}

/** Body PATCH /documents/:id (bozze e documenti confermati editabili). */
export type UpdateDocumentBody = Partial<Omit<CreateDocumentBody, 'type'>>;
