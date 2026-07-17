// «Includi documento» trasversale: mappa compatibilità e normalizzazione
// delle righe del documento di origine verso il documento corrente.
//
// Mappa compatibilità (per ora):
// - Ordine cliente: può includere da Preventivo.
// - DDT vendita: può includere da Preventivo e da Ordine cliente.
// - Preventivo: non include da nessun documento (si crea sempre da zero).
//
// L'inclusione inserisce una riga di testo descrittiva con il riferimento al
// documento di origine (es. «Rif. Preventivo PRE-2026-0001 del 17/07/2026»)
// seguita dalle righe articolo copiate; i dati di testata restano quelli del
// documento corrente.

import type { EntityId, IsoDateString } from '@core/models/common.model';
import { DocumentType } from '@core/models/document.model';
import type { DocumentRecord } from '@core/models/document.model';
import type { SalesOrder } from '@core/models/sales-order.model';

/** Tipo di documento di origine includibile. */
export const IncludeSourceKind = {
  Quote: 'quote',
  CustomerOrder: 'customer_order',
} as const;
export type IncludeSourceKind = (typeof IncludeSourceKind)[keyof typeof IncludeSourceKind];

export const INCLUDE_SOURCE_LABELS: Readonly<Record<IncludeSourceKind, string>> = {
  [IncludeSourceKind.Quote]: 'Preventivo',
  [IncludeSourceKind.CustomerOrder]: 'Ordine cliente',
};

/** Sorgenti includibili nell'Ordine cliente manuale (maschera /app/sales). */
export const CUSTOMER_ORDER_INCLUDE_SOURCES: readonly IncludeSourceKind[] = [
  IncludeSourceKind.Quote,
];

/** Sorgenti includibili in un documento del registro, per tipo. */
export function includeSourceKindsForDocumentType(
  type: DocumentType,
): readonly IncludeSourceKind[] {
  if (type === DocumentType.SalesDdt) {
    return [IncludeSourceKind.Quote, IncludeSourceKind.CustomerOrder];
  }
  return [];
}

/** Riga articolo normalizzata, pronta per l'inserimento nel documento target. */
export interface IncludedDocumentLine {
  readonly variantId?: EntityId;
  readonly sku?: string;
  readonly barcode?: string;
  readonly description: string;
  readonly quantity: number;
  readonly unitPriceMinor: number;
  /** Sconto riga nella notazione di origine (es. "10%", "4+10%") o vuoto. */
  readonly discount: string;
  readonly vatCodeId?: EntityId;
}

export interface IncludedDocumentPayload {
  readonly kind: IncludeSourceKind;
  readonly sourceId: EntityId;
  /** Riga descrittiva, es. «Rif. Preventivo PRE-2026-0001 del 17/07/2026». */
  readonly referenceText: string;
  readonly lines: readonly IncludedDocumentLine[];
}

// Data numerica come nell'esempio della specifica («del 17/07/2026»).
const NUMERIC_DATE_FORMAT = new Intl.DateTimeFormat('it-IT', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

export function includeReferenceText(
  kind: IncludeSourceKind,
  reference: string | undefined,
  documentDate: IsoDateString,
): string {
  const label = INCLUDE_SOURCE_LABELS[kind];
  const ref = reference?.trim();
  const date = NUMERIC_DATE_FORMAT.format(new Date(documentDate));
  return ref ? `Rif. ${label} ${ref} del ${date}` : `Rif. ${label} del ${date}`;
}

/** Payload di inclusione da un Preventivo (documento del registro). */
export function includedPayloadFromQuote(doc: DocumentRecord): IncludedDocumentPayload {
  return {
    kind: IncludeSourceKind.Quote,
    sourceId: doc.id,
    referenceText: includeReferenceText(IncludeSourceKind.Quote, doc.reference, doc.documentDate),
    lines: (doc.lines ?? []).map((line) => ({
      variantId: line.variantId,
      sku: line.sku,
      description: line.description,
      quantity: line.quantity,
      unitPriceMinor: line.unitPrice.amountMinor,
      discount: line.discountPercent > 0 ? `${line.discountPercent}%` : '',
      vatCodeId: line.vatCodeId,
    })),
  };
}

/** Payload di inclusione da un Ordine cliente manuale. */
export function includedPayloadFromSalesOrder(order: SalesOrder): IncludedDocumentPayload {
  return {
    kind: IncludeSourceKind.CustomerOrder,
    sourceId: order.id,
    referenceText: includeReferenceText(
      IncludeSourceKind.CustomerOrder,
      order.orderNumber,
      order.placedAt,
    ),
    lines: order.lines.map((line) => ({
      variantId: line.variantId,
      sku: line.sku || undefined,
      barcode: line.barcode,
      description: line.title,
      quantity: line.quantity,
      unitPriceMinor: line.unitPrice.amountMinor,
      discount: line.discount?.trim() ?? '',
      vatCodeId: line.vatCodeId,
    })),
  };
}
