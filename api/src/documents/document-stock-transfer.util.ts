import type { DocumentLine } from '@prisma/client';

import {
  applyStockTransfer,
  type StockMovementActor,
} from '../inventory/inventory-movement.util';
import { aggregateStockLines, type StockReconcileResult } from './document-stock-reconcile.util';

export interface DocumentTransferLocations {
  readonly originLocationId: string;
  readonly targetLocationId: string;
}

/** Applica trasferimenti per tutte le righe stock del documento. */
export async function applyDocumentStockTransfers(
  tx: Parameters<typeof applyStockTransfer>[0],
  params: {
    readonly tenantId: string;
    readonly documentId: string;
    readonly reference: string | null;
    readonly locations: DocumentTransferLocations;
    readonly lines: readonly DocumentLine[];
    readonly actor: StockMovementActor;
    readonly reasonSuffix?: string;
  },
): Promise<void> {
  const reasonBase = params.reference
    ? `Trasferimento ${params.reference}`
    : 'Trasferimento interno';
  const reason = params.reasonSuffix ? `${reasonBase}${params.reasonSuffix}` : reasonBase;
  const map = aggregateStockLines(params.lines);

  for (const entry of map.values()) {
    await applyStockTransfer(tx, {
      tenantId: params.tenantId,
      variantId: entry.variantId,
      sku: entry.sku,
      locationId: params.locations.originLocationId,
      targetLocationId: params.locations.targetLocationId,
      quantity: entry.quantity,
      reason,
      externalRef: params.documentId,
      actor: params.actor,
    });
  }
}

/**
 * Riconcilia trasferimenti dopo modifica documento confermato.
 * Delta nel risultato = variazione netta sulla location origine (negativo = più uscita).
 */
export async function reconcileDocumentStockTransfer(
  tx: Parameters<typeof applyStockTransfer>[0],
  params: {
    readonly tenantId: string;
    readonly documentId: string;
    readonly reference: string | null;
    readonly oldLocations: DocumentTransferLocations;
    readonly newLocations: DocumentTransferLocations;
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

  const locationsChanged =
    params.oldLocations.originLocationId !== params.newLocations.originLocationId ||
    params.oldLocations.targetLocationId !== params.newLocations.targetLocationId;

  if (locationsChanged) {
    for (const entry of oldMap.values()) {
      await applyStockTransfer(tx, {
        tenantId: params.tenantId,
        variantId: entry.variantId,
        sku: entry.sku,
        locationId: params.oldLocations.targetLocationId,
        targetLocationId: params.oldLocations.originLocationId,
        quantity: entry.quantity,
        reason: `${reasonBase}: cambio sedi (storno)`,
        externalRef,
        actor: params.actor,
      });
      deltas.push({ sku: entry.sku, delta: entry.quantity });
    }
    for (const entry of newMap.values()) {
      await applyStockTransfer(tx, {
        tenantId: params.tenantId,
        variantId: entry.variantId,
        sku: entry.sku,
        locationId: params.newLocations.originLocationId,
        targetLocationId: params.newLocations.targetLocationId,
        quantity: entry.quantity,
        reason: `${reasonBase}: cambio sedi (trasferimento)`,
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
    const transferDelta = newQty - oldQty;
    if (transferDelta === 0) {
      continue;
    }
    if (transferDelta > 0) {
      await applyStockTransfer(tx, {
        tenantId: params.tenantId,
        variantId,
        sku,
        locationId: params.newLocations.originLocationId,
        targetLocationId: params.newLocations.targetLocationId,
        quantity: transferDelta,
        reason: `${reasonBase}: rettifica +${transferDelta}`,
        externalRef,
        actor: params.actor,
      });
    } else {
      await applyStockTransfer(tx, {
        tenantId: params.tenantId,
        variantId,
        sku,
        locationId: params.newLocations.targetLocationId,
        targetLocationId: params.newLocations.originLocationId,
        quantity: -transferDelta,
        reason: `${reasonBase}: rettifica ${transferDelta}`,
        externalRef,
        actor: params.actor,
      });
    }
    deltas.push({ sku, delta: -transferDelta });
  }

  return { deltas };
}

/** Storna trasferimenti (annullamento documento confermato). */
export async function reverseDocumentStockTransfer(
  tx: Parameters<typeof applyStockTransfer>[0],
  params: {
    readonly tenantId: string;
    readonly documentId: string;
    readonly reference: string | null;
    readonly locations: DocumentTransferLocations;
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
    await applyStockTransfer(tx, {
      tenantId: params.tenantId,
      variantId: entry.variantId,
      sku: entry.sku,
      locationId: params.locations.targetLocationId,
      targetLocationId: params.locations.originLocationId,
      quantity: entry.quantity,
      reason,
      externalRef: params.documentId,
      actor: params.actor,
    });
    deltas.push({ sku: entry.sku, delta: entry.quantity });
  }

  return { deltas };
}
