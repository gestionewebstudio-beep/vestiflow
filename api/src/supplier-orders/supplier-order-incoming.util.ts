import type { Prisma, SupplierOrderLine } from '@prisma/client';

import { applyIncomingDelta } from '../inventory/inventory-incoming.util';

type IncomingLine = Pick<
  SupplierOrderLine,
  'variantId' | 'orderedQuantity' | 'receivedQuantity'
>;

/** Incrementa incoming al invio ordine (residuo ordinato non ancora ricevuto). */
export async function applyIncomingForSupplierOrder(
  tx: Prisma.TransactionClient,
  tenantId: string,
  destinationLocationId: string,
  lines: readonly IncomingLine[],
): Promise<void> {
  for (const line of lines) {
    const remaining = line.orderedQuantity - line.receivedQuantity;
    if (remaining > 0) {
      await applyIncomingDelta(
        tx,
        tenantId,
        line.variantId,
        destinationLocationId,
        remaining,
      );
    }
  }
}

/** Decrementa incoming residuo (annullamento ordine inviato). */
export async function reverseIncomingForSupplierOrder(
  tx: Prisma.TransactionClient,
  tenantId: string,
  destinationLocationId: string,
  lines: readonly IncomingLine[],
): Promise<void> {
  for (const line of lines) {
    const remaining = line.orderedQuantity - line.receivedQuantity;
    if (remaining > 0) {
      await applyIncomingDelta(
        tx,
        tenantId,
        line.variantId,
        destinationLocationId,
        -remaining,
      );
    }
  }
}
