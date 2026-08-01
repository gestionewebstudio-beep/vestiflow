import { UnprocessableEntityException } from '@nestjs/common';
import type { DocumentLine, Prisma } from '@prisma/client';

type StockLine = Pick<DocumentLine, 'variantId' | 'quantity' | 'loadsStock' | 'lineNumber'>;

export interface DocumentLineVariant {
  readonly id: string;
  readonly sku: string | null;
}

/** Righe che movimentano stock: hanno carico, quantità e variante. */
function stockBearingLines<T extends StockLine>(lines: readonly T[]): T[] {
  return lines.filter((line) => line.loadsStock && line.quantity > 0 && Boolean(line.variantId));
}

/**
 * Carica in un'unica query le varianti di tutte le righe che movimentano stock
 * e verifica che esistano nel tenant. Interrogarle riga per riga costava un
 * round-trip per riga a ogni conferma di documento.
 *
 * L'errore cita la prima riga (in ordine di `lineNumber` di documento) la cui
 * variante non esiste, come faceva il controllo in ciclo.
 */
export async function loadStockLineVariantsOrThrow<T extends StockLine>(
  tx: Prisma.TransactionClient,
  tenantId: string,
  lines: readonly T[],
): Promise<Map<string, DocumentLineVariant>> {
  const stockLines = stockBearingLines(lines);
  if (stockLines.length === 0) {
    return new Map();
  }

  const variantIds = [...new Set(stockLines.map((line) => line.variantId as string))];
  const variants = await tx.productVariant.findMany({
    where: { id: { in: variantIds }, tenantId },
    select: { id: true, sku: true },
  });
  const byId = new Map<string, DocumentLineVariant>(
    variants.map((variant) => [variant.id, { id: variant.id, sku: variant.sku }]),
  );

  for (const line of stockLines) {
    if (!byId.has(line.variantId as string)) {
      throw new UnprocessableEntityException(
        `Variante non trovata per la riga ${line.lineNumber}.`,
      );
    }
  }

  return byId;
}
