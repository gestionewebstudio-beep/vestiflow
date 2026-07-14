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
 * Sync movimenti magazzino ↔ righe Trasferimento, per-riga (mirror di
 * document-goods-receipt-sync.util.ts §2).
 *
 * Ogni riga con loadsStock, variante valida e quantità > 0 ha ESATTAMENTE un
 * movimento `transfer` collegato via sourceLineId (UNIQUE su
 * source_document_type + source_line_id). Il movimento porta sia la location
 * di origine (locationId) sia quella di destinazione (targetLocationId) sulla
 * STESSA riga — un solo movimento per riga, non due (carico/scarico separati).
 *
 * - Riga nuova valida        → crea movimento, -qty origine / +qty destinazione.
 * - Riga modificata          → aggiorna LO STESSO movimento (mai duplicato).
 * - Origine/destinazione o variante cambiate → storno pieno + carico pieno.
 * - Riga eliminata/invalida  → elimina il movimento, storna l'effetto.
 * - Due righe stesso articolo → due movimenti distinti.
 */

export interface TransferSyncResult {
  readonly deltas: readonly { readonly sku: string; readonly delta: number }[];
  readonly syncTargets: readonly { readonly variantId: string; readonly locationId: string }[];
  readonly createdLineIds: readonly string[];
}

