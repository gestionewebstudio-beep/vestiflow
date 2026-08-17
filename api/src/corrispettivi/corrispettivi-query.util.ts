import {
  DocumentStatus,
  DocumentType,
  Prisma,
  SalesOrderFinancialStatus as PrismaFinancial,
  SalesOrderRefundKind as PrismaRefundKind,
  SalesOrderSource as PrismaSource,
} from '@prisma/client';

import {
  buildPlacedAtFilter,
  type SalesOrderListFilters,
} from '../sales-orders/sales-order-query.util';
import { prismaFinancialFilter, toPrismaSource } from '../sales-orders/sales-order.enum-mapper';
import {
  sourcesFor,
  type CorrispettiviAmbito,
  type CorrispettiviCanale,
} from './corrispettivi-classification.util';

export interface CorrispettiviListFilters extends SalesOrderListFilters {
  /**
   * Le due dimensioni del Registro, **derivate** dall’origine e mai persistite.
   * Sostituiscono `onlineOnly`/`posOnly`, che erano un asse solo travestito da
   * due e non sapevano dire «tutto Shopify, online e POS insieme».
   */
  readonly ambito?: CorrispettiviAmbito;
  readonly canale?: CorrispettiviCanale;
  readonly refundsOnly?: boolean;
  /** `all` · `sales` · `returns` · `refunds` — filtra l'elenco, non il riepilogo. */
  readonly rowType?: string;
}

/**
 * Filtri Prisma condivisi tra lista corrispettivi, summary ed export.
 *
 * ⚠️ **Il periodo si misura sulla data di EVASIONE, non su quella dell'ordine**,
 * e un ordine senza evasione non entra affatto. È la correzione del 14/08/2026
 * (`01` §2.16): il registro dichiarava 386,49 € su un agosto il cui
 * corrispettivo vero era 50,00 €, perché contava anche ciò che non era mai
 * partito.
 *
 * Per le cessioni di beni mobili la regola **ordinaria** è la consegna o
 * spedizione (_base normativa riferita_: art. 6 DPR 633/1972), ed è quanto la
 * specifica `08` §5 aveva già fissato. Il registro derivato non la rispettava:
 * aggregava per `placedAt` e prendeva tutto.
 *
 * ⚠️ **Non è però la regola completa, e questo commento prima lo lasciava
 * intendere.** Lo stesso articolo anticipa il momento di effettuazione se
 * prima della consegna viene emessa fattura o pagato il corrispettivo — il che
 * su un ordine incassato con carta accade quasi sempre, giorni prima della
 * spedizione.
 *
 * **VestiFlow non può derivarla oggi**: _misurato il 14/08/2026_, su
 * `SalesOrder` esistono `placedAt`, `fulfilledAt`, `cancelledAt` e
 * **nessuna data di incasso** — le transazioni del
 * canale non vengono importate. Manca il dato, non la logica.
 *
 * Quindi la formulazione corretta, e da non irrigidire: **per il flusso
 * supportato oggi il registro usa la data di evasione**; gestire gli eventi di
 * pagamento fiscalmente antecedenti richiede di persistire le transazioni del
 * canale, cosa che oggi non avviene. È un limite noto e datato, non una svista.
 *
 * **Gli ordini annullati NON si filtrano**, ed è deliberato. Filtrarli farebbe
 * sparire retroattivamente una vendita già avvenuta se l'ordine venisse
 * annullato dopo — che è l'opposto della regola «il passato non si riscrive, si
 * rettifica». Un annullamento pre-evasione non ha data di evasione e quindi non
 * entra da sé; uno post-evasione lascia la vendita alla sua data e produce una
 * rettifica alla propria.
 */
