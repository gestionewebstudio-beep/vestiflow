import type { DocumentLine } from '@prisma/client';
import type { Prisma } from '@prisma/client';

import { applyInventoryDelta } from '../inventory/inventory-level-delta.util';
import { aggregateStockLines, type StockReconcileResult } from './document-stock-reconcile.util';

/**
 * Scarico manuale DIRETTO (prompt Scarico manuale, 2026-07).
 *
 * DEROGA DOCUMENTATA alla regola "ogni modifica inventariale produce un
 * movimento tracciabile" (regole-gestionale §Movimenti): per il SOLO tipo
 * `manual_unload` il salvataggio sottrae le quantità dalla giacenza in modo
 * diretto, SENZA creare righe `StockMovement`. Scelta esplicita del cliente
 * per gli scarichi informali (campionario, omaggi, merce deteriorata):
 * - il documento resta l'unica evidenza dello scarico finché esiste;
 * - l'eliminazione del documento NON ripristina le giacenze;
 * - quantità oltre la giacenza ammesse (policy non bloccante, avviso in UI).
 *
 * La sincronizzazione canali (Shopify/TikTok) NON dipende dai movimenti:
 * legge la giacenza attuale — il chiamante DEVE comunque eseguire il push
 * inventario post-commit come per ogni altro flusso.
 */
export async function applyDocumentStockManualUnloads(
  tx: Prisma.TransactionClient,
  params: {
    readonly tenantId: string;
    readonly locationId: string;
    readonly lines: readonly DocumentLine[];
  },
): Promise<StockReconcileResult> {
  const map = aggregateStockLines(params.lines);
  const deltas: Array<{ sku: string; delta: number }> = [];

  for (const entry of map.values()) {
    await applyInventoryDelta(
      tx,
      params.tenantId,
      entry.variantId,
      params.locationId,
      -entry.quantity,
    );
    deltas.push({ sku: entry.sku, delta: -entry.quantity });
  }

  return { deltas };
}

/**
 * Riconcilia a delta la modifica di uno scarico manuale già salvato, sempre
 * senza movimenti: evita la doppia sottrazione (es. quantità 3 → 5 scarica
 * solo +2; 5 → 3 ricarica 2). Su cambio location ripristina la vecchia e
 * scarica sulla nuova.
 */
export async function reconcileDocumentStockManualUnload(
  tx: Prisma.TransactionClient,
  params: {
    readonly tenantId: string;
    readonly oldLocationId: string;
    readonly newLocationId: string;
    readonly oldLines: readonly DocumentLine[];
    readonly newLines: readonly DocumentLine[];
  },
): Promise<StockReconcileResult> {
  const oldMap = aggregateStockLines(params.oldLines);
  const newMap = aggregateStockLines(params.newLines);
  const deltas: Array<{ sku: string; delta: number }> = [];

  if (params.oldLocationId !== params.newLocationId) {
    for (const entry of oldMap.values()) {
      await applyInventoryDelta(
        tx,
        params.tenantId,
        entry.variantId,
        params.oldLocationId,
        entry.quantity,
      );
      deltas.push({ sku: entry.sku, delta: entry.quantity });
    }
    for (const entry of newMap.values()) {
      await applyInventoryDelta(
        tx,
        params.tenantId,
        entry.variantId,
        params.newLocationId,
        -entry.quantity,
      );
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
    await applyInventoryDelta(
      tx,
      params.tenantId,
      variantId,
      params.newLocationId,
      -unloadDelta,
    );
    deltas.push({ sku, delta: -unloadDelta });
  }

  return { deltas };
}
