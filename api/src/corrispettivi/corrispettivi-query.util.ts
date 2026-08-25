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
import { prismaFinancialFilter } from '../sales-orders/sales-order.enum-mapper';
import {
  effectiveOrigins,
  MANUAL_RECEIPT_ORIGIN,
  salesOrderSourcesOf,
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
  /**
   * **Origine**: da cosa nasce la riga. La terza dimensione, e non un sinonimo
   * delle prime due — senza, il Corrispettivo manuale non è isolabile, perché
   * condivide con la Vendita al banco la coppia Fisico/POS · VestiFlow.
   */
  readonly origine?: string;
  readonly refundsOnly?: boolean;
  /** `all` · `sales` · `returns` · `refunds` — filtra l'elenco, non il riepilogo. */
  readonly rowType?: string;
  /**
   * Sede. Le righe che una sede non ce l'hanno **escono**, perché a quella sede
   * non sono attribuibili — ma il riepilogo dice quante sono (`10` §12).
   */
  readonly locationId?: string;
  /**
   * Il verso opposto: le sole righe **senza sede**.
   *
   * Serve a contare ciò che il filtro Sede lascia fuori, ed esiste come flag
   * invece che come «`locationId: null`» perché il conteggio deve passare dagli
   * **stessi** builder dell'elenco: una seconda catena di filtri, scritta a
   * mano accanto a questa, conterebbe righe diverse da quelle che spariscono —
   * ed è esattamente il difetto che il numero dichiarato deve smentire.
   */
  readonly undeterminedLocationOnly?: boolean;

  // ── I filtri a INSIEME (`docs/10` §16) ────────────────────────────────
  /** Origini selezionate. **Vuoto o assente = tutte.** */
  readonly origini?: readonly string[];
  /** Tipi di evento selezionati. **Vuoto o assente = tutti.** */
  readonly tipi?: readonly string[];
  /** Sedi selezionate. **Vuoto o assente = tutte.** */
  readonly sedi?: readonly string[];
  /**
   * ⚠️ **«Nessun risultato», che NON è «nessuna restrizione».** Un vecchio
   * indirizzo poteva contraddirsi e rendere zero righe: deve continuare a
   * renderne zero. Ha un campo suo perché l'insieme vuoto significa già
   * «tutti», e caricarlo del significato opposto lo renderebbe illeggibile.
   */
  readonly nessunRisultato?: boolean;
}

/**
 * Il filtro sede, nelle sue tre forme: nessuna, una sede, «senza sede».
 *
 * `locationId: null` in Prisma è un valore, non «qualunque»: è ciò che aggancia
 * le righe che una sede non ce l'hanno.
 */
function locationFilter(query: CorrispettiviListFilters): {
  locationId?: string | null | { in: string[] };
} {
  if (query.undeterminedLocationOnly) {
    return { locationId: null };
  }
  // ⚠️ Insieme vuoto = nessuna restrizione: il filtro si OMETTE, non si passa
  // vuoto. `{ in: [] }` in Prisma non è «tutte le sedi», è nessuna riga.
  if (query.sedi && query.sedi.length > 0) {
    return { locationId: { in: [...query.sedi] } };
  }
  return query.locationId ? { locationId: query.locationId } : {};
}

/**
 * I tipi di evento chiesti (`docs/10` §16). **Vuoto o assente = tutti.**
 *
 * Il singolare `rowType` resta per gli indirizzi salvati, e `refundsOnly` era
 * già una congiunzione travestita da booleano — «resi **e** rimborsi» — che qui
 * torna a essere ciò che è sempre stata.
 */
export function tipiRichiesti(query: CorrispettiviListFilters): readonly string[] {
  if (query.tipi && query.tipi.length > 0) {
    return query.tipi.filter((t) => t !== 'all');
  }
  if (query.rowType && query.rowType !== 'all') {
    return [query.rowType];
  }
  if (query.refundsOnly) {
    return ['returns', 'refunds'];
  }
  return [];
}

/** Vuole le vendite? Insieme vuoto = tutti, quindi sì. */
export function wantsSales(query: CorrispettiviListFilters): boolean {
  const tipi = tipiRichiesti(query);
  return tipi.length === 0 || tipi.includes('sales');
}

/** Vuole le rettifiche? Idem. */
export function wantsRefunds(query: CorrispettiviListFilters): boolean {
  const tipi = tipiRichiesti(query);
  return tipi.length === 0 || tipi.includes('returns') || tipi.includes('refunds');
}

