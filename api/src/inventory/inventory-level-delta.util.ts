import { Prisma } from '@prisma/client';

/**
 * Applica una variazione di giacenza in modo ATOMICO a livello DB.
 *
 * Policy definitiva quantità (correzioni post-audit §3): la quantità
 * insufficiente NON blocca mai l'operazione. Giacenza (`onHand`) e
 * Disponibile (`available`) possono diventare negative; l'invariante
 * `available = onHand - committed` resta garantito perché i due campi
 * si muovono insieme dello stesso delta. Gli avvisi non bloccanti sono
 * responsabilità del chiamante/UI, non di questo util.
 *
 * Increment atomici lato DB: due transazioni concorrenti sulla stessa
 * variante+location non producono lost update.
 */
export async function applyInventoryDelta(
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
    data: { onHand: { increment: delta }, available: { increment: delta } },
  });
}
