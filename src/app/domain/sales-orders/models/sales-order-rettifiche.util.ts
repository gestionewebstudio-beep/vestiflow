import type { Money } from '@core/models/money.model';
import type { SalesOrder, SalesOrderLine } from '@core/models/sales-order.model';

import type {
  QuantitaRiga,
  RettificaCanale,
} from '../components/channel-order-rettifiche/channel-order-rettifiche.component';

/**
 * ⭐ Il TOTALE AGGIORNATO di un ordine di canale, letto in un posto solo (elenco,
 *    export, dettaglio). È di TESTATA: lo genera il database come valore
 *    originario meno le rettifiche, e il valore originario non si riscrive
 *    (proprietario, 13/09/2026, #1014: 2.249,85 − 749,95 = 1.499,90).
 *
 * ⛔ Qui non si sottrae: un ordine senza testata aggiornata (fixture, ordini di
 *    un'API precedente) vale il suo totale, cioè nessuna rettifica nota.
 */
export function totaleAggiornato(order: Pick<SalesOrder, 'total' | 'updatedTotal'>): Money {
  return order.updatedTotal ?? order.total;
}

/** Le rettifiche dell'ordine nella forma del componente condiviso. */
export function rettificheDi(order: Pick<SalesOrder, 'refunds'>): readonly RettificaCanale[] {
  return (order.refunds ?? []).map((refund) => ({
    id: refund.id,
    kind: refund.kind,
    occurredAt: refund.occurredAt,
    total: refund.total,
    note: refund.note ?? null,
  }));
}

/** Le tre quantità di ogni riga: ordinate (la riga), annullate (canale), spedite (spedizioni). */
export function quantitaDelleRighe(
  lines: readonly Pick<
    SalesOrderLine,
    'id' | 'title' | 'quantity' | 'cancelledQuantity' | 'shippedQuantity'
  >[],
): readonly QuantitaRiga[] {
  return lines.map((line) => ({
    id: line.id,
    description: line.title,
    ordered: line.quantity,
    cancelled: line.cancelledQuantity ?? 0,
    shipped: line.shippedQuantity ?? 0,
  }));
}
