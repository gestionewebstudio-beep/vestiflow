/**
 * ⭐ Le RETTIFICHE di un ordine di canale, lette per ciò che sono: il valore
 *    originario resta quello dell'ordine, le rettifiche sono i rimborsi
 *    persistiti (`sales_order_refunds`, ciascuno alla sua data), e il TOTALE
 *    AGGIORNATO è la differenza. Nessuna riscrittura dello storico (proprietario,
 *    13/09/2026, #1014 del collaudo reale: 2.249,85 − 749,95 = 1.499,90).
 *    ⚠️ La SOMMA non si ricalcola qui: è di testata (`SalesOrder.refundTotalMinor`,
 *    scritta coi rimborsi) e il totale aggiornato lo genera il database.
 *
 * ⭐ Le quantità si distinguono in tre: ORDINATE (la riga com'è), ANNULLATE (le
 *    righe rimborsate con `restock_type = 'cancel'`: un dato del canale, non
 *    «ordinate − spedite», perché il residuo può essere ancora da spedire) e
 *    SPEDITE (le righe di spedizione acquisite).
 *
 * Funzioni pure: le usano il dettaglio dell'ordine e quello della Vendita online.
 */

export interface RigaRimborsata {
  readonly salesOrderLineId: string | null;
  readonly quantity: number;
  readonly restockType: string;
}

export interface RimborsoConRighe {
  readonly totalMinor: number;
  readonly lines: readonly RigaRimborsata[];
}

export interface RigaSpedita {
  readonly salesOrderLineId: string;
  readonly quantity: number;
}

/** Per riga d'ordine: i pezzi ANNULLATI prima della spedizione (`cancel`). */
export function annullatePerRiga(
  refunds: readonly RimborsoConRighe[],
): ReadonlyMap<string, number> {
  const esito = new Map<string, number>();
  for (const refund of refunds) {
    for (const riga of refund.lines) {
      if (riga.restockType !== 'cancel' || !riga.salesOrderLineId) {
        continue;
      }
      esito.set(riga.salesOrderLineId, (esito.get(riga.salesOrderLineId) ?? 0) + riga.quantity);
    }
  }
  return esito;
}

/** Per riga d'ordine: i pezzi SPEDITI, sommando le spedizioni acquisite. */
export function speditePerRiga(spedizioni: readonly RigaSpedita[]): ReadonlyMap<string, number> {
  const esito = new Map<string, number>();
  for (const riga of spedizioni) {
    esito.set(riga.salesOrderLineId, (esito.get(riga.salesOrderLineId) ?? 0) + riga.quantity);
  }
  return esito;
}
