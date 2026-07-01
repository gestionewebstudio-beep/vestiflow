import type { DocumentLine } from '@prisma/client';

import {
  applyStockLoad,
  applyStockUnload,
  type StockMovementActor,
} from '../inventory/inventory-movement.util';
import { aggregateStockLines, type StockReconcileResult } from './document-stock-reconcile.util';

/** Applica scarichi manuali per tutte le righe stock del documento. */
export async function applyDocumentStockManualUnloads(
  tx: Parameters<typeof applyStockUnload>[0],
  params: {
    readonly tenantId: string;
    readonly documentId: string;
    readonly reference: string | null;
    readonly locationId: string;
    readonly reason: string;
    readonly lines: readonly DocumentLine[];
    readonly actor: StockMovementActor;
  },
): Promise<void> {
  const reasonBase = params.reference
    ? `Scarico manuale ${params.reference}`
    : 'Scarico manuale';
  const reason = `${reasonBase}: ${params.reason}`;
  const map = aggregateStockLines(params.lines);

  for (const entry of map.values()) {
    await applyStockUnload(tx, {
      tenantId: params.tenantId,
      variantId: entry.variantId,
      sku: entry.sku,
      locationId: params.locationId,
      quantity: entry.quantity,
      reason,
      externalRef: params.documentId,
      actor: params.actor,
    });
  }
}

export async function reconcileDocumentStockManualUnload(
  tx: Parameters<typeof applyStockUnload>[0],
  params: {
    readonly tenantId: string;
    readonly documentId: string;
    readonly reference: string | null;
    readonly oldLocationId: string;
    readonly newLocationId: string;
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

  if (params.oldLocationId !== params.newLocationId) {
    for (const entry of oldMap.values()) {
      await applyStockLoad(tx, {
        tenantId: params.tenantId,
        variantId: entry.variantId,
        sku: entry.sku,
        locationId: params.oldLocationId,
        quantity: entry.quantity,
        reason: `${reasonBase}: cambio location (ripristino scarico)`,
        externalRef,
        actor: params.actor,
      });
      deltas.push({ sku: entry.sku, delta: entry.quantity });
    }
    for (const entry of newMap.values()) {
      await applyStockUnload(tx, {
        tenantId: params.tenantId,
        variantId: entry.variantId,
        sku: entry.sku,
        locationId: params.newLocationId,
        quantity: entry.quantity,
        reason: `${reasonBase}: cambio location (scarico)`,
        externalRef,
        actor: params.actor,
      });
      deltas.push({ sku: entry.sku, delta: -entry.quantity });
    }
    return { deltas };
  }

  const allVariantIds = new Set([...oldMap.keys(), ...newMap.keys()]);
  for (const variantId of allVariantIds) {
    const oldQty = oldMap.get(variantId)?.quantity ?? 0;
    const newEntry = newMap.get(variantId);
    const newQty = newEntry?.quantity ?? 0;
    const sku = newEntry?.sku ?? oldMap.get(variantId)?.sku ?? variantId;
    const unloadDelta = newQty - oldQty;
    if (unloadDelta === 0) {
      continue;
    }
    if (unloadDelta > 0) {
      await applyStockUnload(tx, {
        tenantId: params.tenantId,
        variantId,
        sku,
        locationId: params.newLocationId,
        quantity: unloadDelta,
        reason: `${reasonBase}: rettifica scarico +${unloadDelta}`,
        externalRef,
        actor: params.actor,
      });
    } else {
      await applyStockLoad(tx, {
        tenantId: params.tenantId,
        variantId,
        sku,
        locationId: params.newLocationId,
        quantity: -unloadDelta,
        reason: `${reasonBase}: rettifica scarico ${unloadDelta}`,
        externalRef,
        actor: params.actor,
      });
    }
    deltas.push({ sku, delta: -unloadDelta });
  }

  return { deltas };
}

export async function reverseDocumentStockManualUnload(
  tx: Parameters<typeof applyStockLoad>[0],
  params: {
    readonly tenantId: string;
    readonly documentId: string;
    readonly reference: string | null;
    readonly locationId: string;
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
    await applyStockLoad(tx, {
      tenantId: params.tenantId,
      variantId: entry.variantId,
      sku: entry.sku,
      locationId: params.locationId,
      quantity: entry.quantity,
      reason,
      externalRef: params.documentId,
      actor: params.actor,
    });
    deltas.push({ sku: entry.sku, delta: entry.quantity });
  }

  return { deltas };
}
