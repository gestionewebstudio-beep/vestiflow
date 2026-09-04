import {
  MovementOrigin,
  Prisma,
  StockMovementType,
  type DocumentLine,
  type DocumentType,
  type StockMovement,
} from '@prisma/client';

import { applyInventoryDelta } from '../inventory/inventory-level-delta.util';
import { frozenTotalCostMinor } from '../inventory/movement-cost.util';
import type { StockMovementActor } from '../inventory/inventory-movement.util';

/**
 * Sync movimenti magazzino ↔ righe di uno scarico di vendita, per-riga (terzo
 * specchio di `document-goods-receipt-sync.util.ts` e
 * `document-stock-adjustment-sync.util.ts`).
 *
 * Copre **DDT vendita e Fattura accompagnatoria**: i due documenti che fanno
 * uscire la merce dal percorso generico. Ogni riga con `loadsStock`, variante
 * valida e quantità > 0 ha ESATTAMENTE un movimento `sale` collegato via
 * `sourceLineId` (UNIQUE su source_document_type + source_line_id).
 *
 * - Riga nuova valida         → crea movimento, giacenza −qty.
 * - Riga modificata           → aggiorna LO STESSO movimento, giacenza ±delta.
 * - Location o variante nuova → storno pieno sulla vecchia coppia, scarico
 *                               pieno sulla nuova.
 * - Riga eliminata/invalida   → elimina il movimento, giacenza ripristinata.
 * - Documento annullato       → sync con righe vuote rimuove tutto.
 * - Due righe stesso articolo → due movimenti distinti.
 *
 * **Nessuna rettifica visibile per una modifica ordinaria.** Prima di questo
 * file lo scarico aggregava per variante e accodava movimenti «rettifica
 * scarico +1»: la giacenza tornava, ma il registro raccontava un'uscita e un
 * rientro che non erano mai avvenuti. Vedi `docs/09-specifica-movimenti-per-riga.md`.
 */

export interface UnloadSyncResult {
  readonly deltas: readonly { readonly sku: string; readonly delta: number }[];
  readonly syncTargets: readonly { readonly variantId: string; readonly locationId: string }[];
  readonly createdLineIds: readonly string[];
}

interface SyncParams {
  readonly tenantId: string;
  readonly documentId: string;
  readonly documentType: DocumentType;
  /** Location da cui la merce esce; null solo se non ci sono righe valide. */
  readonly locationId: string | null;
  /** Causale movimento, es. «DDT vendita DDT-0005». */
  readonly reason: string;
  /**
   * Data da dare ai movimenti creati. Assente = adesso (comportamento storico
   * dello scarico). Nella conversione di un documento legacy subentra la data
   * del movimento più vecchio che si sta convertendo: rifarli con la data di
   * oggi li sposterebbe in cima al registro, e quell'uscita è di allora.
   */
  readonly movementDate?: Date | null;
  /**
   * Origine dei movimenti CREATI. Assente = `manual`, che e' il comportamento
   * storico dello scarico documentale. La Vendita al banco passa
   * `vestiflow_pos`: l'origine e' un fatto della transazione, e i report la
   * usano per la ripartizione per canale.
   */
  readonly origin?: MovementOrigin;
  /**
   * Costo unitario da congelare su un movimento NUOVO. Assente = costo ZERO:
   * un costo canonico non e' mai NULL, e zero e' un costo (`regole-gestionale`).
   *
   * ⚠️ Vale SOLO per le righe nuove. Una riga gia' presente **mantiene il costo
   * gia' congelato sul proprio movimento** (`11` A2): rivalutarlo al costo di
   * oggi cambierebbe il margine di una vendita vecchia senza che nessuno abbia
   * venduto niente di diverso. Il TOTALE si ricalcola, perche' la quantita' e'
   * cambiata.
   */
  readonly unitCostForNewLine?: (line: DocumentLine & { variantId: string }) => number;
  /** Righe documento SALVATE (id definitivi). Vuoto = rimuovi tutti i movimenti. */
  readonly lines: readonly DocumentLine[];
  readonly actor: StockMovementActor;
}

function isStockLine(line: DocumentLine): line is DocumentLine & { variantId: string } {
  return line.loadsStock && line.quantity > 0 && line.variantId != null;
}

