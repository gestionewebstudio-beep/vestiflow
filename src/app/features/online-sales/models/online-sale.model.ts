// Read-model frontend delle Vendite online (fase 2 §2-§4, fase 3 §4): snapshot
// generati dal sistema alla piena evasione dell'ordine, che nessuna schermata
// crea o modifica.
//
// Il registro Corrispettivi NON sta qui: è una vista derivata che aggrega
// vendite e documenti per periodo (`features/reports`), e le sue voci proprie
// sono state ritirate il 17/08/2026.

import type { CurrencyCode, EntityId, IsoDateString } from '@core/models/common.model';
import type { OnlineSaleInventoryStatus } from '@core/models/sales-order.model';

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
  /** Aliquota % derivata dallo snapshot IVA congelato sulla riga (solo display). */
  readonly vatRatePercent: number | null;
  readonly taxMinor: number;
  readonly totalMinor: number;
  readonly locationId: EntityId | null;
  readonly vatCodeId: EntityId | null;
  readonly vatCodeLabel: string | null;
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
  readonly linkedDocuments: readonly {
    readonly id: EntityId;
    readonly type: string;
    readonly reference: string | null;
    readonly status: string;
  }[];
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
