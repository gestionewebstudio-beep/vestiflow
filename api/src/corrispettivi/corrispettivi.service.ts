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
import {
  accumulaPerGiorno,
  totaleDaiGiorni,
  type TotaliGiornata,
} from './corrispettivi-totals.util';
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
  buildCorrispettiviStoreReturnWhere,
  buildCorrispettiviStoreSaleWhere,
  buildCorrispettiviWhere,
  wantsRefunds,
  wantsReturns,
  wantsSales,
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

  /**
   * I totali **giornata per giornata**, in ordine decrescente.
   *
   * ⚠️ Non sono un secondo calcolo: il totale del periodo qui sopra È la loro
   * somma, quindi la riconciliazione non è una proprietà da verificare — è la
   * definizione. Viaggiano sempre, anche a raggruppamento spento: costano
   * quanto un raggruppamento in memoria di righe già lette, e averli pronti
   * evita una seconda richiesta quando l'operatore accende la vista.
   */
  readonly perGiornata: readonly TotaliGiornata[];
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
  /**
   * Identità della riga nella lista: `sale:` · `refund:` · `store:` ·
   * `manual:` · `storeReturn:`.
   */
  readonly rowId: string;
  readonly kind: CorrispettiviRowKind;
  /**
   * L'ordine da cui si apre la riga. **`null` sulla Vendita al banco**, che non
   * nasce da un ordine ma da un documento: la sua sorgente canonica è
   * `Document.type = store_sale` (`11` B1), e il Registro la LEGGE — non le
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

    /*
      ⚠️ **Nessun taglio: il Registro è delimitato dal PERIODO e dai FILTRI, non
      da un numero di righe.**

      C'era uno `slice(skip, skip + pageSize)`, e la schermata chiedeva cento
      righe con `page: 1` fisso e nessun paginatore: su un periodo da 850 righe
      l'operatore leggeva «850 righe nel periodo» e ne poteva consultare cento.
      Un registro contabile che ne mostra una parte senza dirlo è peggio di uno
      che rifiuta il periodo.

      **E quel taglio non proteggeva niente.** Il costo — quattro
      interrogazioni, fusione e ordinamento globale in memoria — è già stato
      pagato per intero quando si arriva qui: affettare dopo limitava solo il
      peso della risposta, mai il lavoro del server.

      A delimitare resta `REGISTER_MERGE_CEILING`, che è il tetto vero e lo
      dichiara rifiutando il periodo.

      ⚠️ `page` e `pageSize` restano nel tipo perché la forma `Paginated` è
      condivisa, ma **qui non decidono più niente** e non vanno reintrodotti di
      straforo: un parametro accettato e ignorato è il difetto di `onlineOnly`,
      che questa stessa area ha già pagato una volta.
    */
    return {
      items: rows,
      total: rows.length,
      page: 1,
      pageSize: rows.length,
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
    const vuoleVendite = wantsSales(query);
    const vuoleRettifiche = wantsRefunds(query);

    // La Vendita al banco è la TERZA sorgente del registro, e passa da qui
    // perché qui la fusione esiste già: due sorgenti unite in memoria e
    // ordinate per data, con un tetto dichiarato. Aggiungerne una non cambia
    // la forma — è il motivo per cui non serviva né una UNION scritta a mano
    // né una tabella nuova.
    const storeWhere = buildCorrispettiviStoreSaleWhere(tenantId, query);
    // La QUARTA sorgente: stesso percorso della terza, e per la stessa ragione —
    // la fusione in memoria esiste già, aggiungerne una non cambia la forma.
    const manualWhere = buildCorrispettiviManualWhere(tenantId, query);
    // La QUINTA: il Reso al banco. Stessa tabella della terza, tipo diverso e
    // — soprattutto — appesa a `vuoleResi`, non a `vuoleVendite` né a
    // `vuoleRettifiche`: è una sorgente di UN genere solo (`return_with_restock`),
    // quindi la distinzione resi/rimborsi che le rettifiche Shopify fanno nella
    // clausola `kind` qui deve stare nell'interruttore. Su `vuoleRettifiche` un
    // Reso comparirebbe sotto «Solo rimborsi».
    const vuoleResi = wantsReturns(query);
    const storeReturnWhere = buildCorrispettiviStoreReturnWhere(tenantId, query);

    /*
      ⛔ **I cinque conteggi erano un giro di rete in più, e il giro qui costa
      caro** — misurato il 21/08/2026: **269 ms di round-trip a vuoto** verso il
      database gestito. Non è il lavoro della query: è la distanza.

      Contavano per applicare il tetto PRIMA di leggere. Ora le cinque letture
      partono subito con `take: TETTO + 1` ciascuna, e il tetto si verifica
      dopo: nel caso normale si risparmia un round-trip intero, nel caso limite
      si è letto invano — ma quel caso finisce comunque in errore, e con il
      `take` non legge più di quanto avrebbe contato.
    */

    const [orders, refunds, storeSales, manualReceipts, storeReturns] = await Promise.all([
      vuoleVendite
        ? this.prisma.salesOrder.findMany({
            take: REGISTER_MERGE_CEILING + 1,
            where,
            include: {
              customer: { select: { party: { select: { email: true } } } },
              // La sede va LETTA, non dedotta: il Registro non la conosceva
              // affatto, e senza il nome la colonna mostrerebbe un uuid.
              location: { select: { id: true, name: true } },
            },
          })
        : Promise.resolve([]),
      vuoleRettifiche
        ? this.prisma.salesOrderRefund.findMany({
            take: REGISTER_MERGE_CEILING + 1,
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
      storeWhere && vuoleVendite
        ? this.prisma.document.findMany({
            take: REGISTER_MERGE_CEILING + 1,
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
      manualWhere && vuoleVendite
        ? this.prisma.manualReceipt.findMany({
            take: REGISTER_MERGE_CEILING + 1,
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
      storeReturnWhere && vuoleResi
        ? this.prisma.document.findMany({
            take: REGISTER_MERGE_CEILING + 1,
            where: storeReturnWhere,
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
              // ⛔ NON `internalComment`. La causale del reso vive lì, ed è
              // allettante mostrarla — ma è un campo INTERNO, e uscirebbe nel
              // file che va al commercialista mentre le note pubbliche dello
              // stesso documento non ci vanno. Si legge `notes`, come fa la
              // riga di rettifica Shopify. Mostrare anche la causale è una
              // decisione separata, e riguarda tutti i documenti.
              notes: true,
              location: { select: { id: true, name: true } },
            },
          })
        : Promise.resolve([]),
    ]);

    // ⛔ Il tetto, ora verificato su ciò che si è letto. Il messaggio dice «più
    // di», non un numero preciso: con `take` non si conosce il totale vero, e
    // dichiarare una cifra inventata sarebbe peggio che non dichiararla.
    const righeLette =
      orders.length +
      refunds.length +
      storeSales.length +
      manualReceipts.length +
      storeReturns.length;
    if (righeLette > REGISTER_MERGE_CEILING) {
      throw new BadRequestException(
        `Il periodo selezionato contiene più di ${REGISTER_MERGE_CEILING} righe: restringi le date per consultarlo.`,
      );
    }

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
      ...storeReturns.map((reso) => ({
        rowId: `storeReturn:${reso.id}`,
        // ⛔ `refund`, MAI `sale`. È l'intera ragione per cui questa sorgente
        // esiste separata invece di essere un `in` sul filtro tipo: da qui
        // discendono il segno degli importi, il secchio dei totali, il
        // conteggio in cui cade e la tinta con cui il client la disegna.
        kind: 'refund' as const,
        salesOrderId: null,
        documentId: reso.id,
        manualReceiptId: null,
        orderNumber: reso.reference ?? (reso.number != null ? String(reso.number) : ''),
        occurredAt: reso.documentDate,
        // `documentDate` è un giorno: l'istante che ordina è la registrazione.
        eventAt: reso.createdAt,
        // ⚠️ La STESSA origine della Vendita al banco: è la stessa cassa.
        source: PrismaSource.store,
        customerName: reso.customerName ?? '',
        customerEmail: null,
        locationId: reso.location?.id ?? null,
        locationName: reso.location?.name ?? null,
        currency: reso.currency,
        // ⚠️ Negativi **solo nella vista**. Il documento li conserva positivi
        // (`store-sales.service.ts`), e il riepilogo li riceve positivi perché
        // lì c'è una sottrazione: passarli negativi anche là li farebbe
        // sommare. Due convenzioni diverse, e vanno tenute distinte.
        taxableMinor: -Math.max(0, reso.totalMinor - reso.taxMinor),
        taxMinor: -reso.taxMinor,
        totalMinor: -reso.totalMinor,
        // Un documento non ha ciclo di pagamento: come la vendita al banco.
        financialStatus: null,
        // Il vocabolario esiste già ed è etichettato «Reso»: non se ne inventa
        // uno nuovo. La spunta magazzino non lo cambia — decide se la merce
        // rientra in giacenza, non se l'evento è un reso (`11` A11-ter).
        refundKind: PrismaRefundKind.return_with_restock,
        note: reso.notes,
        vatBreakdown: null,
      })),
    ].sort(compareCorrispettiviRowsDesc);

    return rows;
  }

  async getSummary(
    tenantId: string,
    query: ListCorrispettiviQueryDto,
  ): Promise<CorrispettiviSummaryDto> {
    const where = buildCorrispettiviWhere(tenantId, query);
    /*
      ⚠️ **Il riepilogo SEGUE il filtro Tipo** (`docs/10` §16, passo 4 del
      blocco A). Fino al 17/08/2026 non lo faceva: leggeva sempre tutte le
      vendite e chiedeva le rettifiche con `rowType: undefined` esplicito. Era
      deliberato — «filtrando Resi il totale deve continuare a dire quanto si è
      incassato, non −205,01, che qualcuno trascriverebbe».

      **La proprietà che ora si pretende è più forte, e le due non convivono:**

          somma dei sottoinsiemi = riepilogo del periodo

      Se i sottoinsiemi filtrano e il totale no, non possono riconciliarsi per
      costruzione — e i subtotali giornalieri del blocco B sono esattamente dei
      sottoinsiemi. La vecchia preoccupazione cade però da sé con la
      multi-selezione: col default (Vendite + Resi + Rimborsi) il numero è
      quello di sempre, e un totale di soli resi non ha bisogno di
      un'etichetta speciale perché **è** il totale di ciò che si è chiesto.

      Il riepilogo legge le STESSE QUATTRO sorgenti dell'elenco, con gli stessi
      interruttori: leggerne tre, o leggerle con un filtro diverso, è il difetto
      che questa schermata ha già avuto una volta con le rettifiche.
    */
    const vuoleVendite = wantsSales(query);
    const vuoleRettifiche = wantsRefunds(query);

    const storeWhere = buildCorrispettiviStoreSaleWhere(tenantId, query);
    const manualWhere = buildCorrispettiviManualWhere(tenantId, query);
    const storeReturnSummaryWhere = buildCorrispettiviStoreReturnWhere(tenantId, query);

    /*
      ⭐ **Le sette letture vanno IN PARALLELO** (corretto il 21/08/2026, su
      segnalazione del proprietario: «quando apro corrispettivi ci mette un po'»).

      Erano sette `await` in fila, ognuno che aspettava il precedente: il tempo
      di apertura era la SOMMA dei round-trip invece del massimo. Non
      dipendevano l'una dall'altra — ogni `where` si costruisce prima, dai soli
      parametri — quindi la serialità non comprava niente.

      ⚠️ `listOrders` era già così: qui la differenza non si vedeva leggendo,
      perché ogni riga presa da sola sembrava corretta.
    */
    const [
      storeSales,
      manualReceipts,
      orders,
      refunds,
      storeReturns,
      cancellations,
      undatedFulfilmentCount,
    ] = await Promise.all([
      storeWhere && vuoleVendite
        ? this.prisma.document.findMany({
            where: storeWhere,
            select: { taxMinor: true, totalMinor: true, documentDate: true },
          })
        : [],
      manualWhere && vuoleVendite
        ? this.prisma.manualReceipt.findMany({
            where: manualWhere,
            select: { subtotalMinor: true, taxMinor: true, totalMinor: true, documentDate: true },
          })
        : [],
      vuoleVendite
        ? this.prisma.salesOrder.findMany({
            where,
            select: {
              subtotalMinor: true,
              taxMinor: true,
              shippingMinor: true,
              discountMinor: true,
              totalMinor: true,
              financialStatus: true,
              source: true,
              fulfilledAt: true,
              placedAt: true,
            },
          })
        : [],
      // Le rettifiche del periodo, alla LORO data e **con lo stesso filtro Tipo
      // dell'elenco**: è la metà mancante della riconciliazione. Qui c'era un
      // `rowType: undefined` esplicito, e con lui la somma dei sottoinsiemi non
      // poteva fare il totale.
      vuoleRettifiche
        ? this.prisma.salesOrderRefund.findMany({
            where: buildCorrispettiviRefundWhere(tenantId, query),
            select: { totalMinor: true, taxMinor: true, occurredAt: true },
          })
        : [],
      // I Resi al banco, quinta sorgente, con lo STESSO interruttore delle altre
      // rettifiche: un reso che comparisse nell'elenco e non qui farebbe divergere
      // le due letture.
      //
      // ⚠️ Gli importi entrano POSITIVI, come quelli di `salesOrderRefund`:
      // `accumulaCorrispettivi` li SOTTRAE (`netTotal = total − refundTotal`).
      storeReturnSummaryWhere && wantsReturns(query)
        ? this.prisma.document.findMany({
            where: storeReturnSummaryWhere,
            select: { taxMinor: true, totalMinor: true, documentDate: true },
          })
        : [],
      /*
          Gli annullamenti si contano e non si sottraggono: la vendita che annullano
          non è mai entrata nel registro (specifica `08` §4).

          ⚠️ **Restano fuori dal filtro Tipo, e non è una svista.** Non sono un tipo
          selezionabile e non entrano in nessun totale: sono una **dichiarazione** di
          ciò che il Registro non conta, e una dichiarazione che sparisce quando si
          filtra dice meno del vero.
        */
      this.prisma.salesOrderRefund.findMany({
        where: {
          ...buildCorrispettiviRefundWhere(tenantId, {
            ...query,
            rowType: undefined,
            tipi: undefined,
          }),
          kind: PrismaRefundKind.cancellation,
        },
        select: { totalMinor: true, occurredAt: true },
      }),
      // Evasi senza data: fuori dal conteggio perché non databili, ma dichiarati.
      // Un registro fiscale non fa sparire niente in silenzio.
      this.prisma.salesOrder.count({
        where: {
          tenantId,
          fulfilledAt: null,
          fulfillmentStatus: PrismaFulfillment.fulfilled,
        },
      }),
    ]);

    // ⚠️ **Una sola matematica**, e da qui in poi vale anche per i subtotali
    // giornalieri del blocco B: due implementazioni che «si assomigliano» non
    // possono garantire che la somma delle parti faccia il totale.
    /*
      ⚠️ **Il totale del periodo È la somma delle giornate, non un calcolo
      parallelo** (`docs/10` §17).

      Le righe si raggruppano per giorno economico, ogni giornata passa dallo
      stesso `accumulaCorrispettivi`, e il periodo si ricava sommandole. Così la
      proprietà che il Registro deve garantire —

          somma dei giorni = totale del periodo

      — smette di essere qualcosa da verificare e diventa **vera per
      costruzione**: non esistono due percorsi che potrebbero divergere, ne
      esiste uno solo letto a due granularità.

      Funziona perché l'accumulatore è fatto di sole somme e differenze. Se un
      giorno qualcuno ci rimettesse dentro un `Math.max(0, …)`, questa riga
      comincerebbe a mentire — ed è il motivo per cui il clamp è stato tolto.
    */
    const perGiornata = accumulaPerGiorno({
      ordini: orders.map((o) => ({ ...o, occurredAt: o.fulfilledAt ?? o.placedAt })),
      venditeBanco: storeSales.map((s) => ({ ...s, occurredAt: s.documentDate })),
      corrispettiviManuali: manualReceipts.map((m) => ({ ...m, occurredAt: m.documentDate })),
      // Le due specie di rettifica nello stesso secchio: quelle di Shopify e i
      // Resi al banco. `refundCount` è la lunghezza di questo elenco, quindi
      // un Reso conta come UNA rettifica e non tocca `orderCount`.
      rettifiche: [
        ...refunds,
        ...storeReturns.map((r) => ({
          totalMinor: r.totalMinor,
          taxMinor: r.taxMinor,
          occurredAt: r.documentDate,
        })),
      ],
      annullamenti: cancellations,
    });
    const totali = totaleDaiGiorni(perGiornata);

    return {
      ...totali,
      perGiornata,
      undatedFulfilmentCount,
      locationUndeterminedExcludedCount: await this.countUndeterminedLocationRows(tenantId, query),
      /*
        ⚠️ **I due `Math.max(0, …)` sono spariti da qui, ed è il punto del
        passo 4.**

        Proteggevano `taxableMinor` e `netTaxableMinor` da un valore negativo.
        Ma il massimo **non distribuisce sulla somma**:

            Σ(totale − imposta)         =  Σtotale − Σimposta
            Σ max(0, totale − imposta)  ≠  max(0, Σtotale − Σimposta)

        quindi su un sottoinsieme in perdita — le rettifiche superano le vendite
        — quello usciva 0, e la somma delle parti superava il tutto. Con il
        filtro Tipo che ora governa anche il riepilogo, quel sottoinsieme è
        raggiungibile in un clic: basta spuntare i soli Resi.

        **Togliere il clamp non cambia il significato economico di nessuna
        sorgente**: cambia che un imponibile netto negativo viene detto invece
        di essere schiacciato. Ed è già ciò che il Registro fa sulle RIGHE, dove
        un reso mostra −73,24 €: era il riepilogo a contraddire l'elenco che gli
        stava sopra.

        Stesso principio della dottrina del denaro — _si arrotonda solo
        all'uscita_ — applicato al clamp: **si clampa all'uscita, mai dentro il
        calcolo.** Se un giorno una casella non dovrà mostrare il segno meno, lo
        si decide alla stampa.
      */
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
    const vuoleVendite = wantsSales(query);
    const vuoleRettifiche = wantsRefunds(query);

    const storeWhere = buildCorrispettiviStoreSaleWhere(tenantId, senzaSede);
    const storeReturnWhere = buildCorrispettiviStoreReturnWhere(tenantId, senzaSede);

    const [saleCount, refundCount, storeCount, storeReturnCount] = await Promise.all([
      vuoleVendite
        ? this.prisma.salesOrder.count({ where: buildCorrispettiviWhere(tenantId, senzaSede) })
        : Promise.resolve(0),
      vuoleRettifiche
        ? this.prisma.salesOrderRefund.count({
            where: buildCorrispettiviRefundWhere(tenantId, senzaSede),
          })
        : Promise.resolve(0),
      storeWhere && vuoleVendite
        ? this.prisma.document.count({ where: storeWhere })
        : Promise.resolve(0),
      storeReturnWhere && wantsReturns(query)
        ? this.prisma.document.count({ where: storeReturnWhere })
        : Promise.resolve(0),
    ]);

    return saleCount + refundCount + storeCount + storeReturnCount;
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