/** Tipi che un vecchio scarico poteva lasciare dietro di sé, con `externalRef`. */
const LEGACY_UNLOAD_TYPES = [
  // lo scarico originale, e le «rettifiche scarico +n» in aumento
  StockMovementType.sale,
  // le «rettifiche scarico -n» in diminuzione e gli storni da annullamento
  StockMovementType.load,
  StockMovementType.unload,
] as const;

/**
 * Converte i movimenti «legacy» (aggregati per variante, senza `sourceLineId`)
 * nel modello per riga: ne annulla l'effetto netto sulla giacenza e li elimina;
 * il sync per riga che segue ricostruisce lo stato corretto dalle righe.
 *
 * **Non si tenta alcuna attribuzione riga↔movimento**, e non serve: l'effetto
 * si somma per coppia (variante, location) e si riscrive dalle righe correnti.
 * È l'unica strada che regge anche i due casi che l'attribuzione non saprebbe
 * risolvere — due righe dello stesso articolo, e il movimento orfano di una
 * riga che nel documento non c'è più.
 *
 * Ritorna la data del movimento legacy più vecchio, che diventa la data dei
 * movimenti ricostruiti.
 */
async function convertLegacyUnloadMovements(
  tx: Prisma.TransactionClient,
  tenantId: string,
  documentId: string,
): Promise<Date | null> {
  const legacy = await tx.stockMovement.findMany({
    where: {
      tenantId,
      externalRef: documentId,
      sourceLineId: null,
      type: { in: [...LEGACY_UNLOAD_TYPES] },
    },
  });
  if (legacy.length === 0) {
    return null;
  }

  const net = new Map<string, { variantId: string; locationId: string; qty: number }>();
  let earliest: Date | null = null;
  for (const movement of legacy) {
    const key = `${movement.variantId}::${movement.locationId}`;
    // `sale` e `unload` hanno tolto giacenza, `load` l'ha rimessa.
    const sign = movement.type === StockMovementType.load ? 1 : -1;
    const entry = net.get(key) ?? {
      variantId: movement.variantId,
      locationId: movement.locationId,
      qty: 0,
    };
    entry.qty += sign * movement.quantity;
    net.set(key, entry);
    if (earliest == null || movement.createdAt < earliest) {
      earliest = movement.createdAt;
    }
  }

  for (const entry of net.values()) {
    await applyInventoryDelta(tx, tenantId, entry.variantId, entry.locationId, -entry.qty);
  }
  await tx.stockMovement.deleteMany({
    where: { id: { in: legacy.map((movement) => movement.id) } },
  });

  return earliest;
}

/**
 * Sincronizza i movimenti di scarico collegati alle righe del documento.
 * Idempotente: salvare più volte lo stesso documento non produce doppi
 * scarichi, e non produce rettifiche.
 */
