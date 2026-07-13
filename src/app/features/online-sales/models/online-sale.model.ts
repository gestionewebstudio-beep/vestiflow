// Read-model frontend delle Vendite online e del registro Corrispettivi
// (fase 2 §2-§4, fase 3 §4-§5). Le vendite sono snapshot generati dal sistema
// alla piena evasione dell'ordine: nessuna schermata le crea o le modifica.

import type { CurrencyCode, EntityId, IsoDateString } from '@core/models/common.model';
import type {
  CorrispettivoEntryStatus,
  OnlineSaleInventoryStatus,
} from '@core/models/sales-order.model';

/** Riga lista Vendite online (fase 3 §4). */
export interface OnlineSaleRow {
  readonly id: EntityId;
  readonly reference: string;
  readonly channel: string;
  readonly channelLabel: string;
  readonly salesOrderId: EntityId;
  readonly orderNumber: string;
  readonly customerName: string;
  readonly orderPlacedAt: IsoDateString;
  readonly fulfilledAt: IsoDateString;
  readonly currency: CurrencyCode;
  readonly totalMinor: number;
  readonly paymentStatus: string;
  readonly inventoryStatus: OnlineSaleInventoryStatus;
  readonly corrispettivoReference: string | null;
  readonly corrispettivoStatus: CorrispettivoEntryStatus | null;
  readonly refundedAt: IsoDateString | null;
  readonly locationName: string | null;
  readonly ddtReference: string | null;
}

export interface OnlineSaleLineRow {
  readonly id: EntityId;
  readonly lineNumber: number;
  readonly variantId: EntityId | null;
  readonly sku: string;
  readonly barcode: string | null;
  readonly description: string;
  readonly quantity: number;
  readonly unitPriceMinor: number;
  readonly subtotalMinor: number;
  readonly vatRatePercent: number | null;
  readonly taxMinor: number;
  readonly totalMinor: number;
  readonly locationId: EntityId | null;
}

export interface OnlineSaleMovementRow {
  readonly id: EntityId;
  readonly type: string;
  readonly quantity: number;
  readonly locationName: string;
  readonly createdAt: IsoDateString;
}

export interface OnlineSaleDetail extends OnlineSaleRow {
  readonly externalOrderId: string;
  readonly externalFulfillmentId: string | null;
  readonly customerAddress: string | null;
  readonly subtotalMinor: number;
  readonly discountMinor: number;
  readonly shippingMinor: number;
  readonly taxMinor: number;
  readonly lines: readonly OnlineSaleLineRow[];
  readonly movements: readonly OnlineSaleMovementRow[];
  readonly corrispettivo: {
    readonly id: EntityId;
    readonly reference: string;
    readonly fiscalDate: IsoDateString;
    readonly status: CorrispettivoEntryStatus;
  } | null;
  readonly linkedDocuments: readonly {
    readonly id: EntityId;
    readonly type: string;
    readonly reference: string | null;
    readonly status: string;
  }[];
}

/** Voce registro Corrispettivi (fase 3 §5). */
export interface CorrispettivoEntryRow {
  readonly id: EntityId;
  readonly reference: string;
  readonly channel: string;
  readonly channelLabel: string;
  readonly onlineSaleId: EntityId;
  readonly onlineSaleReference: string;
  readonly salesOrderId: EntityId;
  readonly orderNumber: string;
  readonly operationalDate: IsoDateString;
  readonly fiscalDate: IsoDateString;
  readonly subtotalMinor: number;
  readonly taxMinor: number;
  readonly totalMinor: number;
  readonly discountMinor: number;
  readonly shippingMinor: number;
  readonly status: CorrispettivoEntryStatus;
  readonly invoiceIssued: boolean;
  readonly excludedFromSummary: boolean;
  readonly exclusionReason: string | null;
  readonly adjustmentNote: string | null;
  readonly refundedAt: IsoDateString | null;
}

/** Riga analitica della voce corrispettivo (fase 3 §5). */
export interface CorrispettivoEntryLineRow {
  readonly id: EntityId;
  readonly lineNumber: number;
  readonly isShipping: boolean;
  readonly description: string;
  readonly quantity: number;
  readonly discountMinor: number;
  readonly subtotalMinor: number;
  readonly vatRatePercent: number | null;
  readonly taxMinor: number;
  readonly totalMinor: number;
}

export interface CorrispettivoEntryDetail extends CorrispettivoEntryRow {
  readonly lines: readonly CorrispettivoEntryLineRow[];
}

/** Filtri lista Vendite online. */
export interface OnlineSaleListQuery {
  readonly page?: number;
  readonly pageSize?: number;
  readonly search?: string;
  readonly channel?: string;
  readonly fulfilledFrom?: string;
  readonly fulfilledTo?: string;
}

/** Filtri registro Corrispettivi (fase 3 §5). */
export interface CorrispettivoEntryListQuery {
  readonly page?: number;
  readonly pageSize?: number;
  /** Ricerca su numero voce, numero ordine, numero Vendita online. */
  readonly search?: string;
  readonly channel?: string;
  readonly status?: CorrispettivoEntryStatus;
  readonly fiscalFrom?: string;
  readonly fiscalTo?: string;
  readonly invoiceIssued?: boolean;
  readonly excludedFromSummary?: boolean;
  readonly vatRatePercent?: number;
}

/** Aggiornamento voce corrispettivo (solo utenti autorizzati). */
export interface CorrispettivoEntryUpdate {
  readonly status?: CorrispettivoEntryStatus;
  readonly fiscalDate?: string;
  readonly invoiceIssued?: boolean;
  readonly excludedFromSummary?: boolean;
  readonly exclusionReason?: string | null;
  readonly adjustmentNote?: string | null;
}