export function buildCorrispettiviWhere(
  tenantId: string,
  query: CorrispettiviListFilters,
): Prisma.SalesOrderWhereInput {
  const financialFilter = prismaFinancialFilter(query.financialStatus);
  const prismaSource = toPrismaSource(query.source);
  const fulfilledAt = buildPlacedAtFilter(query.placedFrom, query.placedTo);

  // Il filtro per origine c’è SEMPRE, e non è una restrizione dei filtri: è la
  // prima domanda del Registro — *questo evento è un corrispettivo?* Un Ordine
  // cliente manuale non lo è (impegno commerciale, non vendita), e senza questa
  // riga entrava: misurati due ordini per 229,36 €.
  //
  // Ambito e canale restringono poi fra le origini ammesse, e la loro
  // intersezione può essere VUOTA (es. Online + VestiFlow): la lista resta
  // vuota — `{ in: [] }` — invece di mostrare tutto.
  const classified = sourcesFor(query.ambito, query.canale);
  const sourceFilter: Prisma.EnumSalesOrderSourceFilter = {
    in: prismaSource ? classified.filter((source) => source === prismaSource) : classified,
  };

  const where: Prisma.SalesOrderWhereInput = {
    tenantId,
    // La vendita esiste per il registro solo quando la merce è partita.
    fulfilledAt: fulfilledAt ? { ...fulfilledAt, not: null } : { not: null },
    ...(financialFilter ? { financialStatus: { in: financialFilter } } : {}),
    source: sourceFilter,
    ...(query.refundsOnly
      ? {
          financialStatus: {
            in: [PrismaFinancial.refunded, PrismaFinancial.partially_refunded],
          },
        }
      : {}),
    ...(query.search
      ? {
          OR: [
            { orderNumber: { contains: query.search, mode: 'insensitive' } },
            { customerName: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  return where;
}

/**
 * Le rettifiche del periodo: quanto va tolto, e alla data in cui è avvenuto.
 *
 * **Due filtri soltanto, ed è deliberato.** Il periodo si misura su
 * `occurredAt` — la data della rettifica, non quella della vendita che
 * rettifica: è tutto il punto del modello «l'originale resta, la rettifica
 * arriva alla sua data». Il canale segue quello dell'ordine collegato.
 *
 * Gli altri filtri della lista non si applicano: stato fiscale, stato di
 * pagamento e ricerca testuale descrivono un ORDINE, e una rettifica non è un
 * ordine. Applicarglieli darebbe un totale che non è né lordo né netto.
 *
 * **Gli annullamenti restano fuori.** Sono conservati in tabella perché sono
 * fatti arrivati dal canale (specifica `08` §4), ma un annullamento
 * pre-evasione non rettifica niente: quella vendita non è mai entrata nel
 * registro, perché non ha data di evasione. Sottrarla porterebbe il totale
 * sotto zero — misurato: 110,00 € su agosto 2026.
 */
export function buildCorrispettiviRefundWhere(
  tenantId: string,
  query: CorrispettiviListFilters,
): Prisma.SalesOrderRefundWhereInput {
  const occurredAt = buildPlacedAtFilter(query.placedFrom, query.placedTo);
  const prismaSource = toPrismaSource(query.source);

  // Stessa prima domanda delle vendite: una rettifica su un ordine che non è un
  // corrispettivo non è un corrispettivo negativo.
  const classified = sourcesFor(query.ambito, query.canale);
  const sourceFilter: Prisma.EnumSalesOrderSourceFilter = {
    in: prismaSource ? classified.filter((source) => source === prismaSource) : classified,
  };

  // «Resi» e «Rimborsi» sono due voci diverse perché sono due gesti diversi:
  // nel primo la merce è tornata, nel secondo solo il denaro. Gli annullamenti
  // restano fuori in ogni caso — non rettificano niente.
  const kind =
    query.rowType === 'returns'
      ? { equals: PrismaRefundKind.return_with_restock }
      : query.rowType === 'refunds'
        ? { equals: PrismaRefundKind.refund_only }
        : { not: PrismaRefundKind.cancellation };

  return {
    tenantId,
    kind,
    ...(occurredAt ? { occurredAt } : {}),
    order: { source: sourceFilter },
  };
}

/**
 * Le **Vendite al banco** del periodo: la terza sorgente del Registro (`11` §5).
 *
 * Restituisce `null` quando i filtri escludono già il canale VestiFlow o
 * l'ambito online — così chi chiama non interroga una tabella per scartarne il
 * risultato. Un `null` significa «questa sorgente non c'entra con la domanda»,
 * non «non ci sono righe».
 *
 * ⚠️ **La data del registro è `documentDate`**, non `createdAt`: è la data
 * economica della vendita, quella che l'operatore vede e che il periodo deve
 * misurare. Una vendita registrata il giorno dopo resta del giorno prima.
 *
 * I documenti annullati restano fuori: una vendita annullata non è un
 * corrispettivo. Le bozze non esistono su questo tipo — nasce confermato.
 */
export function buildCorrispettiviStoreSaleWhere(
  tenantId: string,
  query: CorrispettiviListFilters,
): Prisma.DocumentWhereInput | null {
  if (!sourcesFor(query.ambito, query.canale).includes(PrismaSource.store)) {
    return null;
  }
  // Il filtro per origine dell'elenco ordini vale anche qui: chiedere
  // `source=manual` non deve far comparire le vendite al banco.
  const prismaSource = toPrismaSource(query.source);
  if (prismaSource && prismaSource !== PrismaSource.store) {
    return null;
  }
  // Uno stato di pagamento descrive un ORDINE: chiederlo esclude una sorgente
  // che non ne ha, invece di mostrarla senza. È la stessa scelta già fatta per
  // le rettifiche, che pure non hanno stato di pagamento.
  if (query.financialStatus || query.refundsOnly) {
    return null;
  }

  const documentDate = buildPlacedAtFilter(query.placedFrom, query.placedTo);

  return {
    tenantId,
    type: DocumentType.store_sale,
    status: { not: DocumentStatus.cancelled },
    ...(documentDate ? { documentDate } : {}),
    ...(query.search
      ? {
          OR: [
            { reference: { contains: query.search, mode: 'insensitive' } },
            { customerName: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
}
