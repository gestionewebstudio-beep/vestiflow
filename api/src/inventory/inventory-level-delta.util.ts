import { UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export interface ApplyInventoryDeltaOptions {
  /** Messaggio custom quando la disponibilità è insufficiente (decrementi). */
  readonly insufficientMessage?: (available: number, requested: number) => string;
}

/**
 * Applica una variazione di giacenza in modo ATOMICO a livello DB.
 *
 * I decrementi usano un UPDATE condizionale (`available >= |delta|`): due
 * transazioni concorrenti sulla stessa variante+location non possono produrre
 * lost update né portare lo stock sotto zero. Sostituisce il pattern
 * read-modify-write che era soggetto a race condition.
 */
export async function applyInventoryDelta(
  tx: Prisma.TransactionClient,
  tenantId: string,
  variantId: string,
  locationId: string,
  delta: number,
  options: ApplyInventoryDeltaOptions = {},
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

  if (delta > 0) {
    await tx.inventoryLevel.updateMany({
      where: { tenantId, variantId, locationId },
      data: { onHand: { increment: delta }, available: { increment: delta } },
    });
    return;
  }

  const required = -delta;
  const result = await tx.inventoryLevel.updateMany({
    where: { tenantId, variantId, locationId, available: { gte: required } },
    data: { onHand: { increment: delta }, available: { increment: delta } },
  });

  if (result.count === 0) {
    const current = await tx.inventoryLevel.findUnique({
      where: { variantId_locationId: { variantId, locationId } },
      select: { available: true },
    });
    const available = current?.available ?? 0;
    const message = options.insufficientMessage
      ? options.insufficientMessage(available, required)
      : `Disponibilità insufficiente: richiesti ${required}, disponibili ${available}.`;
    throw new UnprocessableEntityException(message);
  }
}

/**
 * Imposta `available` a un valore ASSOLUTO (es. allineamento autoritativo da
 * Shopify) adeguando `onHand` del delta calcolato ATOMICAMENTE sul valore
 * corrente nel DB al momento della scrittura. Evita il lost update su `onHand`
 * che il pattern read-modify-write produceva con webhook concorrenti.
 */
export async function setInventoryAvailableAbsolute(
  tx: Prisma.TransactionClient,
  levelId: string,
  targetAvailable: number,
): Promise<void> {
  await tx.$executeRaw`
    UPDATE inventory_levels
    SET on_hand = on_hand + (${targetAvailable} - available),
        available = ${targetAvailable},
        updated_at = now()
    WHERE id = ${levelId}::uuid
  `;
}
