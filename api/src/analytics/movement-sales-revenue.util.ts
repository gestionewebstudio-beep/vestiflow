import { DocumentType, StockMovementType } from '@prisma/client';

/**
 * Ricavo dei movimenti di vendita per i report del gestionale (§A / ①b).
 *
 * Il costo è congelato SUL movimento (`totalCostMinor`), il ricavo NO: si legge
 * dalla RIGA di vendita collegata (il documento del gestionale, non l'ordine di
 * canale). Il reso online (restock) non ha una riga propria: si inverte al
 * prezzo della riga di vendita ORIGINALE per quella variante, coerente col
 * costo che pure viene da lì.
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
  /** `${onlineSaleId}|${variantId}` → prezzo unitario di vendita: per i resi online. */
  readonly onlineOriginalUnitPrice: ReadonlyMap<string, number>;
}

/** Chiave della riga di vendita online originale, per invertire un reso online. */
export function onlineOriginalKey(onlineSaleId: string, variantId: string): string {
  return `${onlineSaleId}|${variantId}`;
}

/**
 * Ricavo LORDO (sempre positivo, senza segno) di un singolo movimento. Il segno
 * (reso in negativo) lo applica il chiamante in base al tipo. 0 quando la riga
 * collegata non è risolvibile (es. movimento storico senza documento).
 */
export function movementRevenueMinor(
  movement: SaleMovementLike,
  maps: RevenueLineMaps,
): number {
  if (movement.sourceLineId) {
    if (movement.sourceDocumentType === DocumentType.online_sale) {
      return maps.onlineSaleLineTotal.get(movement.sourceLineId) ?? 0;
    }
    return maps.documentLineTotal.get(movement.sourceLineId) ?? 0;
  }

  // Reso online (restock): nessuna riga propria → prezzo della vendita originale.
  if (
    movement.type === StockMovementType.return &&
    movement.sourceDocumentId &&
    movement.variantId
  ) {
    const unit = maps.onlineOriginalUnitPrice.get(
      onlineOriginalKey(movement.sourceDocumentId, movement.variantId),
    );
    return unit != null ? unit * movement.quantity : 0;
  }

  return 0;
}
