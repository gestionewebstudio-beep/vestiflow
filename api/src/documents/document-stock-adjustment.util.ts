import { AdjustmentDirection, type DocumentLine } from '@prisma/client';

import {
  applyStockAdjustment,
  type StockMovementActor,
} from '../inventory/inventory-movement.util';
import { aggregateStockLines, type StockReconcileResult } from './document-stock-reconcile.util';

function oppositeDirection(direction: AdjustmentDirection): AdjustmentDirection {
  return direction === AdjustmentDirection.increase
    ? AdjustmentDirection.decrease
    : AdjustmentDirection.increase;
}

export async function reconcileDocumentStockAdjustment(
  tx: Parameters<typeof applyStockAdjustment>[0],
  params: {
    readonly tenantId: string;
    readonly documentId: string;
    readonly reference: string | null;
    readonly reason: string;
    readonly oldLocationId: string;
    readonly newLocationId: string;
    readonly oldDirection: AdjustmentDirection;
    readonly newDirection: AdjustmentDirection;
    readonly oldLines: readonly DocumentLine[];
    readonly newLines: readonly DocumentLine[];
    readonly actor: StockMovementActor;
  },
): Promise<StockReconcileResult> {
  const reasonBase = params.reference ? `Modifica ${params.reference}` : 'Modifica documento';
  const externalRef = params.documentId;
  const oldMap = aggregateStockLines(params.oldLines);
  const newMap = aggregateStockLines(params.newLines);
  const deltas: Array<{ sku: string; delta: number }> = [];

  const contextChanged =
    params.oldLocationId !== params.newLocationId ||
    params.oldDirection !== params.newDirection;

  if (contextChanged) {
    for (const entry of oldMap.values()) {
      await applyStockAdjustment(tx, {
        tenantId: params.tenantId,
        variantId: entry.variantId,
        sku: entry.sku,
        locationId: params.oldLocationId,
        quantity: entry.quantity,
        direction: oppositeDirection(params.oldDirection),
        reason: `${reasonBase}: storno (${params.reason})`,
        externalRef,
        actor: params.actor,
      });
      const sign = params.oldDirection === AdjustmentDirection.increase ? 1 : -1;
      deltas.push({ sku: entry.sku, delta: -sign * entry.quantity });
    }
    for (const entry of newMap.values()) {
      await applyStockAdjustment(tx, {
        tenantId: params.tenantId,
        variantId: entry.variantId,
        sku: entry.sku,
        locationId: params.newLocationId,
        quantity: entry.quantity,
        direction: params.newDirection,
        reason: `${reasonBase}: rettifica (${params.reason})`,
        externalRef,
        actor: params.actor,
      });
      const sign = params.newDirection === AdjustmentDirection.increase ? 1 : -1;
      deltas.push({ sku: entry.sku, delta: sign * entry.quantity });
    }
    return { deltas };
  }

  const allVariantIds = new Set([...oldMap.keys(), ...newMap.keys()]);
  for (const variantId of allVariantIds) {
    const oldQty = oldMap.get(variantId)?.quantity ?? 0;
    const newEntry = newMap.get(variantId);
    const newQty = newEntry?.quantity ?? 0;
    const sku = newEntry?.sku ?? oldMap.get(variantId)?.sku ?? variantId;
    const qtyDelta = newQty - oldQty;
    if (qtyDelta === 0) {
      continue;
    }
    if (qtyDelta > 0) {
      await applyStockAdjustment(tx, {
        tenantId: params.tenantId,
        variantId,
        sku,
        locationId: params.newLocationId,
        quantity: qtyDelta,
        direction: params.newDirection,
        reason: `${reasonBase}: +${qtyDelta} (${params.reason})`,
        externalRef,
        actor: params.actor,
      });
    } else {
      await applyStockAdjustment(tx, {
        tenantId: params.tenantId,
        variantId,
        sku,
        locationId: params.newLocationId,
        quantity: -qtyDelta,
        direction: oppositeDirection(params.newDirection),
        reason: `${reasonBase}: ${qtyDelta} (${params.reason})`,
        externalRef,
        actor: params.actor,
      });
    }
    const sign = params.newDirection === AdjustmentDirection.increase ? 1 : -1;
    deltas.push({ sku, delta: sign * qtyDelta });
  }

  return { deltas };
}

export async function reverseDocumentStockAdjustment(
  tx: Parameters<typeof applyStockAdjustment>[0],
  params: {
    readonly tenantId: string;
    readonly documentId: string;
    readonly reference: string | null;
    readonly reason: string;
    readonly locationId: string;
    readonly direction: AdjustmentDirection;
    readonly lines: readonly DocumentLine[];
    readonly actor: StockMovementActor;
  },
): Promise<StockReconcileResult> {
  const reason = params.reference
    ? `Annullamento ${params.reference}`
    : 'Annullamento documento';
  const map = aggregateStockLines(params.lines);
  const deltas: Array<{ sku: string; delta: number }> = [];

  for (const entry of map.values()) {
    await applyStockAdjustment(tx, {
      tenantId: params.tenantId,
      variantId: entry.variantId,
      sku: entry.sku,
      locationId: params.locationId,
      quantity: entry.quantity,
      direction: oppositeDirection(params.direction),
      reason: `${reason}: ${params.reason}`,
      externalRef: params.documentId,
      actor: params.actor,
    });
    const sign = params.direction === AdjustmentDirection.increase ? 1 : -1;
    deltas.push({ sku: entry.sku, delta: -sign * entry.quantity });
  }

  return { deltas };
}
