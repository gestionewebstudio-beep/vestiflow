// Sessioni di cassa (Tranche 1.2): rispecchiano i contratti API `cash-sessions`.

import type { EntityId, IsoDateString } from '@core/models/common.model';
import type { StoreSalePaymentMethod } from '@domain/store-sales/models/store-sale.model';

export type CashSessionStatus = 'open' | 'closed';
export type CashMovementType = 'deposit' | 'withdrawal';

export interface CashSessionTotals {
  readonly salesCashMinor: number;
  readonly salesCardMinor: number;
  readonly salesOtherMinor: number;
  readonly refundsCashMinor: number;
  readonly refundsCardMinor: number;
  readonly refundsOtherMinor: number;
  readonly depositsMinor: number;
  readonly withdrawalsMinor: number;
  readonly expectedCashMinor: number;
  readonly expectedCardMinor: number;
  readonly expectedOtherMinor: number;
}

export interface CashSessionMovementRow {
  readonly id: EntityId;
  readonly type: CashMovementType;
  readonly amountMinor: number;
  readonly reason: string;
  readonly createdAt: IsoDateString;
  readonly createdByName: string;
}

export interface CashSessionSummary {
  readonly id: EntityId;
  readonly locationId: EntityId;
  readonly locationName: string;
  readonly status: CashSessionStatus;
  readonly openedAt: IsoDateString;
  readonly openedByName: string;
  readonly openingFloatMinor: number;
  readonly closedAt: IsoDateString | null;
  readonly closedByName: string | null;
  readonly notes: string | null;
  readonly countedCashMinor: number | null;
  readonly countedCardMinor: number | null;
  readonly countedOtherMinor: number | null;
  /** Chiusa: congelati alla chiusura. Aperta: calcolo corrente. */
  readonly expectedCashMinor: number;
  readonly expectedCardMinor: number;
  readonly expectedOtherMinor: number;
  readonly totals: CashSessionTotals;
  readonly salesCount: number;
  readonly returnsCount: number;
  readonly movements: readonly CashSessionMovementRow[];
}

export interface OpenCashSessionPayload {
  readonly locationId: EntityId;
  readonly openingFloatMinor: number;
  readonly notes?: string;
}

export interface CloseCashSessionPayload {
  readonly countedCashMinor: number;
  readonly countedCardMinor?: number;
  readonly countedOtherMinor?: number;
  readonly notes?: string;
}

export interface CreateCashMovementPayload {
  readonly type: CashMovementType;
  readonly amountMinor: number;
  readonly reason: string;
}

export interface ListCashSessionsQuery {
  readonly locationId?: EntityId;
  readonly from?: IsoDateString;
  readonly to?: IsoDateString;
}

/** Metodo di rimborso del reso: stesso vocabolario dei pagamenti di cassa. */
export type StoreReturnRefundMethod = StoreSalePaymentMethod;
