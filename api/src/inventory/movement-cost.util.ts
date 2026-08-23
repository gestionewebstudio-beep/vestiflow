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
 * query. `null` per le varianti senza costo. È il valore da congelare sui
 * movimenti di vendita.
 */
export async function currentVariantCostMap(
  tx: Prisma.TransactionClient,
  tenantId: string,
  variantIds: readonly string[],
): Promise<ReadonlyMap<string, number | null>> {
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
  // ⛔ **La guardia sul `null` non è pignoleria: `Number(null)` vale ZERO.**
  // Un costo assente diventerebbe «costa zero», che è un'informazione diversa
  // e falsa — e finirebbe congelata sui movimenti e nel margine.
  return new Map(
    rows.map((row) => [
      row.id,
      row.purchasePriceMinor == null ? null : Number(row.purchasePriceMinor),
    ]),
  );
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
  unitCostMinor: Prisma.Decimal | number | null,
  quantity: number,
): number | null {
  if (unitCostMinor == null) {
    return null;
  }
  // ⭐ La moltiplicazione avviene in `Decimal`, l'arrotondamento UNA VOLTA alla
  // fine: è l'ordine che le regole impongono — «si calcola esatto e si
  // arrotonda una volta sola». Convertire prima e moltiplicare dopo farebbe
  // entrare l'approssimazione binaria nel fattore, non solo nel risultato.
  return Math.round(new Prisma.Decimal(unitCostMinor).times(quantity).toNumber());
}

/**
 * Costo unitario da congelare su un RESO: quello congelato sul movimento di
 * vendita ORIGINALE per la stessa variante (§③). Ricade su `fallbackCostMinor`
 * (tipicamente il costo corrente della variante) se il reso non è collegato a
 * una vendita, o se quella vendita non porta il costo (movimenti storici
 * antecedenti al congelamento).
 */
export async function originalSaleUnitCostMinor(
  tx: Prisma.TransactionClient,
  tenantId: string,
  originalSaleDocumentId: string | null,
  variantId: string,
  saleTypes: readonly StockMovementType[],
  fallbackCostMinor: number | null,
): Promise<number | null> {
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
  return original?.unitCostMinor != null ? Number(original.unitCostMinor) : fallbackCostMinor;
}
