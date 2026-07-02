import { UnprocessableEntityException } from '@nestjs/common';
import { SupplierOrderStatus, type DocumentLine, type Prisma } from '@prisma/client';

import { applyIncomingDelta } from '../inventory/inventory-incoming.util';

type ReceiptLine = Pick<
  DocumentLine,
  'variantId' | 'sku' | 'quantity' | 'loadsStock'
> & {
  supplierOrderLineId: string | null;
};

function aggregateReceiptByOrderLine(
  lines: readonly ReceiptLine[],
): Map<string, { readonly variantId: string; readonly quantity: number }> {
  const map = new Map<string, { readonly variantId: string; readonly quantity: number }>();
  for (const line of lines) {
    if (!line.loadsStock || line.quantity <= 0 || !line.supplierOrderLineId || !line.variantId) {
      continue;
    }
    const existing = map.get(line.supplierOrderLineId);
    map.set(line.supplierOrderLineId, {
      variantId: line.variantId,
      quantity: (existing?.quantity ?? 0) + line.quantity,
    });
  }
  return map;
}

function aggregateIncomingByVariant(
  lines: readonly ReceiptLine[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const line of lines) {
    if (!line.loadsStock || line.quantity <= 0 || !line.variantId) {
      continue;
    }
    map.set(line.variantId, (map.get(line.variantId) ?? 0) + line.quantity);
  }
  return map;
}

async function applyIncomingDeltaForReceipt(
  tx: Prisma.TransactionClient,
  tenantId: string,
  locationId: string,
  lines: readonly ReceiptLine[],
  sign: 1 | -1,
): Promise<void> {
  const byVariant = aggregateIncomingByVariant(lines);
  for (const [variantId, quantity] of byVariant) {
    await applyIncomingDelta(tx, tenantId, variantId, locationId, sign * quantity);
  }
}