/**
 * Vuole i **resi** — la merce che torna — e non i rimborsi senza rientro?
 *
 * ⚠️ **Non è `wantsRefunds`, e la differenza è quella che l'operatore vede.**
 * `wantsRefunds` è la disgiunzione «resi O rimborsi», e serve a decidere se
 * accendere la sorgente delle rettifiche; dentro quella sorgente il genere si
 * distingue poi per `kind` (vedi `buildCorrispettiviRefundWhere`, che per
 * `refunds` tiene il solo `refund_only`).
 *
 * Il Reso al banco è una sorgente INTERA di un genere solo — porta sempre
 * `return_with_restock` — quindi la distinzione che là avviene nella clausola
 * `kind`, qui deve avvenire nell'interruttore. Accenderlo su `wantsRefunds`
 * farebbe comparire un **Reso** sotto il filtro «Solo rimborsi», dove le
 * rettifiche Shopify sanno già non farsi vedere.
 */
export function wantsReturns(query: CorrispettiviListFilters): boolean {
  const tipi = tipiRichiesti(query);
  return tipi.length === 0 || tipi.includes('returns');
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
  const fulfilledAt = buildPlacedAtFilter(query.placedFrom, query.placedTo);

  // Il filtro per origine c’è SEMPRE, e non è una restrizione dei filtri: è la
  // prima domanda del Registro — *questo evento è un corrispettivo?* Un Ordine
  // cliente manuale non lo è (impegno commerciale, non vendita), e senza questa
  // riga entrava: misurati due ordini per 229,36 €.
  //
  // Ambito, canale e ORIGINE restringono poi fra le origini ammesse, e la loro
  // intersezione può essere VUOTA (es. Online + VestiFlow): la lista resta
  // vuota — `{ in: [] }` — invece di mostrare tutto.
  const sourceFilter: Prisma.EnumSalesOrderSourceFilter = {
    in: salesOrderSourcesOf(effectiveOrigins(query)),
  };

  const where: Prisma.SalesOrderWhereInput = {
    tenantId,
    // La vendita esiste per il registro solo quando la merce è partita.
    fulfilledAt: fulfilledAt ? { ...fulfilledAt, not: null } : { not: null },
    ...(financialFilter ? { financialStatus: { in: financialFilter } } : {}),
    source: sourceFilter,
    // Sede: uguaglianza secca, quindi gli ordini senza sede escono da sé. È il
    // comportamento voluto — non si attribuisce a una sede una vendita che non
    // dice da dove è partita — ed è dichiarato nel riepilogo, non subìto.
    ...locationFilter(query),
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

  // Stessa prima domanda delle vendite: una rettifica su un ordine che non è un
  // corrispettivo non è un corrispettivo negativo.
  const sourceFilter: Prisma.EnumSalesOrderSourceFilter = {
    in: salesOrderSourcesOf(effectiveOrigins(query)),
  };

  // «Resi» e «Rimborsi» sono due voci diverse perché sono due gesti diversi:
  // nel primo la merce è tornata, nel secondo solo il denaro. Gli annullamenti
  // restano fuori in ogni caso — non rettificano niente.
  /*
    ⚠️ **Un INSIEME di generi, non una catena di ternari.**

    Era la forma che non sapeva dire «resi + rimborsi» e per la quale il
    servizio aveva dovuto inventare la stringa `refunds_and_returns` (`docs/10`
    §16): un enum che contiene una congiunzione sta chiedendo di essere un
    insieme.

    Insieme vuoto = nessuna restrizione, e quindi `not: cancellation`: gli
    annullamenti restano fuori in ogni caso, perché non rettificano niente.
  */
  const generi: PrismaRefundKind[] = [];
  for (const tipo of tipiRichiesti(query)) {
    if (tipo === 'returns') generi.push(PrismaRefundKind.return_with_restock);
    if (tipo === 'refunds') generi.push(PrismaRefundKind.refund_only);
  }

  const kind =
    generi.length > 0 ? { in: generi } : { not: PrismaRefundKind.cancellation };

  return {
    tenantId,
    kind,
    ...(occurredAt ? { occurredAt } : {}),
    // La sede di una rettifica è quella dell'ordine che rettifica: non ne ha una
    // propria, e inventargliela sarebbe dire che la merce è tornata altrove.
    order: {
      source: sourceFilter,
      ...locationFilter(query),
    },
  };
}

/**
 * Le **Vendite al banco** del periodo: la terza sorgente del Registro (`11` A9).
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
  // Ambito, canale e ORIGINE decidono insieme: chiedere «Origine = Corrispettivo
  // manuale» spegne la Vendita al banco, che fino al 17/08 non si poteva
  // distinguere da lei — condividono la coppia Fisico/POS · VestiFlow.
  if (!effectiveOrigins(query).includes(PrismaSource.store)) {
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
    ...locationFilter(query),
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

/**
 * I **Resi al banco** del periodo: la QUINTA sorgente del Registro (`11` C8b).
 *
 * ⛔ **Non è l'allargamento del filtro qui sopra, ed è la decisione centrale.**
 * Scrivere `type: { in: [store_sale, store_return] }` in
 * `buildCorrispettiviStoreSaleWhere` sembra la modifica giusta e produce un
 * errore di **segno**: il Reso entrerebbe dal ramo che mappa `kind: 'sale'` con
 * importi positivi e lo conta in `orderCount`. Un reso da 100 € **alzerebbe**
 * il registro di 100 invece di abbassarlo — 200 € di scarto — e comparirebbe
 * filtrando «Solo vendite».
 *
 * È la stessa regola che l'enum `DocumentType` dichiara per la Nota di credito:
 * _«quantità e importi restano POSITIVI: il verso economico negativo lo dà il
 * TIPO, mai il segno nella quantità»_. Qui il tipo lo dichiara una sorgente
 * separata, agganciata a `wantsRefunds` invece che a `wantsSales`.
 *
 * ⚠️ **`refundsOnly` NON spegne questa sorgente**, al contrario delle altre due
 * documentali. Là il ritorno anticipato è giusto — una Vendita al banco non è
 * una rettifica — ma qui lo stesso `return null` farebbe sparire il Reso
 * proprio sotto il filtro che deve mostrarlo. `financialStatus` invece resta:
 * descrive il ciclo di pagamento di un ORDINE, che un documento non ha.
 *
 * ⚠️ **L'origine resta quella della Vendita al banco** (`store` → Fisico/POS ·
 * VestiFlow): è la stessa cassa. Dargliene una propria farebbe sì che chi
 * filtra «Vendita al banco» veda le vendite al LORDO, senza le rettifiche che
 * le abbattono — su un registro fiscale.
 *
 * La data è `documentDate`, gli annullati restano fuori, le bozze non esistono:
 * tutto come la gemella sopra.
 */
export function buildCorrispettiviStoreReturnWhere(
  tenantId: string,
  query: CorrispettiviListFilters,
): Prisma.DocumentWhereInput | null {
  if (!effectiveOrigins(query).includes(PrismaSource.store)) {
    return null;
  }
  if (query.financialStatus) {
    return null;
  }

  const documentDate = buildPlacedAtFilter(query.placedFrom, query.placedTo);

  return {
    tenantId,
    type: DocumentType.store_return,
    status: { not: DocumentStatus.cancelled },
    ...(documentDate ? { documentDate } : {}),
    ...locationFilter(query),
    // ⚠️ Solo il riferimento, a differenza della gemella che cerca anche nel
    // cliente: su un Reso al banco `customerName` è NULL **per costruzione** —
    // `CreateStoreReturnDto` non ha il campo e `createReturn` non lo scrive.
    // Una clausola che non può mai combaciare non allarga la ricerca: fa
    // credere a chi legge il codice che ci sia un cliente da cercare.
    ...(query.search
      ? { reference: { contains: query.search, mode: 'insensitive' as const } }
      : {}),
  };
}

/**
 * I **Corrispettivi manuali** del periodo: la quarta sorgente del Registro
 * (`10` §12). Gemella di quella della Vendita al banco, e con lo stesso
 * `return null`.
 *
 * `null` significa «questa sorgente non c'entra con la domanda», non «non ci
 * sono righe» — ed è il meccanismo con cui una domanda che riguarda **solo gli
 * ordini** spegne una sorgente che ordine non è:
 *
 * - **stato di pagamento** e **«solo resi»** descrivono un ordine: una
 *   registrazione economica non ha un ciclo di pagamento da interrogare, e
 *   mostrarla senza risponderebbe a una domanda diversa da quella posta;
 * - il filtro **origine** dell'elenco ordini (`source=online|pos`) nomina
 *   origini di `sales_orders`: nessuna di quelle è questa;
 * - **ambito e canale** la spengono per la via normale, `includesManualReceipts`.
 *
 * ⚠️ **La data del Registro è `documentDate`**, che qui è l'unica che esiste: è
 * la data economica che l'operatore ha digitato, non quella in cui ha salvato.
 * Una chiusura di cassa recuperata il giorno dopo resta del giorno prima.
 *
 * Non c'è nessuno stato da filtrare, e non è una svista: la registrazione non
 * ne ha uno — esiste o è stata eliminata (`10` §12).
 */
export function buildCorrispettiviManualWhere(
  tenantId: string,
  query: CorrispettiviListFilters,
): Prisma.ManualReceiptWhereInput | null {
  if (!effectiveOrigins(query).includes(MANUAL_RECEIPT_ORIGIN)) {
    return null;
  }
  if (query.financialStatus || query.refundsOnly) {
    return null;
  }
  // La sede è obbligatoria per costruzione: nessuna registrazione manuale può
  // essere «senza sede», quindi la domanda non la riguarda affatto.
  if (query.undeterminedLocationOnly) {
    return null;
  }

  const documentDate = buildPlacedAtFilter(query.placedFrom, query.placedTo);

  return {
    tenantId,
    ...(documentDate ? { documentDate } : {}),
    ...(query.locationId ? { locationId: query.locationId } : {}),
    ...(query.search
      ? {
          OR: [
            { notes: { contains: query.search, mode: 'insensitive' } },
            { lines: { some: { description: { contains: query.search, mode: 'insensitive' } } } },
          ],
        }
      : {}),
  };
}
