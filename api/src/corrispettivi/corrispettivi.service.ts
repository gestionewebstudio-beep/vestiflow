import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  SalesOrderFulfillmentStatus as PrismaFulfillment,
  SalesOrderRefundKind as PrismaRefundKind,
  SalesOrderSource as PrismaSource,
  type SalesOrder,
  type SalesOrderFinancialStatus,
  type SalesOrderRefundKind,
  type SalesOrderSource,
} from '@prisma/client';

import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import type { Paginated } from '../common/dto/pagination.dto';
import {
  INVENTORY_VIEW_SCOPE_MODE,
  listLocationsInScope,
} from '../inventory/licensed-location-scope.util';
import { accumulaCorrispettivi } from './corrispettivi-totals.util';
import { PrismaService } from '../prisma/prisma.service';
import { buildPlacedAtFilter } from '../sales-orders/sales-order-query.util';
import { API_SOURCE_ONLINE, API_SOURCE_POS } from '../sales-orders/sales-order.enum-mapper';
import { vatSnapshotRatePercent } from '../vat/vat-snapshot.util';
import {
  MANUAL_RECEIPT_ORIGIN,
  type CorrispettivoOrigin,
} from './corrispettivi-classification.util';
import { isRefundFinancialStatus } from './corrispettivi-fiscal.enum-mapper';
import { compareCorrispettiviRowsDesc } from './corrispettivi-sort.util';
import {
  buildCorrispettiviManualWhere,
  buildCorrispettiviRefundWhere,
  buildCorrispettiviStoreSaleWhere,
  buildCorrispettiviWhere,
} from './corrispettivi-query.util';
import type { ListCorrispettiviQueryDto } from './dto/list-corrispettivi.query.dto';

export interface CorrispettiviSummaryDto {
  readonly orderCount: number;
  /** Ordini con stato «evaso» ma **senza data**: non conteggiabili, non nascosti. */
  readonly undatedFulfilmentCount: number;
  readonly refundsCount: number;
  readonly subtotalMinor: number;
  readonly taxMinor: number;
  readonly shippingMinor: number;
  readonly discountMinor: number;
  readonly totalMinor: number;
  readonly taxableMinor: number;
  // ── Rettifiche del periodo (specifica 08 §4) ────────────────────────────
  /** Quante rettifiche, annullamenti esclusi. */
  readonly refundCount: number;
  readonly refundTotalMinor: number;
  readonly refundTaxMinor: number;
  /** Annullamenti del periodo: contati per trasparenza, mai sottratti. */
  readonly cancellationCount: number;
  readonly cancellationTotalMinor: number;
  // ── Il numero che conta ─────────────────────────────────────────────────
  readonly netTotalMinor: number;
  readonly netTaxMinor: number;
  readonly netTaxableMinor: number;
  /**
   * Righe che il filtro Sede ha lasciato fuori perché una sede non ce l'hanno.
   *
   * ⚠️ **Zero quando il filtro non è attivo**, e non è un dettaglio: senza
   * filtro quelle righe restano normalmente nel Registro e nei totali. Il numero
   * esiste perché la schermata lo dichiari invece di far sparire righe in
   * silenzio — un registro che perde righe scegliendo una sede mostrerebbe un
   * totale più basso del vero (`10` §12).
   */
  readonly locationUndeterminedExcludedCount: number;
}

export type CorrispettiviOrderRow = SalesOrder & {
  customer: { email: string | null } | null;
};

/** Una sede selezionabile nel filtro del Registro. */
export interface CorrispettiviLocationDto {
  readonly id: string;
  readonly name: string;
}

/**
 * Una riga del registro: o una vendita, o una rettifica.
 *
 * **Non è un'entità nuova**: è derivata da `sales_orders` e
 * `sales_order_refunds`, che restano le fonti. Serve perché il registro deve
 * poter essere **sommato a occhio** — il totale in fondo alla schermata si
 * ricostruisce dalla colonna, riga per riga, senza fidarsi di un riepilogo.
 *
 * Le rettifiche portano importi **negativi** apposta: è ciò che rende la
 * colonna sommabile e la riconciliazione verificabile da chi guarda.
 */