export async function syncUnloadLineMovements(
  tx: Prisma.TransactionClient,
  params: SyncParams,
): Promise<UnloadSyncResult> {
  const deltas: Array<{ sku: string; delta: number }> = [];
  const syncTargets: Array<{ variantId: string; locationId: string }> = [];
  const createdLineIds: string[] = [];

  const legacyDate = await convertLegacyUnloadMovements(tx, params.tenantId, params.documentId);
  const createdAt = params.movementDate ?? legacyDate ?? null;

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

  for (const line of validLines) {
    if (!locationId) {
      // Validato a monte: una riga che scarica senza location non arriva qui.
      continue;
    }
    const sku = line.sku ?? '';
    const movement = byLineId.get(line.id);

    if (!movement) {
      // Riga nuova → un movimento nuovo collegato alla riga, col costo di ORA.
      // ⛔ Chi non sa dire il costo non dice «sconosciuto»: dice zero. Un costo
      // canonico non è mai NULL (`regole-gestionale`).
      const newLineUnitCost = params.unitCostForNewLine?.(line) ?? 0;
      await applyInventoryDelta(tx, params.tenantId, line.variantId, locationId, -line.quantity);
      await tx.stockMovement.create({
        data: {
          tenantId: params.tenantId,
          type: StockMovementType.sale,
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
          ...(createdAt ? { createdAt } : {}),
          unitCostMinor: newLineUnitCost,
          totalCostMinor: frozenTotalCostMinor(newLineUnitCost, line.quantity),
          createdById: params.actor.createdById ?? null,
          createdByName: params.actor.createdByName,
        },
      });
      deltas.push({ sku, delta: -line.quantity });
      syncTargets.push({ variantId: line.variantId, locationId });
      createdLineIds.push(line.id);
      continue;
    }

    byLineId.delete(line.id);

    // Variante o location diverse: l'uscita va rimessa sulla vecchia coppia e
    // applicata per intero sulla nuova, non solo aggiornata nel movimento.
    const targetChanged =
      movement.locationId !== locationId || movement.variantId !== line.variantId;
    const quantityDelta = line.quantity - movement.quantity;

    if (targetChanged) {
      await applyInventoryDelta(
        tx,
        params.tenantId,
        movement.variantId,
        movement.locationId,
        movement.quantity,
      );
      await applyInventoryDelta(tx, params.tenantId, line.variantId, locationId, -line.quantity);
      syncTargets.push({ variantId: movement.variantId, locationId: movement.locationId });
      syncTargets.push({ variantId: line.variantId, locationId });
      deltas.push({ sku, delta: movement.quantity - line.quantity });
    } else if (quantityDelta !== 0) {
      // La giacenza si muove SOLO della differenza: 3 → 2 restituisce un pezzo.
      await applyInventoryDelta(tx, params.tenantId, line.variantId, locationId, -quantityDelta);
      syncTargets.push({ variantId: line.variantId, locationId });
      deltas.push({ sku, delta: -quantityDelta });
    }

    // Il costo UNITARIO congelato resta quello di quando la merce e' uscita; si
    // rifa' solo il TOTALE sulla quantita' nuova, o una riga portata da 2 a 1
    // continuerebbe a pesare per due nel margine.
    const nextTotalCostMinor = frozenTotalCostMinor(movement.unitCostMinor, line.quantity);

    // ⛔ `createdAt` del movimento NON si tocca in aggiornamento, ed è una
    // decisione esplicita del proprietario (21/08/2026): è il **timestamp
    // tecnico** di quando il movimento è nato, non la data di competenza del
    // documento. Correggere la data di un documento non riscrive quando la
    // scrittura è avvenuta.
    //
    // ⚠️ Se un giorno servirà una data di **competenza** sul movimento, sarà un
    // campo suo e un contratto trasversale — non questo, riusato.
    const needsUpdate =
      targetChanged ||
      quantityDelta !== 0 ||
      movement.sku !== sku ||
      movement.reason !== params.reason ||
      movement.totalCostMinor !== nextTotalCostMinor;

    if (needsUpdate) {
      await tx.stockMovement.update({
        where: { id: movement.id },
        data: {
          variantId: line.variantId,
          sku,
          locationId,
          quantity: line.quantity,
          reason: params.reason,
          totalCostMinor: nextTotalCostMinor,
        },
      });
    }
  }

  // Movimenti orfani: riga eliminata, spunta magazzino tolta, quantità azzerata.
  // Sparisce il movimento e torna la giacenza — solo per quella riga.
  for (const movement of byLineId.values()) {
    await applyInventoryDelta(
      tx,
      params.tenantId,
      movement.variantId,
      movement.locationId,
      movement.quantity,
    );
    await tx.stockMovement.delete({ where: { id: movement.id } });
    deltas.push({ sku: movement.sku, delta: movement.quantity });
    syncTargets.push({ variantId: movement.variantId, locationId: movement.locationId });
  }

  return { deltas, syncTargets, createdLineIds };
}

/**
 * Causale movimento, invariata rispetto al percorso precedente: «DDT vendita
 * DDT-0005», «Fattura accompagnatoria FTA-0003». Il registro non cambia parole.
 */
export function buildUnloadMovementReason(params: {
  readonly documentType: DocumentType;
  readonly reference: string | null;
  readonly fallbackLabel: string;
}): string {
  const label =
    params.documentType === 'invoice_accompanying' ? 'Fattura accompagnatoria' : 'DDT vendita';
  return params.reference ? `${label} ${params.reference}` : `${label} ${params.fallbackLabel}`;
}
