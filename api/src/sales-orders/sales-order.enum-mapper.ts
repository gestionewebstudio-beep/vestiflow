import {
  SalesOrderFinancialStatus as PrismaFinancial,
  SalesOrderFulfillmentStatus as PrismaFulfillment,
  SalesOrderSource as PrismaSource,
} from '@prisma/client';

/** Valori canale accettati in query (allineati al frontend). */
export const API_SOURCE_ONLINE = 'online';
export const API_SOURCE_POS = 'pos';

/** Valori pagamento accettati in query (allineati al frontend). */
export const API_FINANCIAL_VALUES = [
  'pending',
  'paid',
  'partially_refunded',
  'refunded',
  'voided',
] as const;

export type ApiSalesOrderSource = typeof API_SOURCE_ONLINE | typeof API_SOURCE_POS;
export type ApiSalesOrderFinancialStatus = (typeof API_FINANCIAL_VALUES)[number];

export function toPrismaSource(source?: string): PrismaSource | undefined {
  switch (source) {
    case API_SOURCE_ONLINE:
      return PrismaSource.shopify_online;
    case API_SOURCE_POS:
      return PrismaSource.shopify_pos;
    default:
      return undefined;
  }
}

export function fromPrismaSource(source: PrismaSource): ApiSalesOrderSource {
  return source === PrismaSource.shopify_pos ? API_SOURCE_POS : API_SOURCE_ONLINE;
}

export function prismaFinancialFilter(status?: string): PrismaFinancial[] | undefined {
  switch (status) {
    case 'pending':
      return [PrismaFinancial.pending, PrismaFinancial.authorized];
    case 'paid':
      return [PrismaFinancial.paid];
    case 'partially_refunded':
      return [PrismaFinancial.partially_refunded];
    case 'refunded':
      return [PrismaFinancial.refunded];
    case 'voided':
      return [PrismaFinancial.voided];
    default:
      return undefined;
  }
}

export function fromPrismaFinancial(status: PrismaFinancial): ApiSalesOrderFinancialStatus {
  switch (status) {
    case PrismaFinancial.paid:
      return 'paid';
    case PrismaFinancial.partially_refunded:
      return 'partially_refunded';
    case PrismaFinancial.refunded:
      return 'refunded';
    case PrismaFinancial.voided:
      return 'voided';
    case PrismaFinancial.authorized:
    case PrismaFinancial.pending:
    default:
      return 'pending';
  }
}

export function fromPrismaFulfillment(
  status: PrismaFulfillment,
): 'unfulfilled' | 'partial' | 'fulfilled' {
  switch (status) {
    case PrismaFulfillment.partially_fulfilled:
      return 'partial';
    case PrismaFulfillment.fulfilled:
      return 'fulfilled';
    case PrismaFulfillment.unfulfilled:
    default:
      return 'unfulfilled';
  }
}

export function sourceDisplayLabel(source: PrismaSource): string {
  return source === PrismaSource.shopify_pos ? 'Negozio' : 'Online';
}

export function financialStatusDisplayLabel(status: PrismaFinancial): string {
  switch (status) {
    case PrismaFinancial.paid:
      return 'Pagato';
    case PrismaFinancial.partially_refunded:
      return 'Rimborso parziale';
    case PrismaFinancial.refunded:
      return 'Rimborsato';
    case PrismaFinancial.voided:
      return 'Annullato';
    case PrismaFinancial.authorized:
    case PrismaFinancial.pending:
    default:
      return 'In attesa';
  }
}

export function fulfillmentStatusDisplayLabel(status: PrismaFulfillment): string {
  switch (status) {
    case PrismaFulfillment.partially_fulfilled:
      return 'Evasione parziale';
    case PrismaFulfillment.fulfilled:
      return 'Evaso';
    case PrismaFulfillment.unfulfilled:
    default:
      return 'Da evadere';
  }
}