/**
 * Che **evento** è la riga: una vendita, o una rettifica.
 *
 * ⚠️ **Il Corrispettivo manuale è una `sale`**, e per un momento non lo è
 * stato: aveva un `kind` proprio, «Registrazione». È stato corretto il
 * 17/08/2026 — economicamente rappresenta una vendita avvenuta, e «Registrazione»
 * era una distinzione TECNICA travestita da tipo evento.
 *
 * La sua particolarità è l'**origine**, che è un'altra dimensione: Tipo dice
 * *cosa è successo*, Origine *da dove viene la riga*. Sovraccaricare il tipo
 * evento per far emergere la sorgente confonde due assi — ed è lo stesso errore
 * che il §13 aveva evitato non riusando `SalesOrderSource`.
 */
export type CorrispettiviRowKind = 'sale' | 'refund';

/** L'imponibile e l'imposta di una singola aliquota dentro una riga. */
export interface CorrispettivoVatBreakdownRow {
  readonly ratePercent: number;
  readonly netMinor: number;
  readonly vatMinor: number;
}

export interface CorrispettiviRegisterRow {
  /** Identità della riga nella lista (`sale:` / `refund:` / `store:` / `manual:`). */
  readonly rowId: string;
  readonly kind: CorrispettiviRowKind;
  /**
   * L'ordine da cui si apre la riga. **`null` sulla Vendita al banco**, che non
   * nasce da un ordine ma da un documento: la sua sorgente canonica è
   * `Document.type = store_sale` (`11` §3), e il Registro la LEGGE — non le
   * costruisce un ordine addosso per farla entrare, che sarebbe una seconda
   * rappresentazione della stessa transazione.
   */
  readonly salesOrderId: string | null;
  /** Il documento da cui la riga viene, quando non è un ordine. */
  readonly documentId: string | null;
  /** La registrazione manuale da cui la riga viene, quando è la quarta sorgente. */
  readonly manualReceiptId: string | null;
  readonly orderNumber: string;
  /** Data con cui la riga entra nel registro: evasione, o data della rettifica. */
  readonly occurredAt: Date;
  /**
   * L'**istante reale** dell'evento o della registrazione, che ordina le righe
   * dentro la loro giornata (`corrispettivi-sort.util.ts`).
   *
   * ⚠️ Non è un doppione di `occurredAt`: coincide con lei dove la sorgente
   * porta già un istante — canale e rettifiche — ma dove la data economica è un
   * `DATE` (Vendita al banco, Corrispettivo manuale) `occurredAt` vale
   * **mezzanotte**, e senza questo campo tutte le righe di quel giorno
   * pareggerebbero fra loro.
   */
  readonly eventAt: Date;
  /**
   * L'origine della riga.
   *
   * ⚠️ **Non è `SalesOrderSource`, ed è la decisione del §13.** La quarta
   * sorgente non nasce da un ordine: si allarga il tipo della RIGA, non l'enum
   * del database — mettere in `sales_orders.source` un valore che quella tabella
   * non avrà mai sarebbe scrivere una cosa falsa per comodità di tipizzazione.
   */
  readonly source: CorrispettivoOrigin;
  readonly customerName: string;
  readonly customerEmail: string | null;
  /** La sede a cui la riga appartiene; `null` = non determinata (`10` §12). */
  readonly locationId: string | null;
  readonly locationName: string | null;
  readonly currency: string;
  readonly taxableMinor: number;
  readonly taxMinor: number;
  readonly totalMinor: number;
  /** Solo sulle vendite: una rettifica non ha stato di pagamento né fiscale. */
  readonly financialStatus: SalesOrderFinancialStatus | null;
  /** Solo sulle rettifiche: che gesto è stato. */
  readonly refundKind: SalesOrderRefundKind | null;
  readonly note: string | null;
  /**
   * Il dettaglio per aliquota, **solo dove esiste davvero**.
   *
   * Oggi lo porta il solo Corrispettivo manuale, che conserva le sue righe per
   * aliquota per costruzione. Sulle altre tre sorgenti il dato esiste nel
   * database ma il Registro non lo legge — le sue query caricano le testate — e
   * ricostruirlo è un lavoro proprio con almeno un ostacolo noto:
   * `SalesOrder.taxMinor` viene da `total_tax` di Shopify e **include l'imposta
   * di spedizione**, che sulle righe non c'è (`10` §12).
   *
   * `null` significa quindi «questa sorgente non lo espone», non «non ha IVA».
   */
  readonly vatBreakdown: readonly CorrispettivoVatBreakdownRow[] | null;
}