interface SyncParams {
  readonly tenantId: string;
  readonly documentId: string;
  readonly documentType: DocumentType;
  /** Location di origine; null solo se non ci sono righe valide. */
  readonly originLocationId: string | null;
  /** Location di destinazione; null solo se non ci sono righe valide. */
  readonly targetLocationId: string | null;
  /** Causale movimento, es. "Trasferimento TR-2026-0002 del 11/07/2026". */
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

/**
 * Converte i movimenti "legacy" (aggregati per documento, senza sourceLineId)
 * nel nuovo modello per-riga: ne storna l'effetto netto sulla giacenza (due
 * location per movimento) e li elimina; il sync per riga successivo ricrea lo
 * stato corretto.
 */
async function convertLegacyTransferMovements(
  tx: Prisma.TransactionClient,
  tenantId: string,
  documentId: string,
): Promise<void> {
  const legacy = await tx.stockMovement.findMany({
    where: {
      tenantId,
      externalRef: documentId,
      sourceLineId: null,
      type: StockMovementType.transfer,
    },
  });
  if (legacy.length === 0) {
    return;
  }
  // Effetto netto per variante × location: ogni riga legacy scarica
  // locationId e carica targetLocationId della stessa quantità.
  const net = new Map<string, { variantId: string; locationId: string; qty: number }>();
  const addEffect = (variantId: string, locationId: string, qty: number): void => {
    const key = `${variantId}::${locationId}`;
    const entry = net.get(key) ?? { variantId, locationId, qty: 0 };
    entry.qty += qty;
    net.set(key, entry);
  };
  for (const movement of legacy) {
    addEffect(movement.variantId, movement.locationId, -movement.quantity);
    if (movement.targetLocationId) {
      addEffect(movement.variantId, movement.targetLocationId, movement.quantity);
    }
  }
  for (const entry of net.values()) {
    await applyInventoryDelta(tx, tenantId, entry.variantId, entry.locationId, -entry.qty);
  }
  await tx.stockMovement.deleteMany({
    where: { id: { in: legacy.map((movement) => movement.id) } },
  });
}

/**
 * Sincronizza i movimenti transfer collegati alle righe del documento.
 * Idempotente: salvare più volte lo stesso documento non produce doppi
 * trasferimenti.
 */
export async function syncTransferLineMovements(
  tx: Prisma.TransactionClient,
  params: SyncParams,
): Promise<TransferSyncResult> {
  const deltas: Array<{ sku: string; delta: number }> = [];
  const syncTargets: Array<{ variantId: string; locationId: string }> = [];
  const createdLineIds: string[] = [];

  await convertLegacyTransferMovements(tx, params.tenantId, params.documentId);

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
  const originLocationId = params.originLocationId;
  const targetLocationId = params.targetLocationId;

  for (const line of validLines) {
    if (!originLocationId || !targetLocationId) {
      // Validato a monte: qui non deve mai arrivare una riga valida senza
      // entrambe le location.
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
        originLocationId,
        -line.quantity,
      );
      await applyInventoryDelta(
        tx,
        params.tenantId,
        line.variantId,
        targetLocationId,
        line.quantity,
      );
      await tx.stockMovement.create({
        data: {
          tenantId: params.tenantId,
          type: StockMovementType.transfer,
          origin: MovementOrigin.manual,
          variantId: line.variantId,
          sku,
          locationId: originLocationId,
          targetLocationId,
          quantity: line.quantity,
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
      deltas.push({ sku, delta: line.quantity });
      syncTargets.push({ variantId: line.variantId, locationId: originLocationId });
      syncTargets.push({ variantId: line.variantId, locationId: targetLocationId });
      createdLineIds.push(line.id);
      continue;
    }

    byLineId.delete(line.id);

    // Origine, destinazione o variante diverse = l'effetto va spostato per
    // intero sulla nuova terna, non solo aggiornato il movimento.
    const shapeChanged =
      movement.locationId !== originLocationId ||
      movement.targetLocationId !== targetLocationId ||
      movement.variantId !== line.variantId;
    const quantityDelta = line.quantity - movement.quantity;

    if (shapeChanged) {
      // Storno completo della vecchia terna, applicazione piena della nuova.
      await applyInventoryDelta(
        tx,
        params.tenantId,
        movement.variantId,
        movement.locationId,
        movement.quantity,
      );
      if (movement.targetLocationId) {
        await applyInventoryDelta(
          tx,
          params.tenantId,
          movement.variantId,
          movement.targetLocationId,
          -movement.quantity,
        );
      }
      await applyInventoryDelta(
        tx,
        params.tenantId,
        line.variantId,
        originLocationId,
        -line.quantity,
      );
      await applyInventoryDelta(
        tx,
        params.tenantId,
        line.variantId,
        targetLocationId,
        line.quantity,
      );
      syncTargets.push({ variantId: movement.variantId, locationId: movement.locationId });
      if (movement.targetLocationId) {
        syncTargets.push({ variantId: movement.variantId, locationId: movement.targetLocationId });
      }
      syncTargets.push({ variantId: line.variantId, locationId: originLocationId });
      syncTargets.push({ variantId: line.variantId, locationId: targetLocationId });
      deltas.push({ sku, delta: line.quantity - movement.quantity });
    } else if (quantityDelta !== 0) {
      // La giacenza si muove solo della differenza effettiva, su entrambe le
      // location (origine perde, destinazione guadagna il delta).
      await applyInventoryDelta(
        tx,
        params.tenantId,
        line.variantId,
        originLocationId,
        -quantityDelta,
      );
      await applyInventoryDelta(
        tx,
        params.tenantId,
        line.variantId,
        targetLocationId,
        quantityDelta,
      );
      syncTargets.push({ variantId: line.variantId, locationId: originLocationId });
      syncTargets.push({ variantId: line.variantId, locationId: targetLocationId });
      deltas.push({ sku, delta: quantityDelta });
    }

    const movementDateChanged =
      params.movementDate != null && movement.createdAt.getTime() !== params.movementDate.getTime();

    const needsUpdate =
      shapeChanged ||
      quantityDelta !== 0 ||
      movement.sku !== sku ||
      movement.reason !== params.reason ||
      movementDateChanged;

    if (needsUpdate) {
      await tx.stockMovement.update({
        where: { id: movement.id },
        data: {
          variantId: line.variantId,
          sku,
          locationId: originLocationId,
          targetLocationId,
          quantity: line.quantity,
          reason: params.reason,
          ...(params.movementDate ? { createdAt: params.movementDate } : {}),
        },
      });
    }
  }

  // Movimenti orfani (riga eliminata o non più valida) → rimozione del
  // movimento e ripristino della giacenza precedentemente trasferita.
  for (const movement of byLineId.values()) {
    await applyInventoryDelta(
      tx,
      params.tenantId,
      movement.variantId,
      movement.locationId,
      movement.quantity,
    );
    if (movement.targetLocationId) {
      await applyInventoryDelta(
        tx,
        params.tenantId,
        movement.variantId,
        movement.targetLocationId,
        -movement.quantity,
      );
    }
    await tx.stockMovement.delete({ where: { id: movement.id } });
    deltas.push({ sku: movement.sku, delta: -movement.quantity });
    syncTargets.push({ variantId: movement.variantId, locationId: movement.locationId });
    if (movement.targetLocationId) {
      syncTargets.push({ variantId: movement.variantId, locationId: movement.targetLocationId });
    }
  }

  return { deltas, syncTargets, createdLineIds };
}

/** Causale movimento: "Trasferimento TR-2026-0002" (mirror del formato storico). */
export function buildTransferMovementReason(params: {
  readonly reference: string | null;
  readonly reasonSuffix?: string | null;
}): string {
  const base = params.reference ? `Trasferimento ${params.reference}` : 'Trasferimento interno';
  return params.reasonSuffix ? `${base}${params.reasonSuffix}` : base;
}
