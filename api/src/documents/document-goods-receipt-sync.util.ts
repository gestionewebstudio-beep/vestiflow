import {
  MovementOrigin,
  Prisma,
  StockMovementType,
  type DocumentLine,
  type DocumentType,
  type StockMovement,
} from '@prisma/client';

import { sameAmountAtCent, sameUnitAmountAtContract, toStorableMinor } from '../common/money.util';
import { applyInventoryDelta } from '../inventory/inventory-level-delta.util';
import { frozenTotalCostMinor } from '../inventory/movement-cost.util';
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
  /** Causale movimento, es. "Arrivo merce n. 3 del 30/05/2026 (DDT 145 del 08/05/2026)". */
  readonly reason: string;
  /**
   * Data registrazione del documento: i movimenti collegati la seguono
   * (cambiare la data aggiorna GLI STESSI movimenti, mai nuovi — §2).
   * Null = lascia la data movimento invariata.
   */
  readonly movementDate?: Date | null;
  /**
   * Tipo dei movimenti creati. Assente = `load`, il carico documentale. Il Reso
   * al banco passa `return`: la merce rientra, ma non e' un carico da fornitore
   * e i report distinguono le due cose.
   */
  readonly movementType?: StockMovementType;
  /**
   * Origine dei movimenti creati. Assente = `manual`, il comportamento storico
   * del carico documentale. La cassa passa `vestiflow_pos`.
   */
  readonly origin?: MovementOrigin;
  /**
   * Costo unitario da congelare su un movimento NUOVO.
   *
   * ⛔ Assente = il costo si DERIVA dalla riga, ed e' giusto per l'Arrivo merce:
   * li' il prezzo di riga E' il costo d'acquisto. ⚠️ Sul RESO non lo e' — il
   * prezzo di riga e' il prezzo di VENDITA, e derivarlo sovrascriverebbe il
   * costo d'acquisto col ricavo, che e' il numero da cui si calcola il margine.
   *
   * Quando c'e', vale la disciplina della fotografia (`regole-gestionale`): la
   * riga NUOVA congela il costo di adesso, la riga GIA' ESISTENTE mantiene il
   * proprio costo unitario e si rifa' solo il TOTALE sulla quantita' nuova.
   */
  readonly unitCostForNewLine?: (line: DocumentLine & { variantId: string }) => number;
  /** Righe documento SALVATE (id definitivi). Vuoto = rimuovi tutti i movimenti. */
  readonly lines: readonly DocumentLine[];
  readonly actor: StockMovementActor;
}

function isStockLine(line: DocumentLine): line is DocumentLine & { variantId: string } {
  return line.loadsStock && line.quantity > 0 && line.variantId != null;
}

/**
 * Costo unitario effettivo della riga (al netto dello sconto), in unità minori.
 *
 * ⛔ **Qui c'era `Math.round(...)`, e la coda del costo moriva esattamente in
 * questa riga.** Misurato su dati reali il 22/08/2026: la riga documento
 * portava 84,4262 e il movimento riceveva **84**.
 *
 * Quell'arrotondamento esisteva per una ragione sola —
 * `stock_movements.unit_cost_minor` era `Int` — e il compilatore non poteva
 * segnalarlo: arrotondare un `number` resta legale anche dopo la migration.
 * È la categoria di difetto che il dry-run dei tipi non vede.
 *
 * ⭐ **Il calcolo resta in `Decimal` fino alla fine.** Entrambi gli operandi lo
 * sono già — `unitPriceMinor` è `Decimal(16,6)`, `discountPercent` è
 * `Decimal(7,4)` — e passare per `Number()` prima di moltiplicare
 * sostituirebbe un arrotondamento prematuro con un calcolo economico in
 * virgola mobile: non un guadagno.
 *
 * `toStorableMinor` chiude riducendo alle 4 cifre di centesimo del contratto,
 * perché uno sconto percentuale può produrre code più lunghe di quelle che la
 * colonna memorizza:
 *
 *     84,4262 sconto 0%  →  84,4262
 *     84,4262 sconto 7%  →  78,5164
 */