/**
 * Tetto alla fusione delle due sorgenti, dichiarato invece che scoperto.
 *
 * La lista unisce vendite e rettifiche e le ordina per data: farlo in SQL
 * richiederebbe una UNION scritta a mano, e per un registro che si consulta a
 * periodo — un mese, un trimestre — non ripaga. Oltre questa soglia però non si
 * tronca in silenzio: si chiede di restringere il periodo.
 */
const REGISTER_MERGE_CEILING = 5_000;

@Injectable()
export class CorrispettiviService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * L'elenco del registro: vendite e rettifiche nello stesso flusso, ordinate
   * per la data con cui entrano.
   *
   * Prima mostrava solo le vendite, e da quando il riepilogo sottrae le
   * rettifiche la schermata si contraddiceva: il totale diceva 95,00 e
   * l'elenco sotto ne mostrava 300,01. Un registro in cui la somma della
   * colonna non fa il totale in fondo non è consultabile.
   */
  async listOrders(
    tenantId: string,
    query: ListCorrispettiviQueryDto,
  ): Promise<Paginated<CorrispettiviRegisterRow>> {
    const rows = await this.buildRegisterRows(tenantId, query);
    const skip = (query.page - 1) * query.pageSize;

    return {
      items: rows.slice(skip, skip + query.pageSize),
      total: rows.length,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /**
   * Le sedi del filtro Sede: quelle di cui l'utente può **consultare** il
   * corrispettivo.
   *
   * ⚠️ **Non è la stessa domanda di `GET /manual-receipts/locations`**, e per
   * questo sono due endpoint. Qui si chiede «di quali sedi posso CONSULTARE», lì
   * «su quali posso REGISTRARE»: unificarle darebbe o un filtro chiuso a chi può
   * solo leggere, o una tendina che propone sedi su cui il salvataggio poi
   * risponde 403.
   *
   * ⚠️ **La distinzione non nasce qui**, ed è la condizione per tenerla: sta nel
   * modello centrale, dove `applyReadLocationScope` ammette anche
   * `inventory.view_all_locations` e `applyWriteLocationScope` no. Le due rotte
   * chiamano lo **stesso** `resolveOperationalLocationScope` e differiscono per
   * il solo `mode` — nessuna policy parallela, nessuna regola propria.
   *
   * _Qui c'era una regola scritta apposta per questa schermata: non filtrare per
   * «attiva» né «inclusa nel piano», perché «il Registro è storico». È stata
   * ritirata il 17/08 — rendeva i due elenchi diversi per una ragione che il
   * modello centrale non conosce._
   */
  async listRegisterLocations(
    tenantId: string,
    user: UserProfileDto | undefined,
  ): Promise<CorrispettiviLocationDto[]> {
    return listLocationsInScope(this.prisma, tenantId, user, INVENTORY_VIEW_SCOPE_MODE);
  }

  /**
   * Il dataset del registro, una volta sola.
   *
   * Lista ed export chiamano **questa**, e non due query che si assomigliano:
   * è ciò che impedisce il caso già visto una volta, in cui il riepilogo
   * conosceva le rettifiche e il file per il commercialista no. Una selezione,
   * un dataset — strutturale, non promesso in un commento.
   */
  async buildRegisterRows(
    tenantId: string,
    query: ListCorrispettiviQueryDto,
  ): Promise<CorrispettiviRegisterRow[]> {
    const where = buildCorrispettiviWhere(tenantId, query);
    const refundWhere = buildCorrispettiviRefundWhere(tenantId, query);

    // «Solo resi» significa le RETTIFICHE, non gli ordini che ne hanno una: in
    // un elenco che le contiene, mostrare la vendita al posto del reso sarebbe
    // la risposta alla domanda sbagliata. Il vecchio interruttore booleano
    // resta valido e coincide con `rowType: returns` + `refunds`.
    const rowType = query.rowType ?? (query.refundsOnly ? 'refunds_and_returns' : 'all');
    const wantsSales = rowType === 'all' || rowType === 'sales';
    const wantsRefunds = rowType !== 'sales';

    // La Vendita al banco è la TERZA sorgente del registro, e passa da qui
    // perché qui la fusione esiste già: due sorgenti unite in memoria e
    // ordinate per data, con un tetto dichiarato. Aggiungerne una non cambia
    // la forma — è il motivo per cui non serviva né una UNION scritta a mano
    // né una tabella nuova.
    const storeWhere = buildCorrispettiviStoreSaleWhere(tenantId, query);
    // La QUARTA sorgente: stesso percorso della terza, e per la stessa ragione —
    // la fusione in memoria esiste già, aggiungerne una non cambia la forma.
    const manualWhere = buildCorrispettiviManualWhere(tenantId, query);

    const [saleCount, refundCount, storeCount, manualCount] = await Promise.all([
      wantsSales ? this.prisma.salesOrder.count({ where }) : Promise.resolve(0),
      wantsRefunds
        ? this.prisma.salesOrderRefund.count({ where: refundWhere })
        : Promise.resolve(0),
      storeWhere && wantsSales ? this.prisma.document.count({ where: storeWhere }) : 0,
      // ⚠️ Senza questo quarto conteggio il tetto misurerebbe MENO di quanto la
      // lista poi elenca, e la protezione che dichiara «restringi il periodo»
      // lascerebbe passare proprio i casi che deve fermare.
      manualWhere && wantsSales ? this.prisma.manualReceipt.count({ where: manualWhere }) : 0,
    ]);

    const rowCount = saleCount + refundCount + storeCount + manualCount;
    if (rowCount > REGISTER_MERGE_CEILING) {
      throw new BadRequestException(
        `Il periodo selezionato contiene ${rowCount} righe: restringi le date per consultarlo.`,
      );
    }

    const [orders, refunds, storeSales, manualReceipts] = await Promise.all([
      wantsSales
        ? this.prisma.salesOrder.findMany({
            where,
            include: {
              customer: { select: { party: { select: { email: true } } } },
              // La sede va LETTA, non dedotta: il Registro non la conosceva
              // affatto, e senza il nome la colonna mostrerebbe un uuid.
              location: { select: { id: true, name: true } },
            },
          })
        : Promise.resolve([]),
      wantsRefunds
        ? this.prisma.salesOrderRefund.findMany({
            where: refundWhere,
            include: {
              order: {
                select: {
                  orderNumber: true,
                  source: true,
                  customerName: true,
                  customer: { select: { party: { select: { email: true } } } },
                  location: { select: { id: true, name: true } },
                },
              },
            },
          })
        : Promise.resolve([]),
      storeWhere && wantsSales
        ? this.prisma.document.findMany({
            where: storeWhere,
            select: {
              id: true,
              number: true,
              reference: true,
              documentDate: true,
              customerName: true,
              currency: true,
              taxMinor: true,
              totalMinor: true,
              createdAt: true,
              location: { select: { id: true, name: true } },
            },
          })
        : Promise.resolve([]),
      manualWhere && wantsSales
        ? this.prisma.manualReceipt.findMany({
            where: manualWhere,
            select: {
              id: true,
              number: true,
              documentDate: true,
              notes: true,
              currency: true,
              subtotalMinor: true,
              taxMinor: true,
              totalMinor: true,
              createdAt: true,
              location: { select: { id: true, name: true } },
              // Le righe servono al SOLO dettaglio per aliquota dell'export: i
              // totali della riga di Registro arrivano dalla testata, che li
              // porta già arrotondati.
              lines: { select: { vatSnapshot: true, netMinor: true, vatMinor: true } },
            },
          })
        : Promise.resolve([]),
    ]);

    const rows: CorrispettiviRegisterRow[] = [
      ...orders.map((order) => ({
        rowId: `sale:${order.id}`,
        kind: 'sale' as const,
        salesOrderId: order.id,
        documentId: null,
        manualReceiptId: null,
        orderNumber: order.orderNumber,
        // Non nullo per costruzione: il filtro esclude i mai evasi.
        occurredAt: order.fulfilledAt ?? order.placedAt,
        eventAt: order.fulfilledAt ?? order.placedAt,
        source: order.source,
        customerName: order.customerName,
        customerEmail: order.customer?.party.email ?? null,
        locationId: order.location?.id ?? null,
        locationName: order.location?.name ?? null,
        currency: order.currency,
        taxableMinor: Math.max(0, order.totalMinor - order.taxMinor),
        taxMinor: order.taxMinor,
        totalMinor: order.totalMinor,
        financialStatus: order.financialStatus,
        refundKind: null,
        note: null,
        vatBreakdown: null,
      })),
      ...refunds.map((refund) => ({
        rowId: `refund:${refund.id}`,
        kind: 'refund' as const,
        salesOrderId: refund.salesOrderId,
        documentId: null,
        manualReceiptId: null,
        orderNumber: refund.order.orderNumber,
        occurredAt: refund.occurredAt,
        eventAt: refund.occurredAt,
        source: refund.order.source,
        customerName: refund.order.customerName,
        customerEmail: refund.order.customer?.party.email ?? null,
        locationId: refund.order.location?.id ?? null,
        locationName: refund.order.location?.name ?? null,
        currency: refund.currency,
        // Negativi: è ciò che rende sommabile la colonna.
        taxableMinor: -Math.max(0, refund.totalMinor - refund.taxMinor),
        taxMinor: -refund.taxMinor,
        totalMinor: -refund.totalMinor,
        financialStatus: null,
        refundKind: refund.kind,
        note: refund.note,
        vatBreakdown: null,
      })),
      ...storeSales.map((sale) => ({
        rowId: `store:${sale.id}`,
        kind: 'sale' as const,
        salesOrderId: null,
        documentId: sale.id,
        manualReceiptId: null,
        orderNumber: sale.reference ?? (sale.number != null ? String(sale.number) : ''),
        occurredAt: sale.documentDate,
        // `documentDate` è un giorno: l'istante che ordina è la registrazione.
        eventAt: sale.createdAt,
        // `store` esiste già in SalesOrderSource, ed è la cassa di VestiFlow:
        // la riga si classifica con la stessa mappa delle altre (Fisico/POS ·
        // VestiFlow) senza inventare una dimensione parallela.
        source: PrismaSource.store,
        customerName: sale.customerName ?? '',
        customerEmail: null,
        locationId: sale.location?.id ?? null,
        locationName: sale.location?.name ?? null,
        currency: sale.currency,
        taxableMinor: Math.max(0, sale.totalMinor - sale.taxMinor),
        taxMinor: sale.taxMinor,
        totalMinor: sale.totalMinor,
        // Una Vendita al banco è incassata al banco: non ha un ciclo di
        // pagamento da mostrare, e inventarne uno direbbe una cosa non vera.
        financialStatus: null,
        refundKind: null,
        note: null,
        vatBreakdown: null,
      })),
      ...manualReceipts.map((receipt) => ({
        rowId: `manual:${receipt.id}`,
        // Una VENDITA, come evento: economicamente il corrispettivo rappresenta
        // una vendita avvenuta. A distinguerlo è l'`source` qui sotto — Tipo e
        // Origine sono due assi, e caricare il primo di ciò che appartiene al
        // secondo li confonde entrambi.
        kind: 'sale' as const,
        salesOrderId: null,
        documentId: null,
        manualReceiptId: receipt.id,
        // Il numero si mostra NUDO: 1, 2, 3 — nessun prefisso, nessuno zero di
        // riempimento. Non è un progressivo fiscale, identifica la riga.
        orderNumber: String(receipt.number),
        occurredAt: receipt.documentDate,
        eventAt: receipt.createdAt,
        source: MANUAL_RECEIPT_ORIGIN,
        // Nessun cliente, e non è un campo mancante: una chiusura di cassa non
        // sa a chi ha venduto. Vuoto è la risposta vera.
        customerName: '',
        customerEmail: null,
        // Certa e obbligatoria per costruzione: qui «Non determinata» non
        // esiste, ed è la differenza con le righe Shopify.
        locationId: receipt.location.id,
        locationName: receipt.location.name,
        currency: receipt.currency,
        taxableMinor: receipt.subtotalMinor,
        taxMinor: receipt.taxMinor,
        totalMinor: receipt.totalMinor,
        financialStatus: null,
        refundKind: null,
        note: receipt.notes,
        vatBreakdown: buildVatBreakdown(receipt.lines),
      })),
    ].sort(compareCorrispettiviRowsDesc);

    return rows;
  }

  async getSummary(
    tenantId: string,
    query: ListCorrispettiviQueryDto,
  ): Promise<CorrispettiviSummaryDto> {
    const where = buildCorrispettiviWhere(tenantId, query);
    // Il riepilogo legge le STESSE QUATTRO sorgenti dell’elenco. Se ne leggesse
    // tre, la somma della colonna non farebbe il totale in fondo — il difetto
    // che questa schermata ha già avuto una volta con le rettifiche, e che
    // toccando il solo elenco si ripeterebbe tale e quale.
    const storeWhere = buildCorrispettiviStoreSaleWhere(tenantId, query);
    const storeSales = storeWhere
      ? await this.prisma.document.findMany({
          where: storeWhere,
          select: { taxMinor: true, totalMinor: true },
        })
      : [];
    const manualWhere = buildCorrispettiviManualWhere(tenantId, query);
    const manualReceipts = manualWhere
      ? await this.prisma.manualReceipt.findMany({
          where: manualWhere,
          select: { subtotalMinor: true, taxMinor: true, totalMinor: true },
        })
      : [];
    const orders = await this.prisma.salesOrder.findMany({
      where,
      select: {
        subtotalMinor: true,
        taxMinor: true,
        shippingMinor: true,
        discountMinor: true,
        totalMinor: true,
        financialStatus: true,
        source: true,
      },
    });

    // Le rettifiche del periodo, alla LORO data e senza gli annullamenti.
    //
    // ⚠️ Il filtro per TIPO di riga si toglie di proposito: serve a guardare
    // l'elenco, non a ridefinire il corrispettivo del periodo. Filtrando
    // «Resi», il totale deve continuare a dire quanto si è incassato — non
    // −205,00, che è un numero senza significato e che qualcuno trascriverebbe.
    const refunds = await this.prisma.salesOrderRefund.findMany({
      where: buildCorrispettiviRefundWhere(tenantId, { ...query, rowType: undefined }),
      select: { totalMinor: true, taxMinor: true },
    });
    // Gli annullamenti si contano e non si sottraggono: la vendita che
    // annullano non è mai entrata nel registro (specifica 08 §4).
    const cancellations = await this.prisma.salesOrderRefund.findMany({
      where: {
        ...buildCorrispettiviRefundWhere(tenantId, { ...query, rowType: undefined }),
        kind: PrismaRefundKind.cancellation,
      },
      select: { totalMinor: true },
    });

    // Evasi senza data: fuori dal conteggio perché non databili, ma dichiarati.
    // Un registro fiscale non fa sparire niente in silenzio.
    const undatedFulfilmentCount = await this.prisma.salesOrder.count({
      where: {
        tenantId,
        fulfilledAt: null,
        fulfillmentStatus: PrismaFulfillment.fulfilled,
      },
    });

    // ⚠️ **Una sola matematica**, e da qui in poi vale anche per i subtotali
    // giornalieri del blocco B: due implementazioni che «si assomigliano» non
    // possono garantire che la somma delle parti faccia il totale.
    const totali = accumulaCorrispettivi({
      ordini: orders,
      venditeBanco: storeSales,
      corrispettiviManuali: manualReceipts,
      rettifiche: refunds,
      annullamenti: cancellations,
    });

    return {
      ...totali,
      undatedFulfilmentCount,
      locationUndeterminedExcludedCount: await this.countUndeterminedLocationRows(tenantId, query),
      /*
        ⚠️ **Il clamp sta QUI, fuori dall'accumulatore, e ci sta per poco.**

        `Math.max(0, …)` non distribuisce sulla somma, quindi dentro la
        matematica romperebbe l'additività — che è tutto ciò per cui
        l'accumulatore è stato estratto. Applicandolo alla composizione della
        risposta, il comportamento visibile resta **identico al centesimo** in
        questo passo, e nel passo 4 si toglie da due righe invece che
        rincorrerlo dentro i cicli.
      */
      taxableMinor: Math.max(0, totali.taxableMinor),
      netTaxableMinor: Math.max(0, totali.netTaxableMinor),
    };
  }

  /**
   * Quante righe il filtro Sede ha lasciato fuori **perché una sede non ce
   * l'hanno** — non perché ne abbiano un'altra.
   *
   * Si contano le stesse sorgenti che l'elenco mostrerebbe, con gli stessi
   * filtri, sostituendo la sede scelta con «nessuna sede». Il Corrispettivo
   * manuale non entra mai in questo conto: la sua sede è obbligatoria per
   * costruzione (`10` §12).
   *
   * ⚠️ **Senza filtro Sede il numero è zero**, e non è una scorciatoia: senza
   * filtro quelle righe sono dentro il Registro e dentro i totali. Il numero
   * misura ciò che il filtro toglie, non un'anomalia permanente.
   */
  private async countUndeterminedLocationRows(
    tenantId: string,
    query: ListCorrispettiviQueryDto,
  ): Promise<number> {
    if (!query.locationId) {
      return 0;
    }
    // Le sole righe SENZA sede, dagli STESSI builder dell'elenco: una seconda
    // catena di filtri scritta a mano conterebbe righe diverse da quelle che
    // spariscono, ed è proprio ciò che questo numero deve smentire.
    const senzaSede = { ...query, locationId: undefined, undeterminedLocationOnly: true };
    const rowType = query.rowType ?? (query.refundsOnly ? 'refunds_and_returns' : 'all');
    const wantsSales = rowType === 'all' || rowType === 'sales';
    const wantsRefunds = rowType !== 'sales';

    const storeWhere = buildCorrispettiviStoreSaleWhere(tenantId, senzaSede);

    const [saleCount, refundCount, storeCount] = await Promise.all([
      wantsSales
        ? this.prisma.salesOrder.count({ where: buildCorrispettiviWhere(tenantId, senzaSede) })
        : Promise.resolve(0),
      wantsRefunds
        ? this.prisma.salesOrderRefund.count({
            where: buildCorrispettiviRefundWhere(tenantId, senzaSede),
          })
        : Promise.resolve(0),
      storeWhere && wantsSales
        ? this.prisma.document.count({ where: storeWhere })
        : Promise.resolve(0),
    ]);

    return saleCount + refundCount + storeCount;
  }

  private aggregateOrders(
    orders: readonly {
      subtotalMinor: number;
      taxMinor: number;
      shippingMinor: number;
      totalMinor: number;
      financialStatus: SalesOrder['financialStatus'];
    }[],
  ): {
    subtotalMinor: number;
    taxMinor: number;
    shippingMinor: number;
    totalMinor: number;
    refundsCount: number;
  } {
    let subtotalMinor = 0;
    let taxMinor = 0;
    let shippingMinor = 0;
    let totalMinor = 0;
    let refundsCount = 0;

    for (const order of orders) {
      subtotalMinor += order.subtotalMinor;
      taxMinor += order.taxMinor;
      shippingMinor += order.shippingMinor;
      totalMinor += order.totalMinor;
      if (isRefundFinancialStatus(order.financialStatus)) {
        refundsCount += 1;
      }
    }

    return { subtotalMinor, taxMinor, shippingMinor, totalMinor, refundsCount };
  }
}

/**
 * Il dettaglio per aliquota di una registrazione manuale, aggregato dalle righe.
 *
 * L'aliquota si legge dallo **snapshot congelato**, non dal Codice IVA vivo: se
 * il codice cambia domani, la registrazione di ieri deve continuare a raccontare
 * l'aliquota con cui è stata fatta — è tutto il motivo per cui lo snapshot
 * esiste, e il suo `vat_code_id` è `SetNull` e non `Restrict`.
 *
 * Ordinato per aliquota crescente, come il riepilogo IVA dei documenti: due
 * elenchi della stessa cosa che si ordinano diversamente si leggono come due
 * cose diverse.
 */
function buildVatBreakdown(
  lines: readonly { vatSnapshot: unknown; netMinor: number; vatMinor: number }[],
): CorrispettivoVatBreakdownRow[] {
  const byRate = new Map<number, { netMinor: number; vatMinor: number }>();
  for (const line of lines) {
    const ratePercent = vatSnapshotRatePercent(line.vatSnapshot) ?? 0;
    const current = byRate.get(ratePercent) ?? { netMinor: 0, vatMinor: 0 };
    byRate.set(ratePercent, {
      netMinor: current.netMinor + line.netMinor,
      vatMinor: current.vatMinor + line.vatMinor,
    });
  }
  return [...byRate.entries()]
    .map(([ratePercent, totals]) => ({ ratePercent, ...totals }))
    .sort((a, b) => a.ratePercent - b.ratePercent);
}
