import type { CurrencyCode, EntityId, IsoDateString, Money } from '@core/models/common.model';

/** Stato fiscale corrispettivi per il commercialista (§8). */
export const SalesOrderFiscalStatus = {
  PendingRegistration: 'pending_registration',
  DeliveredToAccountant: 'delivered_to_accountant',
  ExternallyRegistered: 'externally_registered',
  ExcludedPosRegister: 'excluded_pos_register',
  Invoiced: 'invoiced',
} as const;

export type SalesOrderFiscalStatus =
  (typeof SalesOrderFiscalStatus)[keyof typeof SalesOrderFiscalStatus];

export interface CorrispettiviOrder {
  readonly id: EntityId;
  readonly orderNumber: string;
  readonly source: string;
  readonly financialStatus: string;
  readonly fiscalStatus: SalesOrderFiscalStatus;
  readonly customerName: string;
  readonly customerEmail?: string;
  readonly currency: CurrencyCode;
  readonly subtotal: Money;
  readonly tax: Money;
  readonly shipping: Money;
  readonly discount: Money;
  readonly total: Money;
  readonly taxable: Money;
  readonly placedAt: IsoDateString;
  readonly fiscalDeliveredAt?: IsoDateString;
  readonly fiscalNote?: string;
}

export interface CorrispettiviSummary {
  readonly orderCount: number;
  readonly refundsCount: number;
  readonly subtotal: Money;
  readonly tax: Money;
  readonly shipping: Money;
  readonly discount: Money;
  readonly total: Money;
  readonly taxable: Money;
  readonly pendingDeliveryCount: number;
}

export interface CorrispettiviDelivery {
  readonly id: EntityId;
  readonly periodFrom: IsoDateString;
  readonly periodTo: IsoDateString;
  readonly channelFilter: string;
  readonly orderCount: number;
  readonly subtotal: Money;
  readonly tax: Money;
  readonly shipping: Money;
  readonly total: Money;
  readonly refundsCount: number;
  readonly note?: string;
  readonly createdByName: string;
  readonly createdAt: IsoDateString;
}

export interface CorrispettiviListQuery {
  readonly page?: number;
  readonly pageSize?: number;
  readonly search?: string;
  readonly financialStatus?: string;
  readonly source?: string;
  readonly fiscalStatus?: SalesOrderFiscalStatus;
  readonly placedFrom?: string;
  readonly placedTo?: string;
  readonly onlineOnly?: boolean;
  readonly posOnly?: boolean;
  readonly pendingDeliveryOnly?: boolean;
  readonly refundsOnly?: boolean;
}

export interface MarkCorrispettiviDeliveredRequest {
  readonly placedFrom: string;
  readonly placedTo: string;
  readonly channel?: 'online' | 'pos' | 'all';
  readonly note?: string;
}

export const FISCAL_STATUS_LABELS: Record<SalesOrderFiscalStatus, string> = {
  [SalesOrderFiscalStatus.PendingRegistration]: 'Da registrare',
  [SalesOrderFiscalStatus.DeliveredToAccountant]: 'Consegnato al commercialista',
  [SalesOrderFiscalStatus.ExternallyRegistered]: 'Registrato esternamente',
  [SalesOrderFiscalStatus.ExcludedPosRegister]: 'Escluso (cassa/POS)',
  [SalesOrderFiscalStatus.Invoiced]: 'Fatturato',
};

export const FISCAL_STATUS_TONES: Record<
  SalesOrderFiscalStatus,
  'neutral' | 'info' | 'success' | 'warning' | 'error'
> = {
  [SalesOrderFiscalStatus.PendingRegistration]: 'warning',
  [SalesOrderFiscalStatus.DeliveredToAccountant]: 'info',
  [SalesOrderFiscalStatus.ExternallyRegistered]: 'success',
  [SalesOrderFiscalStatus.ExcludedPosRegister]: 'neutral',
  [SalesOrderFiscalStatus.Invoiced]: 'success',
};