function effectiveUnitCostMinor(line: DocumentLine): number {
  const scontato = new Prisma.Decimal(line.unitPriceMinor)
    .times(new Prisma.Decimal(100).minus(line.discountPercent))
    .dividedBy(100);
  return toStorableMinor(scontato.toNumber());
}

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
    await applyInventoryDelta(tx, tenantId, entry.variantId, entry.locationId, -entry.qty);
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
    // Il costo arriva dal chiamante quando il prezzo di riga NON e' un costo
    // (Reso al banco); altrimenti si deriva dalla riga, come per il carico.
    const costoEsterno = params.unitCostForNewLine != null;
    const unitCostMinor = costoEsterno
      ? params.unitCostForNewLine!(line)
      : effectiveUnitCostMinor(line);
    const movement = byLineId.get(line.id);

    if (!movement) {
      // Caso A: riga nuova → un movimento nuovo collegato alla riga.
      await applyInventoryDelta(tx, params.tenantId, line.variantId, locationId, line.quantity);
      await tx.stockMovement.create({
        data: {
          tenantId: params.tenantId,
          type: params.movementType ?? StockMovementType.load,
          origin: params.origin ?? MovementOrigin.manual,
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
          totalCostMinor: costoEsterno
            ? frozenTotalCostMinor(unitCostMinor, line.quantity)
            : line.lineTotalMinor,
          ...(params.movementDate ? { createdAt: params.movementDate } : {}),
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

    // Variante o location diverse = la giacenza va spostata sulla nuova
    // coppia variante × location, non solo aggiornato il movimento.
    const targetChanged =
      movement.locationId !== locationId || movement.variantId !== line.variantId;
    const quantityDelta = line.quantity - movement.quantity;

    if (targetChanged) {
      // Storno completo sulla vecchia coppia, carico pieno sulla nuova.
      await applyInventoryDelta(
        tx,
        params.tenantId,
        movement.variantId,
        movement.locationId,
        -movement.quantity,
      );
      await applyInventoryDelta(tx, params.tenantId, line.variantId, locationId, line.quantity);
      syncTargets.push({ variantId: movement.variantId, locationId: movement.locationId });
      syncTargets.push({ variantId: line.variantId, locationId });
      deltas.push({ sku, delta: line.quantity - movement.quantity });
    } else if (quantityDelta !== 0) {
      // Casi B/C: la giacenza si muove solo della differenza effettiva.
      await applyInventoryDelta(tx, params.tenantId, line.variantId, locationId, quantityDelta);
      syncTargets.push({ variantId: line.variantId, locationId });
      deltas.push({ sku, delta: quantityDelta });
    }

    // Col costo esterno il costo UNITARIO congelato non si tocca: e' quello di
    // quando la merce si e' mossa. Si rifa' solo il totale, o una riga portata
    // da 2 a 1 continuerebbe a pesare per due nel margine.
    const totaleCostoAggiornato = frozenTotalCostMinor(movement.unitCostMinor, line.quantity);

    const movementDateChanged =
      params.movementDate != null && movement.createdAt.getTime() !== params.movementDate.getTime();

    const needsUpdate =
      targetChanged ||
      quantityDelta !== 0 ||
      movement.sku !== sku ||
      movement.reason !== params.reason ||
      // ⭐ **Due metri diversi, e la differenza è voluta**: il costo UNITARIO si
      // confronta alla precisione del contratto (la coda ne fa parte), il
      // TOTALE al centesimo (è un importo monetario finale).
      (costoEsterno
        ? !sameAmountAtCent(movement.totalCostMinor, totaleCostoAggiornato)
        : !sameUnitAmountAtContract(Number(movement.unitCostMinor), unitCostMinor) ||
          !sameAmountAtCent(movement.totalCostMinor, line.lineTotalMinor)) ||
      movementDateChanged;

    if (needsUpdate) {
      await tx.stockMovement.update({
        where: { id: movement.id },
        data: {
          variantId: line.variantId,
          sku,
          locationId,
          quantity: line.quantity,
          reason: params.reason,
          ...(costoEsterno
            ? { totalCostMinor: totaleCostoAggiornato }
            : { unitCostMinor, totalCostMinor: line.lineTotalMinor }),
          // Stesso ID movimento: cambiare la data registrazione non crea
          // nuovi movimenti e non tocca quantità o giacenze (§2).
          ...(params.movementDate ? { createdAt: params.movementDate } : {}),
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
    );
    await tx.stockMovement.delete({ where: { id: movement.id } });
    deltas.push({ sku: movement.sku, delta: -movement.quantity });
    syncTargets.push({ variantId: movement.variantId, locationId: movement.locationId });
  }

  return { deltas, syncTargets, createdLineIds };
}

/**
 * Causale movimento (§12): "Arrivo merce n. 3 del 11/07/2026 (DDT 145 del 08/05/2026)".
 * Con causale vuota resta "Arrivo merce n. 3 del 11/07/2026".
 */
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
    timeZone: 'UTC',
  });
  const base =
    params.number != null
      ? `Arrivo merce n. ${params.number} del ${dateLabel}`
      : params.reference
        ? `Arrivo merce ${params.reference} del ${dateLabel}`
        : `Arrivo merce del ${dateLabel}`;
  const causal = params.causalText?.trim();
  return causal ? `${base} (${causal})` : base;
}
