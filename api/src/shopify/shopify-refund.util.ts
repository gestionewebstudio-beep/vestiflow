import { shopifyDecimalToMinor } from './shopify-money.util';

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
  readonly subtotalMinor: number;
  readonly taxMinor: number;
  readonly shippingMinor: number;
  readonly totalMinor: number;
  readonly note: string | null;
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

  // Su store a prezzi ivati l'imposta è già dentro `subtotal`; su store a
  // prezzi netti va aggiunta. È la stessa distinzione che regge
  // `total_price` = `subtotal_price` (+ `total_tax` solo se non incluso).
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

    // Rettifiche fuori riga (spedizione resa): Shopify le scrive con importo
    // NEGATIVO, perché sono ciò che esce. Qui la riga intera è già una
    // sottrazione, quindi il segno si normalizza: due negativi darebbero un
    // rimborso che AUMENTA il corrispettivo.
    const adjustments = (refund.order_adjustments as Record<string, unknown>[] | undefined) ?? [];
    let shippingMinor = 0;
    for (const adjustment of adjustments) {
      shippingMinor += Math.abs(shopifyDecimalToMinor(String(adjustment.amount ?? '0')));
      taxMinor += Math.abs(shopifyDecimalToMinor(String(adjustment.tax_amount ?? '0')));
    }

    const rawDate = refund.processed_at ?? refund.created_at;
    const parsed = rawDate != null ? new Date(String(rawDate)) : null;
    const occurredAt = parsed && !Number.isNaN(parsed.getTime()) ? parsed : fallbackDate;

    rows.push({
      externalRefundId,
      occurredAt,
      subtotalMinor,
      taxMinor,
      shippingMinor,
      totalMinor: taxesIncluded
        ? subtotalMinor + shippingMinor
        : subtotalMinor + shippingMinor + taxMinor,
      note: refund.note != null ? String(refund.note) : null,
    });
  }

  return rows;
}
