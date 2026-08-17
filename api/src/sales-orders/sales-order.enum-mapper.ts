import {
  SalesOrderFinancialStatus as PrismaFinancial,
  SalesOrderFulfillmentStatus as PrismaFulfillment,
  SalesOrderSource as PrismaSource,
} from '@prisma/client';

/** Valori canale accettati in query (allineati al frontend). */
export const API_SOURCE_ONLINE = 'online';
export const API_SOURCE_POS = 'pos';
/** Ordini creati manualmente nel gestionale (fase 3 §2: registro multicanale). */
export const API_SOURCE_MANUAL = 'manual';
/** Tutti i canali Shopify (online + POS), per la schermata Ordini Shopify (fase 3 §3). */
export const API_SOURCE_SHOPIFY = 'shopify';
/** Vendita al banco: la cassa di VestiFlow. Distinto da `pos`, che e' il POS di Shopify. */
export const API_SOURCE_STORE = 'store';

/** Valori pagamento accettati in query (allineati al frontend). */
export const API_FINANCIAL_VALUES = [
  'pending',
  'paid',
  'partially_refunded',
  'refunded',
  'voided',
] as const;

/** Valori evasione accettati in query (allineati al frontend). */
export const API_FULFILLMENT_VALUES = ['unfulfilled', 'partial', 'fulfilled'] as const;

/**
 * Stato derivato dell'ordine (rispecchia la colonna Stato della lista):
 * aperto (Confermato/Aperto) · concluso (Concluso/Evaso) · annullato.
 */
export const API_STATE_OPEN = 'open';
export const API_STATE_CONCLUDED = 'concluded';
export const API_STATE_CANCELLED = 'cancelled';
export const API_STATE_VALUES = [
  API_STATE_OPEN,
  API_STATE_CONCLUDED,
  API_STATE_CANCELLED,
] as const;

export type ApiSalesOrderSource =
  | typeof API_SOURCE_ONLINE
  | typeof API_SOURCE_POS
  | typeof API_SOURCE_MANUAL
  | typeof API_SOURCE_STORE;

export function toPrismaSource(source?: string): PrismaSource | undefined {
  switch (source) {
    case API_SOURCE_ONLINE:
      return PrismaSource.shopify_online;
    case API_SOURCE_POS:
      return PrismaSource.shopify_pos;
    case API_SOURCE_MANUAL:
      return PrismaSource.manual;
    case API_SOURCE_STORE:
      return PrismaSource.store;
    default:
      return undefined;
  }
}

/** Filtro multi-canale: 'shopify' copre online + POS (fase 3 §3). */
export function prismaSourceFilter(source?: string): PrismaSource[] | undefined {
  if (source === API_SOURCE_SHOPIFY) {
    return [PrismaSource.shopify_online, PrismaSource.shopify_pos];
  }
  const single = toPrismaSource(source);
  return single ? [single] : undefined;
}

/**
 * Uno `switch` senza ramo predefinito, di proposito.
 *
 * Prima era una catena di ternari che chiudeva con «altrimenti online»: quando al canale
 * si e' aggiunto `store`, quel ramo se lo sarebbe preso senza che niente lo segnalasse — e
 * uno scontrino di cassa sarebbe comparso come vendita online. Non un vuoto: una bugia.
 * Cosi' invece il prossimo valore nuovo lo dice il compilatore.
 */
export function fromPrismaSource(source: PrismaSource): ApiSalesOrderSource {
  switch (source) {
    case PrismaSource.manual:
      return API_SOURCE_MANUAL;
    case PrismaSource.shopify_pos:
      return API_SOURCE_POS;
    case PrismaSource.store:
      return API_SOURCE_STORE;
    case PrismaSource.shopify_online:
      return API_SOURCE_ONLINE;
  }
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

export function prismaFulfillmentFilter(status?: string): PrismaFulfillment[] | undefined {
  switch (status) {
    case 'unfulfilled':
      return [PrismaFulfillment.unfulfilled];
    case 'partial':
      return [PrismaFulfillment.partially_fulfilled];
    case 'fulfilled':
      return [PrismaFulfillment.fulfilled];
    default:
      return undefined;
  }
}

/** Stesso motivo di `fromPrismaSource`: nessun ramo predefinito che assorba i valori nuovi. */
export function sourceDisplayLabel(source: PrismaSource): string {
  switch (source) {
    case PrismaSource.manual:
      return 'Manuale';
    // «Negozio» e «Cassa» dicevano il falso e si scambiavano di posto: la
    // prima indicava lo Shopify POS, non il negozio di VestiFlow. Ora ogni
    // etichetta nomina la sorgente vera (`11` §1, `10` §4).
    case PrismaSource.shopify_pos:
      return 'Shopify POS';
    case PrismaSource.store:
      return 'Vendita al banco';
    case PrismaSource.shopify_online:
      return 'Online';
  }
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
