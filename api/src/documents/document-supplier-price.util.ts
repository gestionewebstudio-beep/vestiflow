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
      nextMinor: line.unitPriceMinor,
    });
  }
  return diffs;
}

/**
 * Aggiornamento costi dal carico:
 * - il costo EFFETTIVO della variante (`purchasePriceMinor`) è **sempre**
 *   aggiornato al costo pagato: è un fatto della taglia, alimenta valorizzazione
 *   e margini;
 * - l'ultimo prezzo fornitore (`SupplierVariantLink`) è aggiornato quando c'è un
 *   fornitore collegato;
 * - il costo di RIFERIMENTO dell'articolo (`Product.purchasePriceMinor`) è
 *   aggiornato SOLO se l'operatore ha spuntato l'opzione sul documento
 *   (`updateArticleReferenceCost`). Con più varianti dello stesso articolo nello
 *   stesso carico vale l'ultima riga (è un riferimento, non alimenta i conti).
 */
export async function applySupplierPriceUpdates(
  tx: Prisma.TransactionClient,
  tenantId: string,
  supplierId: string | null,
  lines: readonly ReceiptLine[],
  updateArticleReferenceCost: boolean,
): Promise<void> {
  const eligible = lines.filter(isCostBearing);

  // Mappa variante → articolo letta in un colpo solo: serve solo con la spunta
  // di documento, e in ciclo era un round-trip per riga.
  const productIdByVariant = new Map<string, string>();
  if (updateArticleReferenceCost && eligible.length > 0) {
    const variants = await tx.productVariant.findMany({
      where: {
        tenantId,
        id: { in: uniqueVariantIds(eligible) },
      },
      select: { id: true, productId: true },
    });
    for (const variant of variants) {
      productIdByVariant.set(variant.id, variant.productId);
    }
  }

  for (const line of eligible) {
    // Costo effettivo della taglia: sempre.
    await tx.productVariant.updateMany({
      where: { id: line.variantId, tenantId },
      data: { purchasePriceMinor: line.unitPriceMinor },
    });

    // Ultimo prezzo per (fornitore, variante): solo con fornitore.
    if (supplierId) {
      await tx.supplierVariantLink.upsert({
        where: {
          tenantId_supplierId_variantId: { tenantId, supplierId, variantId: line.variantId },
        },
        create: {
          tenantId,
          supplierId,
          variantId: line.variantId,
          lastPurchasePriceMinor: line.unitPriceMinor,
        },
        update: { lastPurchasePriceMinor: line.unitPriceMinor },
      });
    }

    // Costo di riferimento dell'articolo: solo su spunta di documento.
    // Con più varianti dello stesso articolo vince l'ultima riga: l'update
    // resta per riga, è solo la lettura ad essere stata accorpata sopra.
    if (updateArticleReferenceCost) {
      const productId = productIdByVariant.get(line.variantId);
      if (productId) {
        await tx.product.updateMany({
          where: { id: productId, tenantId },
          data: { purchasePriceMinor: line.unitPriceMinor },
        });
      }
    }
  }
}
