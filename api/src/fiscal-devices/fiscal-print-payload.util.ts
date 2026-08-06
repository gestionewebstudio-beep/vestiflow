import type { FiscalDeviceBrand, Prisma } from '@prisma/client';

import { vatSnapshotRatePercent } from '../vat/vat-snapshot.util';

/**
 * Payload di stampa del documento commerciale, composto dal SERVER: il driver
 * in negozio (browser → stampante in LAN) si limita a renderizzarlo nel
 * protocollo della marca. Tutto ciò che serve alla stampa sta qui — il driver
 * non deve conoscere il dominio.
 */
export interface FiscalPrintPayload {
  readonly documentId: string;
  readonly documentType: 'sale' | 'return';
  readonly reference: string;
  readonly endpoint: string;
  readonly brand: FiscalDeviceBrand;
  readonly deviceSerialNumber: string | null;
  readonly lines: readonly FiscalPrintLine[];
  readonly payments: readonly FiscalPrintPayment[];
  /** Reso: estremi della ricevuta originale (li richiede il documento di reso). */
  readonly original: {
    readonly fiscalNumber: string | null;
    readonly issuedAt: string | null;
    readonly serialNumber: string | null;
  } | null;
}

export interface FiscalPrintLine {
  readonly description: string;
  readonly quantity: number;
  /** Prezzo unitario LORDO in unità minori: la RT ragiona su ciò che il cliente paga. */
  readonly unitPriceGrossMinor: number;
  /** Reparto della stampante che porta l'aliquota della riga. */
  readonly department: number;
}

export interface FiscalPrintPayment {
  readonly description: string;
  readonly amountMinor: number;
  /** Tipo pagamento Epson: 0 contanti, 2 carta, 3 ticket/altro. */
  readonly epsonPaymentType: number;
}

interface PayloadDevice {
  readonly endpoint: string;
  readonly brand: FiscalDeviceBrand;
  readonly serialNumber: string | null;
  readonly vatDepartments: Prisma.JsonValue | null;
}

interface PayloadDocumentLine {
  readonly description: string;
  readonly quantity: number;
  readonly lineGrossTotalMinor: number;
  readonly vatSnapshot: Prisma.JsonValue | null;
}

interface PayloadPaymentRow {
  readonly method: string;
  readonly methodNote: string | null;
  readonly amountMinor: number;
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'CONTANTI',
  card: 'CARTA',
  other: 'ALTRO',
};

const EPSON_PAYMENT_TYPES: Record<string, number> = {
  cash: 0,
  card: 2,
  other: 3,
};

/** Reparto di ripiego quando la mappa non copre l'aliquota della riga. */
const DEFAULT_DEPARTMENT = 1;

/** Mappa aliquota → reparto dalla configurazione del dispositivo. */
export function resolveDepartment(
  vatDepartments: Prisma.JsonValue | null,
  ratePercent: number | null,
): number {
  if (!Array.isArray(vatDepartments) || ratePercent == null) {
    return DEFAULT_DEPARTMENT;
  }
  for (const entry of vatDepartments) {
    if (
      entry &&
      typeof entry === 'object' &&
      'ratePercent' in entry &&
      'department' in entry &&
      Number((entry as { ratePercent: unknown }).ratePercent) === ratePercent
    ) {
      const department = Number((entry as { department: unknown }).department);
      if (Number.isInteger(department) && department >= 1) {
        return department;
      }
    }
  }
  return DEFAULT_DEPARTMENT;
}

/**
 * Righe di stampa dal documento. La RT calcola `unitPrice × qty`: quando il
 * lordo di riga non è divisibile per la quantità (sconti riga), si stampa
 * UNA riga a quantità 1 con il totale esatto e la quantità nel testo — il
 * totale del documento commerciale deve tornare al centesimo, sempre.
 */
export function buildFiscalPrintLines(
  docLines: readonly PayloadDocumentLine[],
  vatDepartments: Prisma.JsonValue | null,
): FiscalPrintLine[] {
  return docLines.map((line) => {
    const department = resolveDepartment(
      vatDepartments,
      vatSnapshotRatePercent(line.vatSnapshot),
    );
    if (line.quantity >= 1 && line.lineGrossTotalMinor % line.quantity === 0) {
      return {
        description: line.description,
        quantity: line.quantity,
        unitPriceGrossMinor: line.lineGrossTotalMinor / line.quantity,
        department,
      };
    }
    return {
      description:
        line.quantity > 1 ? `${line.description} x${line.quantity}` : line.description,
      quantity: 1,
      unitPriceGrossMinor: line.lineGrossTotalMinor,
      department,
    };
  });
}

export function buildFiscalPrintPayments(
  rows: readonly PayloadPaymentRow[],
): FiscalPrintPayment[] {
  return rows.map((row) => ({
    description:
      row.method === 'other' && row.methodNote
        ? row.methodNote.toUpperCase()
        : (PAYMENT_LABELS[row.method] ?? row.method.toUpperCase()),
    amountMinor: row.amountMinor,
    epsonPaymentType: EPSON_PAYMENT_TYPES[row.method] ?? 3,
  }));
}

export function buildFiscalPrintPayload(params: {
  readonly documentId: string;
  readonly documentType: 'sale' | 'return';
  readonly reference: string;
  readonly device: PayloadDevice;
  readonly docLines: readonly PayloadDocumentLine[];
  readonly paymentRows: readonly PayloadPaymentRow[];
  readonly original: {
    readonly fiscalNumber: string | null;
    readonly issuedAt: Date | null;
    readonly serialNumber: string | null;
  } | null;
}): FiscalPrintPayload {
  return {
    documentId: params.documentId,
    documentType: params.documentType,
    reference: params.reference,
    endpoint: params.device.endpoint,
    brand: params.device.brand,
    deviceSerialNumber: params.device.serialNumber,
    lines: buildFiscalPrintLines(params.docLines, params.device.vatDepartments),
    payments: buildFiscalPrintPayments(params.paymentRows),
    original: params.original
      ? {
          fiscalNumber: params.original.fiscalNumber,
          issuedAt: params.original.issuedAt?.toISOString() ?? null,
          serialNumber: params.original.serialNumber,
        }
      : null,
  };
}
