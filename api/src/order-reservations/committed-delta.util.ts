import { Prisma } from '@prisma/client';

/**
 * Applica una variazione della quantità Impegnata (`committed`) in modo
 * ATOMICO, mantenendo l'invariante `available = onHand - committed`:
 * la Giacenza (`onHand`) resta INVARIATA, la Disponibile si muove di -delta.
 *
 * Increment atomici lato DB: due eventi ravvicinati sulla stessa
 * variante+location non producono lost update (§9 fase 1).
 * `available` può andare sotto zero (oversell accettato dal canale).
 */
export async function applyCommittedDelta(
  tx: Prisma.TransactionClient,
  tenantId: string,
  variantId: string,
  locationId: string,
  delta: number,
): Promise<void> {
  // Garantisce l'esistenza della riga senza modificarne i valori.
  await tx.inventoryLevel.upsert({
    where: { variantId_locationId: { variantId, locationId } },
    create: { tenantId, variantId, locationId },
    update: {},
  });

  if (delta === 0) {
    return;
  }

  await tx.inventoryLevel.updateMany({
    where: { tenantId, variantId, locationId },
    data: { committed: { increment: delta }, available: { increment: -delta } },
  });
}
