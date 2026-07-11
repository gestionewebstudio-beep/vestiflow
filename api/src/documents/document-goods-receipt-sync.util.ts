import {
  MovementOrigin,
  Prisma,
  StockMovementType,
  type DocumentLine,
  type DocumentType,
  type StockMovement,
} from '@prisma/client';

import { applyInventoryDelta } from '../inventory/inventory-level-delta.util';
import type { StockMovementActor } from '../inventory/inventory-movement.util';

/**
 * Sync movimenti magazzino ↔ righe Arrivo merce (prompt §2).
 *
 * La riga documento è la sorgente del movimento: ogni riga con loadsStock,
 * variante valida e quantità > 0 ha ESATTAMENTE un movimento collegato via
 * sourceLineId (UNIQUE su source_document_type + source_line_id).
 *
 * - Riga nuova valida        → crea movimento, giacenza +qty (caso A).
 * - Riga modificata          → aggiorna LO STESSO movimento, giacenza ±delta (casi B/C).
 * - Riga eliminata/invalida  → elimina il movimento, giacenza -qty (caso D).
 * - Documento eliminato      → sync con righe vuote rimuove tutto (caso E).
 * - Due righe stesso articolo → due movimenti distinti (caso F).
 *
 * Nessuno storno visibile per le modifiche ordinarie (§2.5): il movimento
 * viene aggiornato in place, mai raddoppiato (§2.4).
 */

export interface GoodsReceiptSyncResult {
  readonly deltas: readonly { readonly sku: string; readonly delta: number }[];
  readonly syncTargets: readonly { readonly variantId: string; readonly locationId: string }[];
  /** Righe che hanno generato un movimento NUOVO (per lotti/seriali una tantum). */
  readonly createdLineIds: readonly string[];
}

interface SyncParams {
  readonly tenantId: string;
  readonly documentId: string;
  readonly documentType: DocumentType;
  /** Location di destinazione del documento; null solo se non ci sono righe valide. */
  readonly locationId: string | null;
  /** Causale movimento, es. "Arrivo 3 del 30/05/2026 (DDT 145 del 08/05/2026)". */
  readonly reason: string;
  /** Righe documento SALVATE (id definitivi). Vuoto = rimuovi tutti i movimenti. */
  readonly lines: readonly DocumentLine[];
  readonly actor: StockMovementActor;
}

function isStockLine(line: DocumentLine): line is DocumentLine & { variantId: string } {
  return line.loadsStock && line.quantity > 0 && line.variantId != null;
}

/** Costo unitario effettivo riga (netto sconto), in unità minori. */
function effectiveUnitCostMinor(line: DocumentLine): number {
  return Math.round((line.unitPriceMinor * (100 - line.discountPercent)) / 100);
}

const INSUFFICIENT_MESSAGE = (available: number, requested: number): string =>
  `Impossibile ridurre il carico di ${requested} pezzi: disponibili ${available} ` +
  '(la merce potrebbe essere già stata venduta o trasferita).';

/**
 * Converte i movimenti "legacy" (aggregati per documento, senza sourceLineId)
 * nel nuovo modello per-riga: ne storna l'effetto netto sulla giacenza e li
 * elimina; il sync per riga successivo ricrea lo stato corretto.
 */
async function convertLegacyMovements(
  tx: Prisma.TransactionClient,
  tenantId: string,
  documentId: string,
): Promise<void> {
  const legacy = await tx.stockMovement.findMany({
    where: {
      tenantId,
      externalRef: documentId,
      sourceLineId: null,
      type: { in: [StockMovementType.load, StockMovementType.unload] },
    },
  });
  if (legacy.length === 0) {
    return;
  }
  // Effetto netto per variante × location (i vecchi salvataggi creavano
  // rettifiche load/unload aggiuntive con lo stesso externalRef).
  const net = new Map<string, { variantId: string; locationId: string; qty: number }>();
  for (const movement of legacy) {
    const key = `${movement.variantId}::${movement.locationId}`;
    const sign = movement.type === StockMovementType.load ? 1 : -1;
    const entry = net.get(key) ?? {
      variantId: movement.variantId,
      locationId: movement.locationId,
      qty: 0,
    };
    entry.qty += sign * movement.quantity;
    net.set(key, entry);
  }
  for (const entry of net.values()) {
    await applyInventoryDelta(tx, tenantId, entry.variantId, entry.locationId, -entry.qty, {
      insufficientMessage: INSUFFICIENT_MESSAGE,
    });
  }
  await tx.stockMovement.deleteMany({
    where: { id: { in: legacy.map((movement) => movement.id) } },
  });
}

/**
 * Sincronizza i movimenti collegati alle righe del documento. Idempotente:
 * salvare più volte lo stesso documento non produce doppi carichi (§2.4).
 */
