// «Includi documento» trasversale: mappa compatibilità e normalizzazione
// delle righe del documento di origine verso il documento corrente.
//
// Mappa compatibilità (per ora):
// - Ordine cliente: può includere da Preventivo.
// - DDT vendita: può includere da Preventivo e da Ordine cliente.
// - Preventivo: non include da nessun documento (si crea sempre da zero).
// - Arrivo merce: può includere da Ordine Fornitore (solo Confermati).
//   L'inclusione è implementata nel form dedicato dell'Arrivo merce
//   (goods-receipt-form, pannello «Includi ordine» + ?supplierOrderId=…):
//   copia le righe residue e aggancia l'ordine, che al salvataggio diventa
//   Concluso con collegamento visibile in entrambi i documenti.
//
// L'inclusione inserisce una riga di testo descrittiva con il riferimento al
// documento di origine (es. «Rif. Preventivo PRE-2026-0001 del 17/07/2026»)
// seguita dalle righe articolo copiate; i dati di testata restano quelli del
// documento corrente.

import { formatDiscountPercent } from '@core/utils/discount-percent.util';
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

/**
 * Come si chiama un documento **dentro una riga di riferimento**, quando la
 * riga nasce da una CONVERSIONE (proforma/DDT → fattura/proforma).
 *
 * È una mappa a sé, e non `documentTypeLabel`, per due ragioni misurate:
 *
 * 1. le etichette generali della UI direbbero «DDT vendita», e il formato
 *    canonico delle reference è **«Rif. DDT 17 del …»** (`07` §12). Un
 *    formatter di interfaccia non deve riscrivere un testo storico;
 * 2. `IncludeSourceKind` **non** si poteva estendere: governa le linguette del
 *    pannello «Includi documento», e aggiungerci Proforma e DDT li renderebbe
 *    sorgenti includibili — un effetto che nessuno ha chiesto.
 *
 * Contiene **solo** i tipi che possono essere origine di conversione. Un tipo
 * assente non produce riga: è la stessa cautela dell'elenco includibili.
 */
const CONVERSION_SOURCE_LABELS: Readonly<Partial<Record<DocumentType, string>>> = {
  [DocumentType.Proforma]: 'Proforma',
  [DocumentType.SalesDdt]: 'DDT',
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
  /**
   * Riga di riferimento già presente nell'origine (accumulo progressivo, `07`
   * §12). **Va trasportata**: senza, una reference corretta a monte diventa una
   * riga ordinaria nel documento successivo, e da lì può entrare nei calcoli,
   * nell'IVA o nell'XML come se fosse un prodotto.
   */
  readonly isReference?: boolean;
}

export interface IncludedDocumentPayload {
  readonly kind: IncludeSourceKind;
  readonly sourceId: EntityId;
  /** Riferimento leggibile del documento di origine (es. «OC-2026-0001»). */
  readonly sourceReference?: string;
  /** Cliente del documento di origine (testata riportata se presente, DDT). */
  readonly sourceCustomerId?: EntityId;
  /** Condizioni di pagamento del documento di origine (testata riportata). */
  readonly sourcePaymentTerms?: string;
  /**
   * La riga di riferimento al documento incluso, gia' completa: testo, flag e
   * quantita'. Portava il solo testo, e ogni maschera ci aggiungeva il resto a
   * modo suo — una lo marcava, l'altra no (`07` §12).
   */
  readonly referenceLine: ReferenceLineSeed;
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
  return referenceText(INCLUDE_SOURCE_LABELS[kind], reference, documentDate);
}

/** La frase, una sola volta: «Rif. {cosa} {numero} del {data}». */
function referenceText(
  label: string,
  reference: string | undefined,
  documentDate: IsoDateString,
): string {
  const ref = reference?.trim();
  const date = NUMERIC_DATE_FORMAT.format(new Date(documentDate));
  return ref ? `Rif. ${label} ${ref} del ${date}` : `Rif. ${label} del ${date}`;
}

/**
 * La riga di riferimento **completa**, come va inserita in un documento.
 *
 * Perché è qui e non nelle maschere: il testo era già centralizzato, la riga
 * no — e l'Ordine cliente se la componeva per conto suo, con una seconda copia
 * del formato (`conversionReferenceText`, rimossa). Aggiungere il terzo tipo a
 * una logica già doppia l'avrebbe triplicata (`07` §12).
 *
 * `quantity: 0` è la rappresentazione tecnica di «nessuna quantità» — deciso il
 * 16/08 per non rendere nullable una colonna che tutto il resto legge come
 * numero certo. ⚠️ **Non è la protezione**: i consumer economici e fisici
 * devono guardare `isReference`, non lo zero. Uno zero regge finché nessuno
 * scrive, e non dichiara niente a chi legge il codice.
 */
export interface ReferenceLineSeed {
  readonly description: string;
  readonly isReference: true;
  readonly quantity: 0;
}

function referenceLineSeed(
  label: string,
  reference: string | undefined,
  documentDate: IsoDateString,
): ReferenceLineSeed {
  return {
    description: referenceText(label, reference, documentDate),
    isReference: true,
    quantity: 0,
  };
}

/** Riga di riferimento al documento incluso («Includi documento»). */
export function includeReferenceLine(
  kind: IncludeSourceKind,
  reference: string | undefined,
  documentDate: IsoDateString,
): ReferenceLineSeed {
  return referenceLineSeed(INCLUDE_SOURCE_LABELS[kind], reference, documentDate);
}

/**
 * Riga di riferimento al predecessore diretto, quando un documento **nasce da**
 * un altro (conversione). `null` se quel tipo non è origine di conversione:
 * meglio nessuna riga che una riga con un'etichetta inventata.
 */
export function conversionReferenceLine(
  sourceType: DocumentType,
  reference: string | undefined,
  documentDate: IsoDateString,
): ReferenceLineSeed | null {
  const label = CONVERSION_SOURCE_LABELS[sourceType];
  return label ? referenceLineSeed(label, reference, documentDate) : null;
}

/** Payload di inclusione da un Preventivo (documento del registro). */
export function includedPayloadFromQuote(doc: DocumentRecord): IncludedDocumentPayload {
  return {
    kind: IncludeSourceKind.Quote,
    sourceId: doc.id,
    sourceReference: doc.reference,
    sourceCustomerId: doc.customerId,
    sourcePaymentTerms: doc.paymentTerms,
    referenceLine: includeReferenceLine(IncludeSourceKind.Quote, doc.reference, doc.documentDate),
    lines: (doc.lines ?? []).map((line) => ({
      variantId: line.variantId,
      sku: line.sku,
      description: line.description,
      quantity: line.quantity,
      unitPriceMinor: line.unitPrice.amountMinor,
      // Le reference gia presenti nell'origine viaggiano come tutte le altre
      // righe: va conservata anche la loro NATURA, non solo il testo.
      isReference: line.isReference === true,
      discount:
        Number(line.discountPercent) > 0 ? formatDiscountPercent(Number(line.discountPercent)) : '',
      vatCodeId: line.vatCodeId,
    })),
  };
}

/** Payload di inclusione da un Ordine cliente manuale. */
export function includedPayloadFromSalesOrder(order: SalesOrder): IncludedDocumentPayload {
  return {
    kind: IncludeSourceKind.CustomerOrder,
    sourceId: order.id,
    sourceReference: order.orderNumber,
    sourceCustomerId: order.customerId,
    sourcePaymentTerms: order.paymentTerms,
    referenceLine: includeReferenceLine(
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
      isReference: line.isReference === true,
      discount: line.discount?.trim() ?? '',
      vatCodeId: line.vatCodeId,
    })),
  };
}
