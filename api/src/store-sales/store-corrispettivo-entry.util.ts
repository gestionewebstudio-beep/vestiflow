import {
  CorrispettivoStatus,
  DocumentType,
  Prisma,
  SalesOrderSource,
} from '@prisma/client';

/** Prefisso numerazione COR: stesso della via online (sequenza condivisa). */
const CORRISPETTIVO_PREFIX = 'COR';

/** Riga documento nella forma che serve alla voce corrispettivo. */
export interface StoreCorrispettivoLineInput {
  readonly lineNumber: number;
  readonly description: string;
  readonly quantity: number;
  readonly lineTotalMinor: number;
  readonly lineVatTotalMinor: number;
  readonly lineGrossTotalMinor: number;
  readonly vatCodeId: string | null;
  readonly vatSnapshot: Prisma.JsonValue | null;
}

export interface StoreCorrispettivoEntryParams {
  readonly tenantId: string;
  readonly documentId: string;
  /** Giorno del documento: propone la data fiscale (modificabile a registro). */
  readonly documentDate: Date;
  readonly operationalDate: Date;
  readonly subtotalMinor: number;
  readonly taxMinor: number;
  readonly totalMinor: number;
  /** Vendita = 1; reso = −1 (nel registro è uno storno, non un incasso). */
  readonly sign: 1 | -1;
  readonly adjustmentNote?: string | null;
  readonly lines: readonly StoreCorrispettivoLineInput[];
}

/**
 * Voce del registro Corrispettivi da vendita/reso di cassa (canale `store`),
 * nella STESSA transazione del documento: o entrambi o nessuno. Numerazione
 * condivisa con le voci online (document_sequences, tipo `corrispettivo`,
 * serie A): un solo registro, una sola sequenza.
 */
export async function createStoreCorrispettivoEntryTx(
  tx: Prisma.TransactionClient,
  params: StoreCorrispettivoEntryParams,
): Promise<void> {
  const year = params.operationalDate.getFullYear();
  const sequence = await tx.documentSequence.upsert({
    where: {
      tenantId_type_series_year: {
        tenantId: params.tenantId,
        type: DocumentType.corrispettivo,
        series: 'A',
        year,
      },
    },
    create: {
      tenantId: params.tenantId,
      type: DocumentType.corrispettivo,
      series: 'A',
      year,
      lastNumber: 1,
    },
    update: { lastNumber: { increment: 1 } },
  });
  const number = sequence.lastNumber;

  const entry = await tx.corrispettivoEntry.create({
    data: {
      tenantId: params.tenantId,
      series: 'A',
      number,
      year,
      reference: `${CORRISPETTIVO_PREFIX}-${year}-${String(number).padStart(4, '0')}`,
      documentId: params.documentId,
      channel: SalesOrderSource.store,
      operationalDate: params.operationalDate,
      // Come per l'online: la data fiscale è PROPOSTA, resta modificabile
      // dagli utenti autorizzati via registro.
      fiscalDate: dateOnly(params.documentDate),
      subtotalMinor: params.sign * params.subtotalMinor,
      taxMinor: params.sign * params.taxMinor,
      totalMinor: params.sign * params.totalMinor,
      discountMinor: 0,
      shippingMinor: 0,
      status: CorrispettivoStatus.to_verify,
      adjustmentNote: params.adjustmentNote?.trim() || null,
    },
    select: { id: true },
  });

  if (params.lines.length > 0) {
    await tx.corrispettivoEntryLine.createMany({
      data: params.lines.map(
        (line): Prisma.CorrispettivoEntryLineCreateManyInput => ({
          tenantId: params.tenantId,
          entryId: entry.id,
          lineNumber: line.lineNumber,
          isShipping: false,
          description: line.description,
          quantity: line.quantity,
          subtotalMinor: params.sign * line.lineTotalMinor,
          taxMinor: params.sign * line.lineVatTotalMinor,
          totalMinor: params.sign * line.lineGrossTotalMinor,
          vatCodeId: line.vatCodeId,
          vatSnapshot: line.vatSnapshot ?? Prisma.DbNull,
        }),
      ),
    });
  }
}

function dateOnly(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}
