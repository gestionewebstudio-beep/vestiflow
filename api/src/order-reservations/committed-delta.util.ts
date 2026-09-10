import { Prisma } from '@prisma/client';

import { registraOrigine, type OrigineVariazione } from '../inventory/inventory-level-delta.util';

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
  origine: OrigineVariazione,
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

  // ⚠️ Qui `available` si muove di **meno** delta: un impegno in piu' e' una
  //    disponibilita' in meno. Il segno che conta per l'origine e' quello.
  await registraOrigine(tx, tenantId, variantId, locationId, -delta, origine);
}
