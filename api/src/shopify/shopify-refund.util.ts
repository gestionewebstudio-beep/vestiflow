import { shopifyDecimalToMinor } from './shopify-money.util';

/**
 * Natura della rettifica, letta dal `restock_type` delle righe rimborsate.
 *
 * Serve al registro corrispettivi, non al mapper: qui si **classifica**, non si
 * scarta. Un annullamento è un fatto arrivato dal canale e va conservato — è il
 * registro a decidere se ha effetto economico, non la traduzione a decidere se
 * esiste. Vedi specifica 08 §4.
 */
export const SHOPIFY_REFUND_KINDS = ['return', 'refund', 'cancellation'] as const;
export type ShopifyRefundKind = (typeof SHOPIFY_REFUND_KINDS)[number];

/** Scomposizione per aliquota di una rettifica. */
export interface ShopifyRefundTaxLine {
  /**
   * Aliquota in percentuale (es. 22 per il 22%). `null` quando il canale non
   * la dichiara: succede sulle rettifiche fuori riga, che portano l'importo e
   * non l'aliquota. Una riga senza aliquota resta visibile come tale — il
   * registro non può attribuirla per indovinello.
   */
  readonly ratePercent: number | null;
  readonly taxableMinor: number;
  readonly taxMinor: number;
}

/**
 * Rettifica economica letta dal payload ordine di Shopify (specifica 08 §4).
 *
 * Importi in unità minori con la convenzione di `sales_orders`, così il
 * registro corrispettivi sottrae come somma senza conversioni.
 */
export interface ShopifyRefundRow {
  /** Id opaco del rimborso sul canale: chiave di idempotenza dei webhook. */
  readonly externalRefundId: string;
  /** Data della rettifica, non dell'ordine: è quella che entra nel registro. */
  readonly occurredAt: Date;
  readonly kind: ShopifyRefundKind;
  /** Somma delle righe rimborsate. */
  readonly subtotalMinor: number;
  /** Imposta totale: quella delle righe più quella delle rettifiche fuori riga. */
  readonly taxMinor: number;
  /** Spese di spedizione rese, **imposta inclusa**. */
  readonly shippingMinor: number;
  /**
   * Rettifiche fuori riga che non sono spedizione (`refund_discrepancy`):
   * il rimborso di cortesia a importo libero finisce qui, e non fra le spese
   * di spedizione come farebbe una somma indistinta.
   */
  readonly adjustmentMinor: number;
  readonly totalMinor: number;
  readonly note: string | null;
  readonly taxLines: readonly ShopifyRefundTaxLine[];
}

interface AdjustmentTotals {
  readonly shippingMinor: number;
  readonly adjustmentMinor: number;
  readonly taxMinor: number;
}

/**
 * ⚠️ **Le rettifiche fuori riga usano una convenzione DIVERSA dalle righe**, e
 * confonderle costa l'imposta della spedizione.
 *
 * Misurato il 14/08/2026 su un rimborso vero (`#1008`): spedizione da 26,01 €
 * comprensiva di IVA al 22%, rimborsata per intero. Shopify la scrive così:
 *
 * ```
 * righe:              subtotal 54.00 · total_tax 2.08   ← LORDO, imposta dentro
 * order_adjustments:  amount −21.32  · tax_amount −4.69 ← NETTO, imposta a parte
 * ```
 *
 * 21,32 + 4,69 = 26,01. Trattare `amount` come lordo — cioè applicare alle
 * rettifiche la regola delle righe — produce un totale di 75,32 invece di
 * 80,01: **manca esattamente l'IVA della spedizione**, sommata all'imposta ma
 * mai al totale. Su quel rimborso è il 5,9% in meno.
 *
 * Il segno si normalizza perché Shopify scrive le rettifiche in negativo (sono
 * ciò che esce) mentre qui la riga intera è già una sottrazione: due negativi
 * darebbero un rimborso che AUMENTA il corrispettivo.
 */
function sumAdjustments(refund: Record<string, unknown>): AdjustmentTotals {
  const adjustments = (refund.order_adjustments as Record<string, unknown>[] | undefined) ?? [];
  let shippingMinor = 0;
  let adjustmentMinor = 0;
  let taxMinor = 0;

  for (const adjustment of adjustments) {
    const netMinor = Math.abs(shopifyDecimalToMinor(String(adjustment.amount ?? '0')));
    const adjustmentTax = Math.abs(shopifyDecimalToMinor(String(adjustment.tax_amount ?? '0')));
    taxMinor += adjustmentTax;
    if (String(adjustment.kind ?? '') === 'shipping_refund') {
      shippingMinor += netMinor + adjustmentTax;
    } else {
      adjustmentMinor += netMinor + adjustmentTax;
    }
  }

  return { shippingMinor, adjustmentMinor, taxMinor };
}

/**
 * Che gesto è stato, letto dal `restock_type` delle righe.
 *
 * `cancel` significa «annulla l'impegno», non «la merce è rientrata»: è
 * l'annullamento pre-evasione, ed è lo stesso segno che `emitRestockEvents`
 * usa per non ricaricare la giacenza. Un rimborso le cui righe sono TUTTE
 * `cancel` è un annullamento; se una sola riga dichiara un rientro fisico è un
 * reso; senza righe, o con righe che non ricaricano, è un rimborso e basta.
 */
