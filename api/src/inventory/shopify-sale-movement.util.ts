import { MovementOrigin, Prisma, StockMovementType } from '@prisma/client';

export interface RecordShopifySaleMovementInput {
  readonly tenantId: string;
  readonly variantId: string;
  readonly sku: string;
  readonly locationId: string;
  readonly quantity: number;
  readonly documentId: string;
  readonly reason: string;
}

/**
 * Movimento vendita Shopify collegato al documento (audit trail).
 * Non modifica le giacenze: il livello è già allineato via webhook inventario Shopify.
 */
export async function recordShopifySaleMovement(
  tx: Prisma.TransactionClient,
  input: RecordShopifySaleMovementInput,
): Promise<void> {
  if (input.quantity <= 0) {
    return;
  }

  const existing = await tx.stockMovement.findFirst({
    where: {
      tenantId: input.tenantId,
      externalRef: input.documentId,
      variantId: input.variantId,
      locationId: input.locationId,
      type: StockMovementType.sale,
      origin: MovementOrigin.shopify,
    },
    select: { id: true, quantity: true },
  });

  if (existing) {
    if (existing.quantity === input.quantity) {
      return;
    }
    await tx.stockMovement.update({
      where: { id: existing.id },
      data: { quantity: input.quantity, reason: input.reason },
    });
    return;
  }

  await tx.stockMovement.create({
    data: {
      tenantId: input.tenantId,
      type: StockMovementType.sale,
      origin: MovementOrigin.shopify,
      variantId: input.variantId,
      sku: input.sku,
      locationId: input.locationId,
      quantity: input.quantity,
      reason: input.reason,
      externalRef: input.documentId,
      createdByName: 'Shopify',
    },
  });
}

/** Rimuove movimenti vendita Shopify collegati a un documento (righe rimosse/annullamento). */
export async function clearShopifySaleMovementsForDocument(
  tx: Prisma.TransactionClient,
  tenantId: string,
  documentId: string,
  variantIdsToKeep: readonly string[],
): Promise<void> {
  await tx.stockMovement.deleteMany({
    where: {
      tenantId,
      externalRef: documentId,
      origin: MovementOrigin.shopify,
      type: StockMovementType.sale,
      ...(variantIdsToKeep.length > 0
        ? { variantId: { notIn: [...variantIdsToKeep] } }
        : {}),
    },
  });
}
