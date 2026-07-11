import type { DocumentType, Prisma } from '@prisma/client';

import { documentTypeDefaultLoadsStock } from './document-type.util';

export interface ComputedDocumentLine {
  lineNumber: number;
  variantId: string | null;
  sku: string | null;
  description: string;
  quantity: number;
  unitPriceMinor: number;
  discountPercent: number;
  vatRatePercent: number | null;
  lineTotalMinor: number;
  loadsStock: boolean;
  supplierOrderLineId: string | null;
  lotCode: string | null;
  lotExpiryDate: Date | null;
  serialNumbers: string[];
}

export interface DocumentTotals {
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
}

export interface DocumentLineInput {
  readonly variantId?: string;
  readonly sku?: string;
  readonly description: string;
  readonly quantity: number;
  readonly unitPriceMinor?: number;
  readonly discountPercent?: number;
  readonly vatRatePercent?: number;
  readonly loadsStock?: boolean;
  readonly supplierOrderLineId?: string;
  readonly lotCode?: string;
  readonly lotExpiryDate?: string;
  readonly serialNumbers?: readonly string[];
}

export function normalizeSerialNumbers(input?: readonly string[]): string[] {
  if (!input?.length) {
    return [];
  }
  return input.map((entry) => entry.trim()).filter((entry) => entry.length > 0);
}

/** Calcola le righe documento (line number, totali riga, default loadsStock). */
export function computeDocumentLines(
  input: readonly DocumentLineInput[],
  documentType: DocumentType,
): ComputedDocumentLine[] {
  const defaultLoadsStock = documentTypeDefaultLoadsStock(documentType);
  return input.map((line, index) => {
    const quantity = line.quantity;
    const unitPriceMinor = line.unitPriceMinor ?? 0;
    const discountPercent = line.discountPercent ?? 0;
    const lineTotalMinor = Math.round(
      (quantity * unitPriceMinor * (100 - discountPercent)) / 100,
    );
    return {
      lineNumber: index + 1,
      variantId: line.variantId ?? null,
      sku: line.sku ?? null,
      description: line.description.trim(),
      quantity,
      unitPriceMinor,
      discountPercent,
      vatRatePercent: line.vatRatePercent ?? null,
      lineTotalMinor,
      loadsStock: line.loadsStock ?? defaultLoadsStock,
      supplierOrderLineId: line.supplierOrderLineId ?? null,
      lotCode: line.lotCode?.trim() || null,
      lotExpiryDate: line.lotExpiryDate ? new Date(line.lotExpiryDate) : null,
      serialNumbers: normalizeSerialNumbers(line.serialNumbers),
    };
  });
}

/** Imponibile, IVA e totale documento da righe calcolate (unità minori). */
export function computeDocumentTotals(
  lines: readonly Pick<ComputedDocumentLine, 'lineTotalMinor' | 'vatRatePercent'>[],
  pricesIncludeVat: boolean,
  documentDiscountPercent = 0,
): DocumentTotals {
  const lineSum = lines.reduce((sum, line) => sum + line.lineTotalMinor, 0);
  const docDiscount = Math.min(100, Math.max(0, documentDiscountPercent));
  const docDiscountAmount = Math.round((lineSum * docDiscount) / 100);
  const discountedLineSum = lineSum - docDiscountAmount;

  const taxMinor = lines.reduce((sum, line) => {
    if (line.vatRatePercent == null || line.vatRatePercent === 0 || lineSum === 0) {
      return sum;
    }
    const lineShare = line.lineTotalMinor / lineSum;
    const discountedLineTotal = Math.round(discountedLineSum * lineShare);
    const rate = line.vatRatePercent;
    const tax = pricesIncludeVat
      ? discountedLineTotal - Math.round((discountedLineTotal * 100) / (100 + rate))
      : Math.round((discountedLineTotal * rate) / 100);
    return sum + tax;
  }, 0);

  if (pricesIncludeVat) {
    return {
      subtotalMinor: discountedLineSum - taxMinor,
      taxMinor,
      totalMinor: discountedLineSum,
    };
  }
  return {
    subtotalMinor: discountedLineSum,
    taxMinor,
    totalMinor: discountedLineSum + taxMinor,
  };
}

/** Prossimo numero progressivo (atomico via upsert) per serie/anno/tipo. */
export async function nextDocumentNumber(
  tx: Prisma.TransactionClient,
  tenantId: string,
  type: DocumentType,
  series: string,
  year: number,
): Promise<number> {
  const sequence = await tx.documentSequence.upsert({
    where: { tenantId_type_series_year: { tenantId, type, series, year } },
    create: { tenantId, type, series, year, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
  });
  return sequence.lastNumber;
}

export function formatDocumentReference(prefix: string, year: number, number: number): string {
  return `${prefix}-${year}-${String(number).padStart(4, '0')}`;
}