async function recalculateSupplierOrderStatus(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<void> {
  const lines = await tx.supplierOrderLine.findMany({ where: { orderId } });
  if (lines.length === 0) {
    return;
  }
  const allReceived = lines.every((line) => line.receivedQuantity >= line.orderedQuantity);
  const anyReceived = lines.some((line) => line.receivedQuantity > 0);
  const nextStatus = allReceived
    ? SupplierOrderStatus.received
    : anyReceived
      ? SupplierOrderStatus.partially_received
      : SupplierOrderStatus.sent;

  await tx.supplierOrder.update({
    where: { id: orderId },
    data: { status: nextStatus },
  });
}

/** Collega righe documento alle righe ordine fornitore per variante se manca supplierOrderLineId. */
export async function enrichReceiptLinesWithSupplierOrderLineIds(
  tx: Prisma.TransactionClient,
  supplierOrderId: string,
  lines: readonly DocumentLine[],
): Promise<DocumentLine[]> {
  const orderLines = await tx.supplierOrderLine.findMany({
    where: { orderId: supplierOrderId },
    select: { id: true, variantId: true },
  });
  const byVariant = new Map(orderLines.map((line) => [line.variantId, line.id]));
  return lines.map((line) => {
    if (line.supplierOrderLineId || !line.variantId) {
      return line;
    }
    const orderLineId = byVariant.get(line.variantId);
    if (!orderLineId) {
      return line;
    }
    return { ...line, supplierOrderLineId: orderLineId };
  });
}

/** Verifica che le quantità documento non superino il residuo ordine fornitore. */
export async function assertSupplierOrderReceiptQuantities(
  tx: Prisma.TransactionClient,
  supplierOrderId: string,
  lines: readonly ReceiptLine[],
): Promise<void> {
  const aggregated = aggregateReceiptByOrderLine(lines);
  if (aggregated.size === 0) {
    return;
  }

  const orderLines = await tx.supplierOrderLine.findMany({
    where: { orderId: supplierOrderId, id: { in: [...aggregated.keys()] } },
  });
  const lineById = new Map(orderLines.map((line) => [line.id, line]));

  for (const [lineId, entry] of aggregated) {
    const orderLine = lineById.get(lineId);
    if (!orderLine) {
      throw new UnprocessableEntityException(`Riga ordine fornitore non trovata: ${lineId}`);
    }
    if (orderLine.variantId !== entry.variantId) {
      throw new UnprocessableEntityException(
        `Variante non coerente con la riga ordine ${orderLine.sku}.`,
      );
    }
    const remaining = orderLine.orderedQuantity - orderLine.receivedQuantity;
    if (entry.quantity > remaining) {
      throw new UnprocessableEntityException(
        `Quantità eccessiva per SKU ${orderLine.sku}: rimangono ${remaining} da ricevere sull'ordine.`,
      );
    }
  }
}

/** Incrementa receivedQuantity sull'ordine fornitore (conferma documento collegato). */
export async function applySupplierOrderReceipt(
  tx: Prisma.TransactionClient,
  supplierOrderId: string,
  lines: readonly ReceiptLine[],
  locationId?: string,
  tenantId?: string,
): Promise<void> {
  const aggregated = aggregateReceiptByOrderLine(lines);
  for (const [lineId, entry] of aggregated) {
    await tx.supplierOrderLine.update({
      where: { id: lineId },
      data: { receivedQuantity: { increment: entry.quantity } },
    });
  }
  if (aggregated.size > 0) {
    await recalculateSupplierOrderStatus(tx, supplierOrderId);
  }
  if (locationId && tenantId) {
    await applyIncomingDeltaForReceipt(tx, tenantId, locationId, lines, -1);
  }
}

/** Decrementa receivedQuantity (annullamento documento collegato). */
export async function reverseSupplierOrderReceipt(
  tx: Prisma.TransactionClient,
  supplierOrderId: string,
  lines: readonly ReceiptLine[],
  locationId?: string,
  tenantId?: string,
): Promise<void> {
  const aggregated = aggregateReceiptByOrderLine(lines);
  for (const [lineId, entry] of aggregated) {
    const orderLine = await tx.supplierOrderLine.findUnique({ where: { id: lineId } });
    if (!orderLine) {
      continue;
    }
    const nextReceived = Math.max(0, orderLine.receivedQuantity - entry.quantity);
    await tx.supplierOrderLine.update({
      where: { id: lineId },
      data: { receivedQuantity: nextReceived },
    });
  }
  if (aggregated.size > 0) {
    await recalculateSupplierOrderStatus(tx, supplierOrderId);
  }
  if (locationId && tenantId) {
    await applyIncomingDeltaForReceipt(tx, tenantId, locationId, lines, 1);
  }
}

/** Riconcilia receivedQuantity dopo modifica documento confermato collegato a PO. */
export async function reconcileSupplierOrderReceipt(
  tx: Prisma.TransactionClient,
  supplierOrderId: string,
  oldLines: readonly ReceiptLine[],
  newLines: readonly ReceiptLine[],
  locationId?: string,
  tenantId?: string,
): Promise<void> {
  const oldMap = aggregateReceiptByOrderLine(oldLines);
  const newMap = aggregateReceiptByOrderLine(newLines);
  const allLineIds = new Set([...oldMap.keys(), ...newMap.keys()]);

  for (const lineId of allLineIds) {
    const oldQty = oldMap.get(lineId)?.quantity ?? 0;
    const newQty = newMap.get(lineId)?.quantity ?? 0;
    const delta = newQty - oldQty;
    if (delta === 0) {
      continue;
    }
    const orderLine = await tx.supplierOrderLine.findUnique({ where: { id: lineId } });
    if (!orderLine) {
      continue;
    }
    if (delta > 0) {
      const remaining = orderLine.orderedQuantity - orderLine.receivedQuantity;
      if (delta > remaining) {
        throw new UnprocessableEntityException(
          `Quantità eccessiva per SKU ${orderLine.sku}: rimangono ${remaining} da ricevere sull'ordine.`,
        );
      }
    }
    const nextReceived = Math.max(0, orderLine.receivedQuantity + delta);
    await tx.supplierOrderLine.update({
      where: { id: lineId },
      data: { receivedQuantity: nextReceived },
    });
  }

  if (allLineIds.size > 0) {
    await recalculateSupplierOrderStatus(tx, supplierOrderId);
  }

  if (locationId && tenantId) {
    const oldIncoming = aggregateIncomingByVariant(oldLines);
    const newIncoming = aggregateIncomingByVariant(newLines);
    const variantIds = new Set([...oldIncoming.keys(), ...newIncoming.keys()]);
    for (const variantId of variantIds) {
      const delta = (newIncoming.get(variantId) ?? 0) - (oldIncoming.get(variantId) ?? 0);
      if (delta !== 0) {
        await applyIncomingDelta(tx, tenantId, variantId, locationId, -delta);
      }
    }
  }
}
