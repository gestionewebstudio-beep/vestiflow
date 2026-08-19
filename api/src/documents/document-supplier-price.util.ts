import type { DocumentLine, Prisma } from '@prisma/client';

import { sameAmountAtCent } from '../common/money.util';

type ReceiptLine = Pick<DocumentLine, 'variantId' | 'unitPriceMinor' | 'loadsStock' | 'quantity'>;

/** Riga che incide sui costi: carica stock, ha quantità, variante e prezzo. */
type CostBearingLine = ReceiptLine & { variantId: string; unitPriceMinor: number };

function isCostBearing(line: ReceiptLine): line is CostBearingLine {
  return (
    line.loadsStock && line.quantity > 0 && line.variantId != null && line.unitPriceMinor != null
  );
}

const uniqueVariantIds = (lines: readonly CostBearingLine[]): string[] => [
  ...new Set(lines.map((line) => line.variantId)),
];

export interface SupplierPriceDiff {
  readonly variantId: string;
  readonly previousMinor: number | null;
  readonly nextMinor: number;
}

/** Righe con costo diverso dall'ultimo prezzo fornitore collegato. */
export async function findSupplierPriceDiffs(
  tx: Prisma.TransactionClient,
  tenantId: string,
  supplierId: string | null,
  lines: readonly ReceiptLine[],
): Promise<readonly SupplierPriceDiff[]> {
  if (!supplierId) {
    return [];
  }
  const eligible = lines.filter(isCostBearing);
  if (eligible.length === 0) {
    return [];
  }

  // Un'unica lettura per tutte le righe: in ciclo era un round-trip per riga.
  const links = await tx.supplierVariantLink.findMany({
    where: {
      tenantId,
      supplierId,
      variantId: { in: uniqueVariantIds(eligible) },
    },
    select: { variantId: true, lastPurchasePriceMinor: true },
  });
  const lastPriceByVariant = new Map(
    links.map((link) => [link.variantId, link.lastPurchasePriceMinor]),
  );

  const diffs: SupplierPriceDiff[] = [];
  for (const line of eligible) {
    const previous = lastPriceByVariant.get(line.variantId) ?? null;
    // «Il costo è cambiato?» si chiede al centesimo: una coda decimale diversa
    // (§sei decimali) non è un prezzo nuovo e non deve entrare nello storico.
    if (previous !== null && sameAmountAtCent(previous, line.unitPriceMinor)) {
      continue;
    }
    diffs.push({
      variantId: line.variantId,
      previousMinor: previous,
      nextMinor: Number(line.unitPriceMinor),
    });
  }
  return diffs;
}

/**
 * Aggiornamento costi dal carico — **riscritto il 19/08/2026** (`03b`).
 *
 * ```text
 * ProductVariant.purchasePriceMinor   solo con la spunta, riga per riga
 * SupplierVariantLink                 sempre, se c'è un fornitore collegato
 * Product.purchasePriceMinor          ⛔ MAI
 * ```
 *
 * ⛔ **La spunta comandava la cosa sbagliata.** Prima il costo della variante si
 * scriveva **sempre** e la spunta governava il costo dell'articolo. L'etichetta
 * dice «Aggiorna **anche** il costo di riferimento in anagrafica», e
 * quell'«anche» dichiarava che qualcos'altro in anagrafica ci andava comunque:
 * **chi la toglieva credeva di registrare un costo solo documentale, e stava
 * riscrivendo il costo effettivo di ogni variante caricata** — quello che
 * alimenta valorizzazione e margini.
 *
 * > **Spuntata**: il costo della riga diventa il costo di quella variante.
 * > **Non spuntata**: resta un costo del DOCUMENTO, per report e contabilità.
 *
 * ⛔ **Riga per riga, e singolarmente.** Richiamando un articolo con tre varianti
 * si richiamano TRE righe, e ognuna governa la propria variante: la spunta non è
 * una propagazione «all'articolo».
 *
 * ⛔ **`Product.purchasePriceMinor` non si scrive più.** È il seed di NASCITA di
 * una variante — lo dice lo schema — non un costo aggiornabile. Derivarlo
 * dall'ultima riga di un carico è arbitrario: con dodici taglie a 18,00 e una a
 * 22,00 la tredicesima nascerebbe a 22,00, e nessuno saprebbe perché. `02` §4.5
 * lo vietava già per la sincronizzazione, e l'ultima riga è più arbitraria di
 * una media.
 *
 * ⚠️ **L'articolo NUOVO è un'altra cosa**: nasce con i dati che si stanno
 * inserendo, spunta o no, perché alla nascita non c'è niente da sovrascrivere.
 * Quel percorso vive in `goods-receipt-workflow` ed è gated dal solo permesso di
 * vedere i costi.
 */
export async function applySupplierPriceUpdates(
  tx: Prisma.TransactionClient,
  tenantId: string,
  supplierId: string | null,
  lines: readonly ReceiptLine[],
  updateArticleCost: boolean,
): Promise<void> {
  const eligible = lines.filter(isCostBearing);
  if (eligible.length === 0) {
    return;
  }

  const costoDi = (line: ReceiptLine): number => Math.round(Number(line.unitPriceMinor));

  // ── Costo della variante: SOLO con la spunta ────────────────────────────
  //
  // ⛔ Prima si scriveva sempre, e la spunta governava il costo dell'articolo:
  // chi la toglieva credeva di registrare un costo solo documentale e stava
  // riscrivendo il costo effettivo di ogni variante caricata.
  //
  // Le righe si raggruppano per COSTO: ogni variante compare una volta sola,
  // quindi non esiste un «chi vince» — si accorpa solo per emettere una
  // `updateMany` per valore invece di una per riga.
  if (updateArticleCost) {
    const perCosto = new Map<number, string[]>();
    for (const line of eligible) {
      const costo = costoDi(line);
      const gruppo = perCosto.get(costo);
      if (gruppo) {
        gruppo.push(line.variantId);
      } else {
        perCosto.set(costo, [line.variantId]);
      }
    }
    for (const [costo, variantIds] of perCosto) {
      await tx.productVariant.updateMany({
        where: { id: { in: variantIds }, tenantId },
        data: { purchasePriceMinor: costo },
      });
    }
  }

  // ── Ultimo prezzo pagato a quel fornitore: sempre, se c'è ───────────────
  //
  // ⚠️ NON governato dalla spunta: è un fatto del rapporto col fornitore, non
  // un costo dell'anagrafica. «Quanto l'ho pagato l'ultima volta» resta vero
  // anche scegliendo di non aggiornare il costo dell'articolo.
  if (supplierId) {
    for (const line of eligible) {
      await tx.supplierVariantLink.upsert({
        where: {
          tenantId_supplierId_variantId: { tenantId, supplierId, variantId: line.variantId },
        },
        create: {
          tenantId,
          supplierId,
          variantId: line.variantId,
          lastPurchasePriceMinor: costoDi(line),
        },
        update: { lastPurchasePriceMinor: costoDi(line) },
      });
    }
  }

  // ⛔ Nessuna scrittura su `Product.purchasePriceMinor`: è il seed di NASCITA
  // di una variante, non un costo aggiornabile dai carichi. Vedi il docblock.
}
