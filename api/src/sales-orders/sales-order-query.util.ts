import {
  OrderCommercialState,
  Prisma,
  ReservationStatus,
  SalesOrderFulfillmentStatus as PrismaFulfillment,
  SalesOrderSource,
} from '@prisma/client';

import {
  prismaFinancialFilter,
  prismaFulfillmentFilter,
  prismaSourceFilter,
} from './sales-order.enum-mapper';

export interface SalesOrderListFilters {
  readonly search?: string;
  readonly financialStatus?: string;
  readonly fulfillmentStatus?: string;
  readonly source?: string;
  /** Stato derivato: open | concluded | cancelled (rispecchia la colonna Stato). */
  readonly state?: string;
  readonly customerId?: string;
  readonly locationId?: string;
  readonly placedFrom?: string;
  readonly placedTo?: string;
  /** Solo ordini includibili: manuali, non annullati, non ancora collegati. */
  readonly includable?: boolean;
  /** Solo ordini che sul canale non risultano più (cancellati su Shopify). */
  readonly missingOnChannel?: boolean;
}

/** Filtri Prisma condivisi tra lista ed export vendite. */
export function buildSalesOrderWhere(
  tenantId: string,
  query: SalesOrderListFilters,
): Prisma.SalesOrderWhereInput {
  // Ogni filtro contribuisce un blocco alla clausola AND: cosi' i filtri che
  // portano un proprio `OR` (ricerca, stato «concluso») non si sovrascrivono.
  const conditions: Prisma.SalesOrderWhereInput[] = [];

  const financialFilter = prismaFinancialFilter(query.financialStatus);
  if (financialFilter) {
    conditions.push({ financialStatus: { in: financialFilter } });
  }

  const fulfillmentFilter = prismaFulfillmentFilter(query.fulfillmentStatus);
  if (fulfillmentFilter) {
    conditions.push({ fulfillmentStatus: { in: fulfillmentFilter } });
  }

  const sourceFilter = prismaSourceFilter(query.source);
  if (sourceFilter) {
    conditions.push({ source: { in: sourceFilter } });
  }

  const placedAt = buildPlacedAtFilter(query.placedFrom, query.placedTo);
  if (placedAt) {
    conditions.push({ placedAt });
  }

  if (query.customerId) {
    conditions.push({ customerId: query.customerId });
  }

  if (query.locationId) {
    // La colonna Location deriva dalla location dell'impegno attivo: il filtro
    // rispecchia la colonna (ordini con un impegno attivo su quella sede).
    conditions.push({
      reservations: { some: { status: ReservationStatus.active, locationId: query.locationId } },
    });
  }

  const stateFilter = buildStateFilter(query.state);
  if (stateFilter) {
    conditions.push(stateFilter);
  }

  /**
   * Includibili in un documento.
   *
   * ⚠️ **Qui c'era «è il COLLEGAMENTO a rendere un ordine non più includibile —
   * non lo stato»**, con un filtro su `cancelledAt` + `documentId`. Dal
   * 28/08/2026 la regola commerciale è lo STATO (`12` §0.4-bis):
   *
   * ```text
   *   commercialState = confirmed   ← la regola
   *   AND documentId IS NULL        ← la guardia d'integrità
   * ```
   *
   * ⭐ **Il collegamento resta, ma cambia mestiere**: non decide più, verifica.
   * Su un ordine coerente i due criteri coincidono; divergono solo sugli
   * incoerenti, che così **non ricompaiono in silenzio** fra gli includibili
   * (fail closed).
   *
   * ⛔ Nessun ramo «documento collegato annullato»: `cancel()` azzera
   * `documentId` su tutti gli ordini agganciati, quindi sul Cliente quel caso
   * non è uno stato normale — ammetterlo legittimerebbe una condizione che il
   * codice non produce.
   */
  if (query.includable) {
    conditions.push({
      source: SalesOrderSource.manual,
      commercialState: OrderCommercialState.confirmed,
      documentId: null,
    });
  }

  // Spariti dal canale: la riconciliazione dello scarico ordini li ha visti
  // mancare dall'elenco remoto. Serve a raccoglierli per rimuoverli in blocco,
  // che è l'unica azione prevista — VestiFlow non li cancella da solo.
  if (query.missingOnChannel) {
    conditions.push({ channelMissingSince: { not: null } });
  }

  if (query.search) {
    conditions.push({
      OR: [
        { orderNumber: { contains: query.search, mode: 'insensitive' } },
        { customerName: { contains: query.search, mode: 'insensitive' } },
        {
          lines: {
            some: {
              OR: [
                { title: { contains: query.search, mode: 'insensitive' } },
                { sku: { contains: query.search, mode: 'insensitive' } },
              ],
            },
          },
        },
      ],
    });
  }

  return {
    tenantId,
    ...(conditions.length > 0 ? { AND: conditions } : {}),
  };
}

/**
 * Filtro della colonna Stato — **due mondi, e restano due**.
 *
 * ```text
 *   source = manual        commercialState             ← l'autorità
 *   source ≠ manual        cancelledAt / fulfillment   ← i campi del canale
 * ```
 *
 * ⭐ **La stessa voce di filtro copre entrambi**, ma con predicati diversi: un
 * ordine Shopify «evaso» e un ordine manuale «concluso» si scrivono allo stesso
 * modo per chi guarda l'elenco, e in modo diverso nel database. Fonderli
 * significherebbe reinterpretare i campi del canale, che è esattamente ciò che
 * `18` §2.4-bis vieta.
 *
 * ⚠️ `to_confirm` esiste solo per gli ordini manuali: un ordine di canale
 * arriva già piazzato, non ha una fase «da confermare».
 */
export function buildStateFilter(state?: string): Prisma.SalesOrderWhereInput | undefined {
  const manuale = (
    commercialState: OrderCommercialState,
  ): Prisma.SalesOrderWhereInput => ({
    source: SalesOrderSource.manual,
    commercialState,
  });

  switch (state) {
    case 'to_confirm':
      // Nessun equivalente di canale: la voce filtra i soli manuali.
      return manuale(OrderCommercialState.to_confirm);
    case 'cancelled':
      return {
        OR: [
          manuale(OrderCommercialState.cancelled),
          { source: { not: SalesOrderSource.manual }, cancelledAt: { not: null } },
        ],
      };
    case 'concluded':
      return {
        OR: [
          manuale(OrderCommercialState.concluded),
          {
            source: { not: SalesOrderSource.manual },
            cancelledAt: null,
            fulfillmentStatus: PrismaFulfillment.fulfilled,
          },
        ],
      };
    case 'open':
      return {
        OR: [
          manuale(OrderCommercialState.confirmed),
          {
            source: { not: SalesOrderSource.manual },
            cancelledAt: null,
            fulfilledAt: null,
            NOT: { fulfillmentStatus: PrismaFulfillment.fulfilled },
          },
        ],
      };
    default:
      return undefined;
  }
}

/** Intervallo inclusivo su date calendario ISO (YYYY-MM-DD), UTC. */
export function buildPlacedAtFilter(
  placedFrom?: string,
  placedTo?: string,
): Prisma.DateTimeFilter | undefined {
  if (!placedFrom && !placedTo) {
    return undefined;
  }

  const filter: Prisma.DateTimeFilter = {};
  if (placedFrom) {
    filter.gte = startOfUtcDay(placedFrom);
  }
  if (placedTo) {
    filter.lte = endOfUtcDay(placedTo);
  }
  return filter;
}

function startOfUtcDay(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

function endOfUtcDay(isoDate: string): Date {
  return new Date(`${isoDate}T23:59:59.999Z`);
}
