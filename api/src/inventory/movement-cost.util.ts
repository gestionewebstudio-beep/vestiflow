import type { Prisma, StockMovementType } from '@prisma/client';

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
  return new Map(rows.map((row) => [row.id, row.purchasePriceMinor]));
}

/** Costo totale congelato = unitario × quantità; `null` se il costo unitario manca. */
export function frozenTotalCostMinor(
  unitCostMinor: number | null,
  quantity: number,
): number | null {
  return unitCostMinor == null ? null : unitCostMinor * quantity;
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
  return original?.unitCostMinor ?? fallbackCostMinor;
}
