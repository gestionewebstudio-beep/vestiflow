// Payload di stampa del documento commerciale: composto dal SERVER, il driver
// in negozio lo renderizza nel protocollo della marca. Rispecchia i contratti
// API `store-sales` (result.fiscal) e `fiscal-receipts` (coda pending).

import type { EntityId, IsoDateString } from '@core/models/common.model';

import type { FiscalDeviceBrand } from './fiscal-device.model';

export interface FiscalPrintLine {
  readonly description: string;
  readonly quantity: number;
  /** Prezzo unitario LORDO in unità minori. */
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

export interface FiscalPrintPayload {
  readonly documentId: EntityId;
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
    readonly issuedAt: IsoDateString | null;
    readonly serialNumber: string | null;
  } | null;
}

/** Esito dell'emissione sulla stampante, riportato al server. */
export interface FiscalPrintOutcome {
  readonly ok: boolean;
  readonly fiscalNumber?: string;
  readonly serialNumber?: string;
  readonly errorMessage?: string;
}

export type FiscalReceiptStatus = 'pending' | 'emitted' | 'failed' | 'cancelled';

/** Voce della coda «da fiscalizzare» (API `fiscal-receipts/pending`). */
export interface PendingFiscalReceipt {
  readonly receiptId: EntityId;
  readonly status: FiscalReceiptStatus;
  readonly errorMessage: string | null;
  readonly createdAt: IsoDateString;
  readonly totalMinor: number;
  readonly payload: FiscalPrintPayload;
}

export interface ReportFiscalOutcomePayload {
  readonly outcome: 'emitted' | 'failed';
  readonly fiscalNumber?: string;
  readonly serialNumber?: string;
  readonly errorMessage?: string;
}