function classifyRefund(refund: Record<string, unknown>): ShopifyRefundKind {
  const lines = (refund.refund_line_items as Record<string, unknown>[] | undefined) ?? [];
  if (lines.length === 0) {
    return 'refund';
  }

  const types = lines.map((line) => String(line.restock_type ?? ''));
  if (types.every((type) => type === 'cancel')) {
    return 'cancellation';
  }
  if (types.some((type) => type === 'return' || type === 'legacy_restock')) {
    return 'return';
  }
  return 'refund';
}

/** Aggrega per aliquota, così due righe alla stessa aliquota fanno una voce sola. */
function buildTaxLines(
  refund: Record<string, unknown>,
  taxesIncluded: boolean,
  adjustments: AdjustmentTotals,
): readonly ShopifyRefundTaxLine[] {
  const byRate = new Map<number | null, { taxableMinor: number; taxMinor: number }>();
  const add = (rate: number | null, taxableMinor: number, taxMinor: number): void => {
    const current = byRate.get(rate) ?? { taxableMinor: 0, taxMinor: 0 };
    byRate.set(rate, {
      taxableMinor: current.taxableMinor + taxableMinor,
      taxMinor: current.taxMinor + taxMinor,
    });
  };

  for (const item of (refund.refund_line_items as Record<string, unknown>[] | undefined) ?? []) {
    const grossMinor = shopifyDecimalToMinor(String(item.subtotal ?? '0'));
    const taxMinor = shopifyDecimalToMinor(String(item.total_tax ?? '0'));
    if (grossMinor === 0 && taxMinor === 0) {
      continue;
    }
    const lineItem = item.line_item as Record<string, unknown> | undefined;
    const rates = ((lineItem?.tax_lines as Record<string, unknown>[] | undefined) ?? [])
      .map((taxLine) => Number(taxLine.rate))
      .filter((rate) => Number.isFinite(rate));
    // Una riga con più aliquote è fuori dai casi italiani ordinari: si tiene
    // la prima e non si inventa una ripartizione. Senza aliquota: riga muta.
    const ratePercent = rates.length > 0 ? Math.round(rates[0]! * 10_000) / 100 : null;
    add(ratePercent, taxesIncluded ? grossMinor - taxMinor : grossMinor, taxMinor);
  }

  // Le rettifiche fuori riga non dichiarano l'aliquota: restano senza.
  const adjustedTotal = adjustments.shippingMinor + adjustments.adjustmentMinor;
  if (adjustedTotal > 0 || adjustments.taxMinor > 0) {
    add(null, adjustedTotal - adjustments.taxMinor, adjustments.taxMinor);
  }

  return [...byRate.entries()]
    .map(([ratePercent, totals]) => ({ ratePercent, ...totals }))
    .sort((a, b) => (a.ratePercent ?? -1) - (b.ratePercent ?? -1));
}

/**
 * Estrae i rimborsi da un ordine Shopify.
 *
 * `fallbackDate` (la data dell'ordine) copre il rimborso senza date: un record
 * fiscale non può nascere con «adesso», che cambierebbe a ogni risincronizzazione.
 */
export function mapShopifyRefunds(
  order: Record<string, unknown>,
  fallbackDate: Date,
): ShopifyRefundRow[] {
  const refunds = (order.refunds as Record<string, unknown>[] | undefined) ?? [];

  // Su store a prezzi ivati l'imposta è già dentro `subtotal` delle righe; su
  // store a prezzi netti va aggiunta. Non vale per le rettifiche fuori riga,
  // che portano sempre il netto (vedi `sumAdjustments`).
  const taxesIncluded = order.taxes_included === true;

  const rows: ShopifyRefundRow[] = [];

  for (const refund of refunds) {
    const externalRefundId = refund.id != null ? String(refund.id) : null;
    if (!externalRefundId) {
      continue;
    }

    const lineItems = (refund.refund_line_items as Record<string, unknown>[] | undefined) ?? [];
    let subtotalMinor = 0;
    let taxMinor = 0;
    for (const item of lineItems) {
      subtotalMinor += shopifyDecimalToMinor(String(item.subtotal ?? '0'));
      taxMinor += shopifyDecimalToMinor(String(item.total_tax ?? '0'));
    }

    const adjustments = sumAdjustments(refund);
    taxMinor += adjustments.taxMinor;

    const rawDate = refund.processed_at ?? refund.created_at;
    const parsed = rawDate != null ? new Date(String(rawDate)) : null;
    const occurredAt = parsed && !Number.isNaN(parsed.getTime()) ? parsed : fallbackDate;

    const lineTotalMinor = taxesIncluded
      ? subtotalMinor
      : subtotalMinor + (taxMinor - adjustments.taxMinor);

    rows.push({
      externalRefundId,
      occurredAt,
      kind: classifyRefund(refund),
      subtotalMinor,
      taxMinor,
      shippingMinor: adjustments.shippingMinor,
      adjustmentMinor: adjustments.adjustmentMinor,
      totalMinor: lineTotalMinor + adjustments.shippingMinor + adjustments.adjustmentMinor,
      note: refund.note != null && String(refund.note) !== '' ? String(refund.note) : null,
      taxLines: buildTaxLines(refund, taxesIncluded, adjustments),
    });
  }

  return rows;
}