export async function syncGoodsReceiptLineMovements(
  tx: Prisma.TransactionClient,
  params: SyncParams,
): Promise<GoodsReceiptSyncResult> {
  const deltas: Array<{ sku: string; delta: number }> = [];
  const syncTargets: Array<{ variantId: string; locationId: string }> = [];
  const createdLineIds: string[] = [];

  await convertLegacyMovements(tx, params.tenantId, params.documentId);

  const existing = await tx.stockMovement.findMany({
    where: {
      tenantId: params.tenantId,
      sourceDocumentType: params.documentType,
      sourceDocumentId: params.documentId,
    },
  });
  const byLineId = new Map<string, StockMovement>(
    existing
      .filter((movement) => movement.sourceLineId != null)
      .map((movement) => [movement.sourceLineId as string, movement]),
  );

  const validLines = params.lines.filter(isStockLine);

  for (const line of validLines) {
    const locationId = params.locationId;
    if (!locationId) {
      // Validato a monte: qui non deve mai arrivare una riga valida senza location.
      continue;
    }
    const sku = line.sku ?? '';
    const unitCostMinor = effectiveUnitCostMinor(line);
    const movement = byLineId.get(line.id);

    if (!movement) {
      // Caso A: riga nuova → un movimento nuovo collegato alla riga.
      await applyInventoryDelta(tx, params.tenantId, line.variantId, locationId, line.quantity);
      await tx.stockMovement.create({
        data: {
          tenantId: params.tenantId,
          type: StockMovementType.load,
          origin: MovementOrigin.manual,
          variantId: line.variantId,
          sku,
          locationId,
          quantity: line.quantity,
          reason: params.reason,
          externalRef: params.documentId,
          sourceDocumentType: params.documentType,
          sourceDocumentId: params.documentId,
          sourceLineId: line.id,
          unitCostMinor,
          totalCostMinor: line.lineTotalMinor,
          createdById: params.actor.createdById ?? null,
          createdByName: params.actor.createdByName,
        },
      });
      deltas.push({ sku, delta: line.quantity });
      syncTargets.push({ variantId: line.variantId, locationId });
      createdLineIds.push(line.id);
      continue;
    }

    byLineId.delete(line.id);

    const locationChanged = movement.locationId !== locationId;
    const quantityDelta = line.quantity - movement.quantity;

    if (locationChanged) {
      // Storno completo sulla vecchia location, carico sulla nuova.
      await applyInventoryDelta(
        tx,
        params.tenantId,
        movement.variantId,
        movement.locationId,
        -movement.quantity,
        { insufficientMessage: INSUFFICIENT_MESSAGE },
      );
      await applyInventoryDelta(tx, params.tenantId, line.variantId, locationId, line.quantity);
      syncTargets.push({ variantId: movement.variantId, locationId: movement.locationId });
      syncTargets.push({ variantId: line.variantId, locationId });
      deltas.push({ sku, delta: line.quantity - movement.quantity });
    } else if (quantityDelta !== 0) {
      // Casi B/C: la giacenza si muove solo della differenza effettiva.
      await applyInventoryDelta(
        tx,
        params.tenantId,
        line.variantId,
        locationId,
        quantityDelta,
        { insufficientMessage: INSUFFICIENT_MESSAGE },
      );
      syncTargets.push({ variantId: line.variantId, locationId });
      deltas.push({ sku, delta: quantityDelta });
    }

    const needsUpdate =
      locationChanged ||
      quantityDelta !== 0 ||
      movement.variantId !== line.variantId ||
      movement.sku !== sku ||
      movement.reason !== params.reason ||
      movement.unitCostMinor !== unitCostMinor ||
      movement.totalCostMinor !== line.lineTotalMinor;

    if (needsUpdate) {
      await tx.stockMovement.update({
        where: { id: movement.id },
        data: {
          variantId: line.variantId,
          sku,
          locationId,
          quantity: line.quantity,
          reason: params.reason,
          unitCostMinor,
          totalCostMinor: line.lineTotalMinor,
        },
      });
    }
  }

  // Caso D/E: movimenti orfani (riga eliminata o non più valida) → rimozione
  // del movimento e della quantità precedentemente caricata.
  for (const movement of byLineId.values()) {
    await applyInventoryDelta(
      tx,
      params.tenantId,
      movement.variantId,
      movement.locationId,
      -movement.quantity,
      { insufficientMessage: INSUFFICIENT_MESSAGE },
    );
    await tx.stockMovement.delete({ where: { id: movement.id } });
    deltas.push({ sku: movement.sku, delta: -movement.quantity });
    syncTargets.push({ variantId: movement.variantId, locationId: movement.locationId });
  }

  return { deltas, syncTargets, createdLineIds };
}

/** Causale movimento: "Arrivo 3 del 30/05/2026 (DDT 145 del 08/05/2026)" (§2.6). */
export function buildGoodsReceiptMovementReason(params: {
  readonly number: number | null;
  readonly reference: string | null;
  readonly documentDate: Date;
  readonly causalText: string | null;
}): string {
  const dateLabel = params.documentDate.toLocaleDateString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const base =
    params.number != null
      ? `Arrivo ${params.number} del ${dateLabel}`
      : params.reference
        ? `Arrivo ${params.reference} del ${dateLabel}`
        : `Arrivo merce del ${dateLabel}`;
  const causal = params.causalText?.trim();
  return causal ? `${base} (${causal})` : base;
}
