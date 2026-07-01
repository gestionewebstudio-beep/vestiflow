import type { CorrispettiviSummary } from './corrispettivi.model';

export interface AccountantRegisterDocumentsSummary {
  readonly total: number;
  readonly invoiceDraftToIssue: number;
  readonly invoiceDraftSent: number;
  readonly invoiceDraftExternallyIssued: number;
  readonly invoiceDraftRegistered: number;
  readonly salesDdtPendingInvoice: number;
  readonly supplierDocsPending: number;
}

export interface AccountantRegisterSummary {
  readonly periodFrom: string | null;
  readonly periodTo: string | null;
  readonly documents: AccountantRegisterDocumentsSummary;
  readonly corrispettivi: CorrispettiviSummary;
}

export interface AccountantRegisterQuery {
  readonly dateFrom?: string;
  readonly dateTo?: string;
  readonly channel?: 'online' | 'pos' | 'all';
}

/** Query params per il registro documenti filtrato al commercialista. */
export function buildAccountantDocumentsListQuery(
  dateFrom: string,
  dateTo: string,
): Record<string, string> {
  return {
    dateFrom,
    dateTo,
    accountant: '1',
  };
}

/** DDT vendita confermati senza bozza fattura derivata. */
export function buildPendingInvoiceDocumentsListQuery(
  dateFrom: string,
  dateTo: string,
): Record<string, string> {
  return {
    dateFrom,
    dateTo,
    type: 'sales_ddt',
    pendingInvoice: '1',
  };
}
