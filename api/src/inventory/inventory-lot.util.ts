import type { DocumentLine, Prisma } from '@prisma/client';

type LotLine = Pick<
  DocumentLine,
  'variantId' | 'lotCode' | 'lotExpiryDate' | 'quantity' | 'loadsStock'
>;

/** Upsert lotti inventario dalle righe documento con lotCode (C1). */
export async function applyInventoryLotsFromDocumentLines(
  tx: Prisma.TransactionClient,
  tenantId: string,
  locationId: string,
  lines: readonly LotLine[],
): Promise<void> {
  for (const line of lines) {
    if (!line.lotCode?.trim() || !line.variantId || !line.loadsStock || line.quantity <= 0) {
      continue;
    }

    const lotCode = line.lotCode.trim();

    await tx.inventoryLot.upsert({
      where: {
        tenantId_variantId_locationId_lotCode: {
          tenantId,
          variantId: line.variantId,
          locationId,
          lotCode,
        },
      },
      create: {
        tenantId,
        variantId: line.variantId,
        locationId,
        lotCode,
        expiryDate: line.lotExpiryDate,
        quantity: line.quantity,
      },
      update: {
        quantity: { increment: line.quantity },
        ...(line.lotExpiryDate ? { expiryDate: line.lotExpiryDate } : {}),
      },
    });
  }
}
