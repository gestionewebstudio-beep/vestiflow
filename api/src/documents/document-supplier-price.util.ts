import type { DocumentLine, Prisma, SupplierPriceUpdatePolicy } from '@prisma/client';

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

/** Aggiorna ultimo prezzo fornitore e purchasePrice variante se policy lo consente. */
export async function applySupplierPriceUpdates(
  tx: Prisma.TransactionClient,
  tenantId: string,
  supplierId: string | null,
  lines: readonly ReceiptLine[],
  policy: SupplierPriceUpdatePolicy,
  applyUpdates: boolean,
): Promise<void> {
  if (!supplierId || !applyUpdates || policy === 'never') {
    return;
  }
  for (const line of lines) {
    if (!line.loadsStock || line.quantity <= 0 || !line.variantId || line.unitPriceMinor == null) {
      continue;
    }
    await tx.supplierVariantLink.upsert({
      where: {
        tenantId_supplierId_variantId: {
          tenantId,
          supplierId,
          variantId: line.variantId,
        },
      },
      create: {
        tenantId,
        supplierId,
        variantId: line.variantId,
        lastPurchasePriceMinor: line.unitPriceMinor,
      },
      update: {
        lastPurchasePriceMinor: line.unitPriceMinor,
      },
    });
    await tx.productVariant.updateMany({
      where: { id: line.variantId, tenantId },
      data: { purchasePriceMinor: line.unitPriceMinor },
    });
  }
}
