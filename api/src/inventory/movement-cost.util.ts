import { Prisma } from '@prisma/client';

import type { StockMovementType } from '@prisma/client';

/**
 * Costo che si CONGELA sui movimenti quando la merce esce.
 *
 * Regola costi (§Punto A — il costo di record è la variante): il costo di una
 * vendita è quello EFFETTIVO della variante nel momento in cui la merce esce.
 * Congelandolo sul movimento, il margine di quella vendita non cambia più anche
 * se il costo della variante cambia dopo. Il reso inverte la vendita e usa il
 * costo congelato sulla vendita ORIGINALE (§③), non quello corrente, così
 * invertire una vendita non genera margine dal nulla.
 */

/**
 * Costo effettivo corrente delle varianti (`purchasePriceMinor`) in una sola
 * query. È il valore da congelare sui movimenti di vendita.
 *
 * ⭐ Un costo canonico non è mai NULL: una variante senza costo vale **zero**,
 * e zero è un costo (`regole-gestionale`). La mappa restituisce quindi sempre
 * un numero per le varianti trovate.
 */
export async function currentVariantCostMap(
  tx: Prisma.TransactionClient,
  tenantId: string,
  variantIds: readonly string[],
): Promise<ReadonlyMap<string, number>> {
  const ids = [...new Set(variantIds)];
  if (ids.length === 0) {
    return new Map();
  }
  const rows = await tx.productVariant.findMany({
    where: { tenantId, id: { in: ids } },
    select: { id: true, purchasePriceMinor: true },
  });
  // ⭐ `Number(...)` è il confine fra `Prisma.Decimal` e il resto del codice,
  // NON un arrotondamento: la coda sopravvive intera (84,4262 resta 84,4262).
  //
  // ⛔ Qui c'era una guardia `== null` che restituiva `null`: serviva quando la
  // colonna era nullable e «assente» era distinto da «zero». La colonna è ora
  // `NOT NULL DEFAULT 0` e quella distinzione non esiste più.
  return new Map(rows.map((row) => [row.id, Number(row.purchasePriceMinor)]));
}

/**
 * Costo totale congelato = unitario × quantità.
 *
 * ⭐ **Qui l'arrotondamento CI VUOLE, ed è l'unico punto in cui ci vuole.** Il
 * costo unitario porta la coda dello scorporo (84,4262 centesimi) e
 * `stock_movements.unit_cost_minor` la conserva; il TOTALE è invece un importo
 * monetario finale — la colonna `total_cost_minor` resta `Int` di proposito, e
 * l'analytics ci somma sopra il costo del venduto.
 *
 * ⚠️ Si moltiplica PRIMA e si arrotonda DOPO: arrotondare l'unitario e poi
 * moltiplicarlo per la quantità è l'arrotondamento prematuro che le regole
 * vietano — 3 pezzi da 84,4262 valgono 253 centesimi, non 252.
 *
 * Accetta `Decimal` perché è ciò che arriva leggendo la colonna, e `number`
 * perché è ciò che arriva dai calcoli: normalizza prima di moltiplicare, invece
 * di affidarsi a una coercizione implicita che su un oggetto `Decimal` non
 * farebbe quello che sembra.
 */
export function frozenTotalCostMinor(
  unitCostMinor: Prisma.Decimal | number,
  quantity: number,
): number {
  // ⭐ La moltiplicazione avviene in `Decimal`, l'arrotondamento UNA VOLTA alla
  // fine: è l'ordine che le regole impongono — «si calcola esatto e si
  // arrotonda una volta sola». Convertire prima e moltiplicare dopo farebbe
  // entrare l'approssimazione binaria nel fattore, non solo nel risultato.
  return Math.round(new Prisma.Decimal(unitCostMinor).times(quantity).toNumber());
}

/**
 * Costo unitario da congelare su un RESO: quello congelato sul movimento di
 * vendita ORIGINALE per la stessa variante (§③). Ricade su `fallbackCostMinor`
 * (tipicamente il costo corrente della variante) solo quando quella vendita
 * **non esiste** — il reso non è collegato, o il movimento non si trova.
 *
 * ⛔ Non ricade più quando la vendita esiste e il suo costo è zero: zero è il
 * costo con cui quella merce è uscita, e il reso deve rientrare con lo stesso.
 * Il fallback era per la colonna nullable, che non c'è più.
 */
export async function originalSaleUnitCostMinor(
  tx: Prisma.TransactionClient,
  tenantId: string,
  originalSaleDocumentId: string | null,
  variantId: string,
  saleTypes: readonly StockMovementType[],
  fallbackCostMinor: number,
): Promise<number> {
  if (!originalSaleDocumentId) {
    return fallbackCostMinor;
  }
  const original = await tx.stockMovement.findFirst({
    where: {
      tenantId,
      sourceDocumentId: originalSaleDocumentId,
      variantId,
      type: { in: [...saleTypes] },
    },
    select: { unitCostMinor: true },
  });
  return original ? Number(original.unitCostMinor) : fallbackCostMinor;
}
