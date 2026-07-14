import type { DocumentType, Prisma } from '@prisma/client';

export interface DocumentTotals {
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
}

export function normalizeSerialNumbers(input?: readonly string[]): string[] {
  if (!input?.length) {
    return [];
  }
  return input.map((entry) => entry.trim()).filter((entry) => entry.length > 0);
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
