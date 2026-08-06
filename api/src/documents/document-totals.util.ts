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

/**
 * Riferimento leggibile: `PREFISSO[-SERIE]-NUMERO`. La serie compare solo se
 * presente (senza serie → `PREFISSO-NUMERO`). L'anno NON fa parte del
 * riferimento né della numerazione: il reset annuale si ottiene creando una
 * serie con il nome dell'anno (es. "2026").
 */
export function formatDocumentReference(
  prefix: string,
  series: string | null,
  number: number,
): string {
  const paddedNumber = String(number).padStart(4, '0');
  const trimmedSeries = (series ?? '').trim();
  return trimmedSeries
    ? `${prefix}-${trimmedSeries}-${paddedNumber}`
    : `${prefix}-${paddedNumber}`;
}
