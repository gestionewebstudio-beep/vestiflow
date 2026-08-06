import { UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * Applica delta sulla quantità `incoming` (ordini fornitore in transito).
 * Non modifica onHand/available.
 */
export async function applyIncomingDelta(
  tx: Prisma.TransactionClient,
  tenantId: string,
  variantId: string,
  locationId: string,
  delta: number,
): Promise<void> {
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
      data: { incoming: { increment: delta } },
    });
    return;
  }

  const required = -delta;
  const result = await tx.inventoryLevel.updateMany({
    where: { tenantId, variantId, locationId, incoming: { gte: required } },
    data: { incoming: { increment: delta } },
  });

  if (result.count === 0) {
    const current = await tx.inventoryLevel.findUnique({
      where: { variantId_locationId: { variantId, locationId } },
      select: { incoming: true },
    });
    const incoming = current?.incoming ?? 0;
    throw new UnprocessableEntityException(
      `Incoming insufficiente: richiesti ${required}, disponibili ${incoming}.`,
    );
  }
}
