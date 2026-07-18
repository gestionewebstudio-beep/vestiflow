import { UnprocessableEntityException } from '@nestjs/common';
import {
  DocumentStatus,
  SupplierOrderStatus,
  type DocumentLine,
  type Prisma,
} from '@prisma/client';

type ReceiptLine = Pick<DocumentLine, 'variantId' | 'sku' | 'quantity' | 'loadsStock'> & {
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

/**
 * Stato ordine (prompt 2026-07): Concluso quando esiste almeno un Arrivo
 * merce attivo (non annullato) agganciato all'ordine, altrimenti torna
 * Confermato. Gli ordini annullati non cambiano mai stato da qui.
 * `excludeDocumentId` serve ad annullo/eliminazione documento: nel momento
 * della verifica il documento è ancora attivo nel DB ma sta per sparire.
 */
export async function syncSupplierOrderConclusion(
  tx: Prisma.TransactionClient,
  supplierOrderId: string,
  excludeDocumentId?: string,
): Promise<void> {
  const order = await tx.supplierOrder.findUnique({
    where: { id: supplierOrderId },
    select: { status: true },
  });
  if (!order || order.status === SupplierOrderStatus.cancelled) {
    return;
  }
  const activeLinkedDocuments = await tx.document.count({
    where: {
      supplierOrderId,
      status: { not: DocumentStatus.cancelled },
      ...(excludeDocumentId ? { id: { not: excludeDocumentId } } : {}),
    },
  });
  const nextStatus =
    activeLinkedDocuments > 0
      ? SupplierOrderStatus.concluded
      : SupplierOrderStatus.confirmed;
  if (nextStatus !== order.status) {
    await tx.supplierOrder.update({
      where: { id: supplierOrderId },
      data: { status: nextStatus },
    });
  }
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

/**
 * Annullo/eliminazione dell'Arrivo merce collegato: decrementa il ricevuto
 * delle righe ordine e, se non restano altri documenti attivi agganciati,
 * riporta l'ordine da Concluso a Confermato. Nessun effetto su giacenze o
 * disponibilità: l'ordine fornitore non tocca mai il magazzino.
 */
export async function reverseSupplierOrderReceipt(
  tx: Prisma.TransactionClient,
  supplierOrderId: string,
  lines: readonly ReceiptLine[],
  excludeDocumentId?: string,
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
  await syncSupplierOrderConclusion(tx, supplierOrderId, excludeDocumentId);
}

/**
 * Salvataggio di un Arrivo merce agganciato all'ordine: riconcilia il
 * ricevuto per riga e marca l'ordine Concluso (il collegamento è visibile
 * in entrambi i documenti).
 */
export async function reconcileSupplierOrderReceipt(
  tx: Prisma.TransactionClient,
  supplierOrderId: string,
  oldLines: readonly ReceiptLine[],
  newLines: readonly ReceiptLine[],
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

  await syncSupplierOrderConclusion(tx, supplierOrderId);
}
