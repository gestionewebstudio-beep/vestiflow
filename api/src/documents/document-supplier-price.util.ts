import type { DocumentLine, Prisma } from '@prisma/client';

type ReceiptLine = Pick<DocumentLine, 'variantId' | 'unitPriceMinor' | 'loadsStock' | 'quantity'>;

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
  const diffs: SupplierPriceDiff[] = [];
  for (const line of lines) {
    if (!line.loadsStock || line.quantity <= 0 || !line.variantId || line.unitPriceMinor == null) {
      continue;
    }
    const link = await tx.supplierVariantLink.findUnique({
      where: {
        tenantId_supplierId_variantId: {
          tenantId,
          supplierId,
          variantId: line.variantId,
        },
      },
      select: { lastPurchasePriceMinor: true },
    });
    const previous = link?.lastPurchasePriceMinor ?? null;
    if (previous === line.unitPriceMinor) {
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
  for (const line of lines) {
    if (!line.loadsStock || line.quantity <= 0 || !line.variantId || line.unitPriceMinor == null) {
      continue;
    }

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
    if (updateArticleReferenceCost) {
      const variant = await tx.productVariant.findFirst({
        where: { id: line.variantId, tenantId },
        select: { productId: true },
      });
      if (variant) {
        await tx.product.updateMany({
          where: { id: variant.productId, tenantId },
          data: { purchasePriceMinor: line.unitPriceMinor },
        });
      }
    }
  }
}
