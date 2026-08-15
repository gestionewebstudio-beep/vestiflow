import type { DocumentLine } from '@prisma/client';

import {
  applyStockLoad,
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
  const reason = params.reference ? `Annullamento ${params.reference}` : 'Annullamento documento';
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
 * ⚠️ `reconcileDocumentStockUnload` viveva qui, ed è stata **rimossa il
 * 15/08/2026**. Riconciliava le giacenze dopo la modifica di un DDT
 * aggregando per variante e **accodando** movimenti «rettifica scarico +1»:
 * la giacenza tornava giusta, ma il registro raccontava un'uscita e un
 * rientro che non erano mai avvenuti — il documento era solo stato corretto.
 *
 * Al suo posto c'è `document-stock-unload-sync.util.ts`: un movimento per
 * riga, ritrovato via `sourceLineId` e **aggiornato in posto**. Non è un
 * ripiego temporaneo, ed è il motivo per cui questa funzione non deve
 * tornare: vedi `docs/09-specifica-movimenti-per-riga.md`.
 */

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
  const reason = params.reference ? `Annullamento ${params.reference}` : 'Annullamento documento';
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
