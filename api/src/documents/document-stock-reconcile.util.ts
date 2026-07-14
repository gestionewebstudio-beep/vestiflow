import type { DocumentLine } from '@prisma/client';

import {
  applyStockLoad,
  applyStockSale,
  applyStockUnload,
  type StockMovementActor,
} from '../inventory/inventory-movement.util';

export interface StockLineAggregate {
  readonly variantId: string;
  readonly sku: string;
  readonly quantity: number;
}

/** Aggrega quantità carico per variante (righe con loadsStock e qty > 0). */
export function aggregateStockLines(
  lines: readonly Pick<DocumentLine, 'variantId' | 'sku' | 'quantity' | 'loadsStock'>[],
): Map<string, StockLineAggregate> {
  const map = new Map<string, StockLineAggregate>();
  for (const line of lines) {
    if (!line.loadsStock || line.quantity <= 0 || !line.variantId) {
      continue;
    }
    const existing = map.get(line.variantId);
    map.set(line.variantId, {
      variantId: line.variantId,
      sku: line.sku ?? existing?.sku ?? '',
      quantity: (existing?.quantity ?? 0) + line.quantity,
    });
  }
  return map;
}

export interface StockReconcileResult {
  readonly deltas: readonly { readonly sku: string; readonly delta: number }[];
}

/** Storna tutti i carichi generati dal documento (annullamento). */
export async function reverseDocumentStockLoad(
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
    deltas.push({ sku: entry.sku, delta: -entry.quantity });
  }

  return { deltas };
}

/**
 * Riconcilia giacenze dopo modifica DDT vendita / documento con scarico.
 * Delta nel risultato = variazione inventario (negativo = più scarico).
 */
export async function reconcileDocumentStockUnload(
  tx: Parameters<typeof applyStockSale>[0],
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
      await applyStockSale(tx, {
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
      await applyStockSale(tx, {
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

/** Ripristina giacenza dopo annullamento documento con scarico (es. DDT vendita). */
export async function reverseDocumentStockUnload(
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

export function buildRevisionSummary(
  linesChanged: boolean,
  stockDeltas: readonly { readonly sku: string; readonly delta: number }[],
  cancelled = false,
): string {
  if (cancelled) {
    if (stockDeltas.length === 0) {
      return 'Documento annullato.';
    }
    const parts = stockDeltas.map((d) => `${d.sku} ${d.delta > 0 ? '+' : ''}${d.delta}`);
    return `Documento annullato; giacenza stornata: ${parts.join(', ')}.`;
  }
  const chunks: string[] = [];
  if (linesChanged) {
    chunks.push('righe aggiornate');
  }
  if (stockDeltas.length > 0) {
    const parts = stockDeltas.map((d) => `${d.sku} ${d.delta > 0 ? '+' : ''}${d.delta}`);
    chunks.push(`giacenza: ${parts.join(', ')}`);
  }
  return chunks.length > 0 ? `Modifica documento (${chunks.join('; ')})` : 'Modifica documento';
}
