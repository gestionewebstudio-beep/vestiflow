import {
  AdjustmentDirection,
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
 * Sync movimenti magazzino ↔ righe Rettifica, per-riga (mirror di
 * document-goods-receipt-sync.util.ts §2).
 *
 * Ogni riga con loadsStock, variante valida e quantità > 0 ha ESATTAMENTE un
 * movimento `adjustment` collegato via sourceLineId (UNIQUE su
 * source_document_type + source_line_id). La direzione (aumento/diminuzione)
 * è un'impostazione di testata, condivisa da tutte le righe del documento.
 *
 * - Riga nuova valida        → crea movimento, giacenza ±qty secondo direzione.
 * - Riga modificata          → aggiorna LO STESSO movimento (mai duplicato).
 * - Location o direzione cambiate → storno pieno + applicazione piena.
 * - Riga eliminata/invalida  → elimina il movimento, storna l'effetto.
 * - Due righe stesso articolo → due movimenti distinti.
 */

export interface AdjustmentSyncResult {
  readonly deltas: readonly { readonly sku: string; readonly delta: number }[];
  readonly syncTargets: readonly { readonly variantId: string; readonly locationId: string }[];
  readonly createdLineIds: readonly string[];
}

interface SyncParams {
  readonly tenantId: string;
  readonly documentId: string;
  readonly documentType: DocumentType;
  /** Location della rettifica; null solo se non ci sono righe valide. */
  readonly locationId: string | null;
  /** Direzione rettifica; null solo se non ci sono righe valide. */
  readonly direction: AdjustmentDirection | null;
  /** Causale movimento, es. "Rettifica RET-2026-0001: Conteggio inventario". */
  readonly reason: string;
  /** Data registrazione: i movimenti collegati la seguono (§2). */
  readonly movementDate?: Date | null;
  /** Righe documento SALVATE (id definitivi). Vuoto = rimuovi tutti i movimenti. */
  readonly lines: readonly DocumentLine[];
  readonly actor: StockMovementActor;
}

function isStockLine(line: DocumentLine): line is DocumentLine & { variantId: string } {
  return line.loadsStock && line.quantity > 0 && line.variantId != null;
}

function signedDelta(direction: AdjustmentDirection, quantity: number): number {
  return direction === AdjustmentDirection.increase ? quantity : -quantity;
}

/**
 * Converte i movimenti "legacy" (aggregati per documento, senza sourceLineId)
 * nel nuovo modello per-riga: ne storna l'effetto netto sulla giacenza e li
 * elimina; il sync per riga successivo ricrea lo stato corretto.
 */
async function convertLegacyAdjustmentMovements(
  tx: Prisma.TransactionClient,
  tenantId: string,
  documentId: string,
): Promise<void> {
  const legacy = await tx.stockMovement.findMany({
    where: {
      tenantId,
      externalRef: documentId,
      sourceLineId: null,
      type: StockMovementType.adjustment,
    },
  });
  if (legacy.length === 0) {
    return;
  }
  const net = new Map<string, { variantId: string; locationId: string; qty: number }>();
  for (const movement of legacy) {
    const key = `${movement.variantId}::${movement.locationId}`;
    const sign = movement.direction === AdjustmentDirection.increase ? 1 : -1;
    const entry = net.get(key) ?? {
      variantId: movement.variantId,
      locationId: movement.locationId,
      qty: 0,
    };
    entry.qty += sign * movement.quantity;
    net.set(key, entry);
  }
  for (const entry of net.values()) {
    await applyInventoryDelta(tx, tenantId, entry.variantId, entry.locationId, -entry.qty);
  }
  await tx.stockMovement.deleteMany({
    where: { id: { in: legacy.map((movement) => movement.id) } },
  });
}

/**
 * Sincronizza i movimenti adjustment collegati alle righe del documento.
 * Idempotente: salvare più volte lo stesso documento non produce doppie
 * rettifiche.
 */
export async function syncAdjustmentLineMovements(
  tx: Prisma.TransactionClient,
  params: SyncParams,
): Promise<AdjustmentSyncResult> {
  const deltas: Array<{ sku: string; delta: number }> = [];
  const syncTargets: Array<{ variantId: string; locationId: string }> = [];
  const createdLineIds: string[] = [];

  await convertLegacyAdjustmentMovements(tx, params.tenantId, params.documentId);

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
  const locationId = params.locationId;
  const direction = params.direction;

  for (const line of validLines) {
    if (!locationId || !direction) {
      // Validato a monte: qui non deve mai arrivare una riga valida senza
      // location o direzione.
      continue;
    }
    const sku = line.sku ?? '';
    const movement = byLineId.get(line.id);

    if (!movement) {
      // Riga nuova → un movimento nuovo collegato alla riga.
      await applyInventoryDelta(
        tx,
        params.tenantId,
        line.variantId,
        locationId,
        signedDelta(direction, line.quantity),
      );
      await tx.stockMovement.create({
        data: {
          tenantId: params.tenantId,
          type: StockMovementType.adjustment,
          origin: MovementOrigin.manual,
          variantId: line.variantId,
          sku,
          locationId,
          quantity: line.quantity,
          direction,
          reason: params.reason,
          externalRef: params.documentId,
          sourceDocumentType: params.documentType,
          sourceDocumentId: params.documentId,
          sourceLineId: line.id,
          ...(params.movementDate ? { createdAt: params.movementDate } : {}),
          createdById: params.actor.createdById ?? null,
          createdByName: params.actor.createdByName,
        },
      });
      deltas.push({ sku, delta: signedDelta(direction, line.quantity) });
      syncTargets.push({ variantId: line.variantId, locationId });
      createdLineIds.push(line.id);
      continue;
    }

    byLineId.delete(line.id);

    // Location, direzione o variante diverse = l'effetto va spostato per
    // intero sulla nuova combinazione, non solo aggiornato il movimento.
    const shapeChanged =
      movement.locationId !== locationId ||
      movement.direction !== direction ||
      movement.variantId !== line.variantId;

    if (shapeChanged) {
      const oldDirection = movement.direction ?? AdjustmentDirection.increase;
      // Storno completo del vecchio effetto, applicazione piena del nuovo.
      await applyInventoryDelta(
        tx,
        params.tenantId,
        movement.variantId,
        movement.locationId,
        -signedDelta(oldDirection, movement.quantity),
      );
      await applyInventoryDelta(
        tx,
        params.tenantId,
        line.variantId,
        locationId,
        signedDelta(direction, line.quantity),
      );
      syncTargets.push({ variantId: movement.variantId, locationId: movement.locationId });
      syncTargets.push({ variantId: line.variantId, locationId });
      deltas.push({
        sku,
        delta: signedDelta(direction, line.quantity) - signedDelta(oldDirection, movement.quantity),
      });
    } else {
      const quantityDelta = line.quantity - movement.quantity;
      if (quantityDelta !== 0) {
        await applyInventoryDelta(
          tx,
          params.tenantId,
          line.variantId,
          locationId,
          signedDelta(direction, quantityDelta),
        );
        syncTargets.push({ variantId: line.variantId, locationId });
        deltas.push({ sku, delta: signedDelta(direction, quantityDelta) });
      }
    }

    const movementDateChanged =
      params.movementDate != null && movement.createdAt.getTime() !== params.movementDate.getTime();
    const quantityChanged = movement.quantity !== line.quantity;

    const needsUpdate =
      shapeChanged ||
      quantityChanged ||
      movement.sku !== sku ||
      movement.reason !== params.reason ||
      movementDateChanged;

    if (needsUpdate) {
      await tx.stockMovement.update({
        where: { id: movement.id },
        data: {
          variantId: line.variantId,
          sku,
          locationId,
          quantity: line.quantity,
          direction,
          reason: params.reason,
          ...(params.movementDate ? { createdAt: params.movementDate } : {}),
        },
      });
    }
  }

  // Movimenti orfani (riga eliminata o non più valida) → rimozione del
  // movimento e ripristino della giacenza precedentemente rettificata.
  for (const movement of byLineId.values()) {
    const oldDirection = movement.direction ?? AdjustmentDirection.increase;
    await applyInventoryDelta(
      tx,
      params.tenantId,
      movement.variantId,
      movement.locationId,
      -signedDelta(oldDirection, movement.quantity),
    );
    await tx.stockMovement.delete({ where: { id: movement.id } });
    deltas.push({ sku: movement.sku, delta: -signedDelta(oldDirection, movement.quantity) });
    syncTargets.push({ variantId: movement.variantId, locationId: movement.locationId });
  }

  return { deltas, syncTargets, createdLineIds };
}

/** Causale movimento: "Rettifica RET-2026-0001: Conteggio inventario". */
export function buildAdjustmentMovementReason(params: {
  readonly reference: string | null;
  readonly reason: string;
}): string {
  const base = params.reference ? `Rettifica ${params.reference}` : 'Rettifica inventario';
  return `${base}: ${params.reason}`;
}
