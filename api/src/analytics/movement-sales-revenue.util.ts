import { DocumentType, StockMovementType } from '@prisma/client';

/**
 * Ricavo dei movimenti di vendita per i report del gestionale (§A / ①b).
 *
 * Il costo è congelato SUL movimento (`totalCostMinor`), il ricavo NO: si legge
 * dalla RIGA di vendita collegata (il documento del gestionale, non l'ordine di
 * canale).
 *
 * ⛔ Qui il reso online (restock) «si invertiva al prezzo della riga di vendita
 *    ORIGINALE per quella variante»: una STIMA, e un secondo sistema. Dal
 *    13/09/2026 il lato economico di ogni rettifica del canale — reso, rimborso,
 *    annullamento parziale — viene dal RIMBORSO persistito (`sales_order_refunds`,
 *    `addOnlineRefundsToAggregate`), alla sua data e per l'importo vero; il
 *    movimento di rientro porta SOLO il costo. Contarli entrambi sottrarrebbe due
 *    volte il rientro (proprietario, 13/09/2026).
 */

/** Movimento di vendita/reso nella forma minima che serve al calcolo del ricavo. */
export interface SaleMovementLike {
  readonly type: StockMovementType;
  readonly variantId: string | null;
  readonly quantity: number;
  readonly sourceDocumentType: DocumentType | null;
  readonly sourceDocumentId: string | null;
  readonly sourceLineId: string | null;
}

/** Indici riga precaricati (batch) da cui deriva il ricavo di ogni movimento. */
export interface RevenueLineMaps {
  /** `sourceLineId` (DocumentLine) → totale lordo di riga: store_sale / store_return. */
  readonly documentLineTotal: ReadonlyMap<string, number>;
  /** `sourceLineId` (OnlineSaleLine) → totale lordo di riga: online_sale. */
  readonly onlineSaleLineTotal: ReadonlyMap<string, number>;
}

/**
 * Ricavo LORDO (sempre positivo, senza segno) di un singolo movimento. Il segno
 * (reso in negativo) lo applica il chiamante in base al tipo. 0 quando la riga
 * collegata non è risolvibile (es. movimento storico senza documento).
 */
export function movementRevenueMinor(movement: SaleMovementLike, maps: RevenueLineMaps): number {
  if (movement.sourceLineId) {
    if (movement.sourceDocumentType === DocumentType.online_sale) {
      return maps.onlineSaleLineTotal.get(movement.sourceLineId) ?? 0;
    }
    return maps.documentLineTotal.get(movement.sourceLineId) ?? 0;
  }

  // Reso online (restock): nessuna riga propria, e nessun ricavo da qui — il
  // suo valore è il rimborso persistito (vedi in testa).
  return 0;
}
