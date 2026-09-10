import { OnlineOrderEventType, SalesOrderSource } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { OnlineOrderLifecycleService } from '../../order-reservations/online-order-lifecycle.service';
import { OnlineSaleFulfillmentService } from '../../order-reservations/online-sale-fulfillment.service';
import { StockReservationService } from '../../order-reservations/stock-reservation.service';
import { PlatformAuditService } from '../../common/audit/platform-audit.service';
import { ShopifyConnectionService } from '../../shopify/shopify-connection.service';
import { ShopifyInventoryPushService } from '../../shopify/shopify-inventory-push.service';
import { ShopifyInventoryReconciliationService } from '../../shopify/shopify-inventory-reconciliation.service';
import { ShopifyInventoryRepublishService } from '../../shopify/shopify-inventory-republish.service';
import { ShopifyLinkHistoryService } from '../../shopify/shopify-link-history.service';
import { ShopifyProductPullService } from '../../shopify/shopify-product-pull.service';
import { ShopifySyncService } from '../../shopify/shopify-sync.service';
import { ambienteIntegrazione } from './env';
import { creaDataset, IDS, svuota } from './fixture';
import { creaClientIntegrazione } from './prisma';
import { NegozioSimulato } from './shopify-simulato.util';

/**
 * **La protezione delle scritture di inventario verso Shopify.**
 *
 * ⛔ **Queste prove NON cambiano il comportamento applicativo**: lo misurano.
 *    Dove il comportamento di oggi viola la regola, l'asserzione fissa il
 *    comportamento SBAGLIATO e lo dichiara. ⚠️ **Una prova del limite descrive
 *    il difetto e NON vale come conformità**: quando il rimedio arriverà,
 *    diventerà rossa, e sarà giusto così — va riscritta, non «aggiustata».
 *
 * ⭐ **Ogni prova porta un'etichetta esplicita:**
 *
 *    `CONFORME`  la regola di `docs/24` §8.11.5 è rispettata oggi
 *    `LIMITE`    la regola è violata oggi, e questa prova ne fissa la misura
 *
 * ⛔ **Il confronto concorrenziale non è dimostrato qui.** Che Shopify rifiuti
 *    davvero una scrittura il cui valore atteso non combacia lo prova il test
 *    di contratto contro il negozio di sviluppo
 *    (`src/test/contract/shopify-catalogo.contract-spec.ts`). Il simulatore ne
 *    riproduce la semantica per poterci ragionare sopra: misurarlo qui
 *    misurerebbe il simulatore.
 */
describe('Protezione delle scritture di inventario', () => {
  let prisma: PrismaClient;
  let negozio: NegozioSimulato;
  let storico: ShopifyLinkHistoryService;
  let registro: PlatformAuditService;
  let connessioneVera: ShopifyConnectionService;
  let shopId: string;

  const DOMINIO = 'protezione.myshopify.com';
  const SEDE_REMOTA = '77001';

  beforeAll(() => {
    ambienteIntegrazione();
    prisma = creaClientIntegrazione();
    storico = new ShopifyLinkHistoryService();
    registro = new PlatformAuditService(prisma as never, prisma as never);
    connessioneVera = new ShopifyConnectionService(
      prisma as never,
      {
        shopifyApiKey: '',
        shopifyApiSecret: '',
      } as never,
    );
  });

  afterAll(async () => {
    if (!prisma) {
      return;
    }
    const guasti: string[] = [];
    const tenta = async (passo: string, azione: () => Promise<unknown>) => {
      try {
        await azione();
      } catch (errore) {
        guasti.push(`${passo}: ${errore instanceof Error ? errore.message : String(errore)}`);
      }
    };
    // ⚠️ `shopify_inventory_sync_states` non ha chiavi esterne nel database, e
    //    il TRUNCATE della fixture non la raggiunge (`DA-FARE` §21-ter).
    await tenta('stati sync', () => prisma.shopifyInventorySyncState.deleteMany({}));
    await tenta('svuota', () => svuota(prisma));
    await tenta('disconnessione', () => prisma.$disconnect());
    if (guasti.length > 0) {
      throw new Error(`Pulizia di protezione-scritture-inventario fallita — ${guasti.join(' | ')}`);
    }
  });

  beforeEach(async () => {
    await svuota(prisma);
    await creaDataset(prisma);
    await prisma.shopifyInventorySyncState.deleteMany({});
    await prisma.platformAuditLog.deleteMany({});
    semi = 0;
    negozio = new NegozioSimulato(DOMINIO, 997000);
    const riga = await prisma.shopifyShop.create({
      data: { tenantId: IDS.tenantA, shopGid: 'gid://shopify/Shop/997001' },
    });
    shopId = riga.id;
    await prisma.shopifyConnection.create({
      data: {
        tenantId: IDS.tenantA,
        status: 'connected',
        shopDomain: DOMINIO,
        shopId,
        scopes: ['read_products', 'write_products', 'write_inventory'],
      },
    });
    await prisma.shopifyCredential.create({
      data: {
        tenantId: IDS.tenantA,
        shopDomain: DOMINIO,
        accessTokenEnc: 'cifrato',
        scopes: ['read_products', 'write_products', 'write_inventory'],
      },
    });
    await prisma.location.update({
      where: { id: IDS.locA1 },
      data: { shopifyLocationId: SEDE_REMOTA },
    });
  });

  // ── attrezzi ─────────────────────────────────────────────────────────────

  let semi = 0;
  function semina(nome: string) {
    semi += 1;
    const base = `77030000000${String(semi).padStart(2, '0')}`;
    return negozio.semina({
      title: nome,
      vendor: 'F',
      product_type: 'T',
      tags: 'collaudo',
      opzioni: [{ name: 'Taglia', values: ['M'] }],
      varianti: [{ sku: `${nome}-M`, barcode: `${base}1`, price: '10.00', valori: ['M'] }],
    });
  }

  function creaImport() {
    return new ShopifyProductPullService(
      prisma as never,
      negozio.oauth() as never,
      { requestedScopes: ['read_products', 'write_products'] } as never,
      negozio.admin() as never,
      {
        healStaleErrorStatus: vi.fn(),
        touchSync: vi.fn(),
        recordApiFailure: vi.fn(),
        markSynced: vi.fn(),
        markError: vi.fn(),
      } as never,
      negozio.enrichment() as never,
      storico,
      registro,
    );
  }

  function creaRiconciliazione() {
    return new ShopifyInventoryReconciliationService(prisma as never);
  }

  function creaPush(riconciliazione = creaRiconciliazione(), admin: unknown = negozio.admin()) {
    return new ShopifyInventoryPushService(
      prisma as never,
      negozio.oauth() as never,
      admin as never,
      negozio.graphql() as never,
      { touchSync: vi.fn() } as never,
      riconciliazione,
      storico,
      registro,
    );
  }

  /**
   * Il servizio di sincronizzazione VERO, per il percorso di ACQUISIZIONE.
   *
   * ⚠️ **Due dipendenze sono nulle, e la ragione va detta**: `pullCatalog` e il
   *    ciclo di vita degli ordini non sono raggiunti da
   *    `applyInventoryLevelFromShopify`, che usa soltanto prisma, la
   *    riconciliazione e il push. Passare finti si sarebbe letto come «qui c'è
   *    un doppio»; passare `null` dichiara che quel ramo non viene percorso.
   */
  function creaSync(
    push: ShopifyInventoryPushService,
    riconciliazione: ShopifyInventoryReconciliationService,
  ) {
    return new ShopifySyncService(
      prisma as never,
      connessioneVera,
      null as never,
      null as never,
      riconciliazione,
      push,
    );
  }

  async function importaVariante(nome: string) {
    const remoto = semina(nome);
    await creaImport().importProductFromWebhook(IDS.tenantA, negozio.webhook(remoto.id) as never);
    const prodotto = await prisma.product.findFirstOrThrow({
      where: { tenantId: IDS.tenantA, shopifyProductId: String(remoto.id) },
      include: { variants: true },
    });
    return prodotto.variants[0]!;
  }

  async function giacenza(variantId: string, disponibile: number): Promise<void> {
    await prisma.inventoryLevel.create({
      data: {
        tenantId: IDS.tenantA,
        variantId,
        locationId: IDS.locA1,
        onHand: disponibile,
        committed: 0,
        available: disponibile,
      },
    });
  }

  async function segnaUltimoInvio(variantId: string, ultimoInviato: number): Promise<void> {
    await prisma.shopifyInventorySyncState.create({
      data: {
        tenantId: IDS.tenantA,
        variantId,
        locationId: IDS.locA1,
        lastPushedAvailable: ultimoInviato,
        lastPushedAt: new Date(Date.now() - 3_600_000),
      },
    });
  }

  function statoSync(variantId: string) {
    return prisma.shopifyInventorySyncState.findUnique({
      where: {
        tenantId_variantId_locationId: {
          tenantId: IDS.tenantA,
          variantId,
          locationId: IDS.locA1,
        },
      },
    });
  }

  /** Attende che il push «lancia e dimentica» dell'acquisizione sia arrivato. */
  async function attendiChiamate(metodo: string, quante: number): Promise<boolean> {
    for (let tentativo = 0; tentativo < 100; tentativo += 1) {
      if ((negozio.chiamate.get(metodo) ?? 0) >= quante) {
        return true;
      }
      await new Promise((risolvi) => setTimeout(risolvi, 20));
    }
    return false;
  }

  // ── P1 ───────────────────────────────────────────────────────────────────

  it('P1 · ✅ PROTETTO — vendita online DOPO l ultima conferma: la scrittura viene fermata', async () => {
    // ⭐ **La finestra che il confronto protegge davvero, e ora è protetta.**
    //    VestiFlow ha CONFERMATO 10; fra quella conferma e la scrittura di oggi
    //    arriva una vendita online e il canale scende a 9. Il push parte
    //    portando la base confermata, il canale non la riconosce e rifiuta.
    //
    // ⛔ **Qui questa prova era un LIMITE**, e diceva: «il push di oggi non
    //    legge e non confronta: scrive comunque». Non è più vero — dal
    //    09/09/2026 ogni scrittura viaggia con `changeFromQuantity`. Il testo
    //    resta a dire che cosa è cambiato, perché il difetto che descriveva è
    //    di quelli che rientrano dalla porta di servizio.
    //
    // ⚠️ **Protegge questa finestra, non la correttezza del valore**: se la
    //    convinzione di VestiFlow coincide per caso con il remoto, il confronto
    //    passa lo stesso. È `P2`, e resta aperto.
    const variante = await importaVariante('P1');
    const item = variante.shopifyInventoryItemId!;
    await giacenza(variante.id, 9);
    await segnaUltimoInvio(variante.id, 10);
    negozio.impostaQuantitaRemota(item, SEDE_REMOTA, 10);

    // Fra l'ultima conferma e la scrittura arriva una vendita online: 10 → 9.
    negozio.vendiSulCanale(item, SEDE_REMOTA, 1);
    negozio.azzeraChiamate();

    const esito = await creaPush().pushLevel(IDS.tenantA, variante.id, IDS.locA1);

    // ⭐ La chiamata PARTE — non si legge prima, si confronta scrivendo — ed è
    //    il canale a fermarla. Una sola chiamata in tutto: nessuna lettura
    //    preventiva, che sarebbe un secondo giro e non proteggerebbe di più.
    expect(negozio.chiamate.get('setInventoryQuantities')).toBe(1);
    expect(negozio.totaleChiamate()).toBe(1);
    expect(esito.pushed).toBe(false);
    expect(esito.reason).toBe('divergenza_accertata');

    // ⭐ Il negozio è rimasto a 9: la vendita online non è stata annullata.
    expect(negozio.quantitaRemota(item, SEDE_REMOTA)).toBe(9);
    const stato = await statoSync(variante.id);
    // ⛔ E il confermato non è avanzato a 9 «perché tanto il numero coincide»:
    //    il canale non ha applicato niente, e il confermato dice ciò che il
    //    canale ha applicato.
    expect(stato?.lastPushedAvailable).toBe(10);
    // ⭐ Il lavoro non risolto resta visibile.
    expect(stato?.mismatchDetected).toBe(true);
  });

  // ── P2 ───────────────────────────────────────────────────────────────────

  it('P2 · ⛔ LIMITE DECISIVO — vendita online PRIMA della lettura: il confronto NON basta', async () => {
    // ⭐ **Il controesempio del proprietario, riprodotto.** Shopify 10, due
    //    ordini portano il negozio a 8, VestiFlow ne ha acquisito solo uno e
    //    crede 9. Fra la lettura e la scrittura non cambia NIENTE: il confronto
    //    trova quello che si aspetta e la scrittura passa — rimettendo una
    //    disponibilità falsa. La divergenza è avvenuta PRIMA della lettura, e
    //    lì il confronto non guarda.
    const variante = await importaVariante('P2');
    const item = variante.shopifyInventoryItemId!;
    negozio.impostaQuantitaRemota(item, SEDE_REMOTA, 10);
    negozio.vendiSulCanale(item, SEDE_REMOTA, 1); // primo ordine, acquisito
    negozio.vendiSulCanale(item, SEDE_REMOTA, 1); // secondo ordine, NON acquisito
    expect(negozio.quantitaRemota(item, SEDE_REMOTA)).toBe(8);

    // VestiFlow ha acquisito solo il primo: crede 9.
    await giacenza(variante.id, 9);

    const letto = negozio.quantitaRemota(item, SEDE_REMOTA);
    const conConfronto = negozio.scriviConConfronto({
      inventoryItemId: item,
      locationId: SEDE_REMOTA,
      quantita: 9,
      atteso: letto!,
    });

    // ⛔ La scrittura RIESCE, e il negozio torna a 9 mentre la verità è 8.
    expect(conConfronto.scritta).toBe(true);
    expect(negozio.quantitaRemota(item, SEDE_REMOTA)).toBe(9);
    // ⛔ Un pezzo venduto è tornato disponibile: il confronto non lo ha visto.
    expect(negozio.quantitaRemota(item, SEDE_REMOTA)).not.toBe(8);
  });

  // ── P3 ───────────────────────────────────────────────────────────────────

  it('P3 · ✅ PROTETTO / ⛔ APERTO — vendita locale mentre manca un ordine online', async () => {
    // ⭐ **PROTETTO**: l'ordine online non acquisito ha già mosso il canale
    //    (10 → 9), quindi il canale non porta più la base confermata (10) e la
    //    scrittura viene rifiutata. La vendita online NON viene annullata.
    //
    // ⛔ **APERTO, e sono due cose distinte:**
    //
    //    1 · **La separazione delle origini.** A fermare la scrittura è stato
    //        il fatto che il canale si fosse MOSSO, non l'aver riconosciuto che
    //        8 mescola una vendita locale da 2 con un ordine online da 1. Se
    //        l'ordine online fosse arrivato PRIMA dell'ultima conferma, il
    //        confronto passerebbe e il pezzo venduto tornerebbe disponibile:
    //        è `P2`.
    //    2 · **L'aggiornamento locale non trasmesso.** La vendita locale da 2 è
    //        reale e resta da mandare: `P3-bis` misura che oggi non c'è ancora
    //        un posto che la dichiari «da trasmettere» in modo distinto.
    const variante = await importaVariante('P3');
    const item = variante.shopifyInventoryItemId!;
    negozio.impostaQuantitaRemota(item, SEDE_REMOTA, 10);
    // Un ordine online da 1, applicato sul canale e NON ancora acquisito.
    negozio.vendiSulCanale(item, SEDE_REMOTA, 1);
    // Una vendita locale da 2: VestiFlow scende a 8.
    await giacenza(variante.id, 8);
    await segnaUltimoInvio(variante.id, 10);
    negozio.azzeraChiamate();

    const esito = await creaPush().pushLevel(IDS.tenantA, variante.id, IDS.locA1);

    expect(esito.pushed).toBe(false);
    expect(esito.reason).toBe('divergenza_accertata');
    // ⭐ Il negozio resta a 9: l'ordine online da 1 non è stato annullato.
    expect(negozio.quantitaRemota(item, SEDE_REMOTA)).toBe(9);
    // ⛔ Ma il Disponibile locale è 8 e nessuno lo ha ancora trasmesso: il
    //    lavoro non è risolto, ed è dichiarato tale invece che dato per fatto.
    const livello = await prisma.inventoryLevel.findUniqueOrThrow({
      where: { variantId_locationId: { variantId: variante.id, locationId: IDS.locA1 } },
    });
    expect(livello.available).toBe(8);
    expect((await statoSync(variante.id))?.mismatchDetected).toBe(true);
  });

  it('P3-bis · ⛔ LIMITE — un invio RIFIUTATO non lascia traccia dell aggiornamento locale pendente', async () => {
    // ⚠️ È l'altra metà della regola: «nessuna perdita dell'effetto locale».
    //    Se un giorno il conflitto fermerà la scrittura, l'aggiornamento locale
    //    dovrà sopravvivere da qualche parte. Oggi non c'è quel posto.
    const variante = await importaVariante('P3bis');
    await giacenza(variante.id, 8);
    await segnaUltimoInvio(variante.id, 10);
    negozio.azzeraChiamate();
    negozio.guastaProssima('setInventoryQuantities', 1);

    const esito = await creaPush().pushLevel(IDS.tenantA, variante.id, IDS.locA1);

    expect(esito).toEqual({ pushed: false, reason: 'shopify_error' });
    const stato = await statoSync(variante.id);
    // ⛔ L'ultimo inviato resta quello vecchio — giusto — ma NIENTE dice che
    //    esista un aggiornamento locale da trasmettere: nessun marcatore,
    //    nessuna coda, nessuna riga. L'informazione è solo in una riga di log.
    expect(stato?.lastPushedAvailable).toBe(10);
    expect(stato?.mismatchDetected).toBe(false);
    expect(stato?.mismatchNote).toBeNull();
  });

  // ── P4 ───────────────────────────────────────────────────────────────────

  it('P4 · ⛔ LIMITE — una NOTIFICA DI INVENTARIO fa partire un reinvio che annulla l effetto del canale', async () => {
    // ⛔ **Perimetro corretto il 09/09/2026.** Questa prova percorre
    //    `applyInventoryLevelFromShopify`, cioè la notifica
    //    `inventory_levels/update` — NON l'acquisizione di un ordine. Erano
    //    stati confusi: sono due percorsi diversi, con esiti opposti, e il
    //    percorso degli ordini è misurato da `P6`.
    // ⚠️ **Nessun aggiornamento locale pendente, per costruzione**: la giacenza
    //    VestiFlow non viene toccata da questa prova dopo l'impostazione
    //    iniziale, e non esiste nessun invio precedente. Qualunque scrittura
    //    verso il canale è quindi attribuibile alla SOLA acquisizione.
    const variante = await importaVariante('P4');
    const item = variante.shopifyInventoryItemId!;
    await giacenza(variante.id, 5);
    negozio.impostaQuantitaRemota(item, SEDE_REMOTA, 5);
    // Un ordine applicato sul canale porta il negozio a 3.
    negozio.vendiSulCanale(item, SEDE_REMOTA, 2);
    negozio.azzeraChiamate();

    const riconciliazione = creaRiconciliazione();
    const push = creaPush(riconciliazione);
    const esito = await creaSync(push, riconciliazione).applyInventoryLevelFromShopify(
      IDS.tenantA,
      item,
      SEDE_REMOTA,
      3,
      'collaudo',
    );

    expect(esito).toBe('updated');
    // ⭐ **Il reinvio parte ancora — non è stato tolto niente al percorso — ma
    //    non arriva al canale**: su questa coppia non esiste un valore
    //    CONFERMATO da cui confrontare, quindi si ferma su `base_assente`.
    expect(await attendiChiamate('setInventoryQuantities', 1)).toBe(false);
    // ⭐ E l'effetto che il canale aveva già applicato NON è stato annullato.
    expect(negozio.quantitaRemota(item, SEDE_REMOTA)).toBe(3);

    // ⛔ **Ciò che resta aperto, e non va confuso con la protezione.** A
    //    fermare la scrittura è stata l'assenza di una base, cioè una
    //    protezione PROVVISORIA (`docs/24` §12.0, §12.9): non è il
    //    riconoscimento che quel 3 viene dal canale. Con una base confermata
    //    coincidente col remoto il confronto passerebbe — è la classe di `P2`.
    //
    // ⚠️ E il reinvio resta «lancia e dimentica»: il chiamante ha già risposto
    //    `updated` prima che la scrittura fosse conclusa, e un suo fallimento
    //    non sarebbe arrivato a nessuno.
  });

  it('P4-bis · ⛔ APERTO — con una base CONFERMATA pari al remoto, la notifica riscrive lo stesso', async () => {
    // ⛔ **La stessa notifica di `P4`, con una sola differenza: una base
    //    confermata che coincide con ciò che il canale porta.** Il confronto
    //    trova quello che si aspetta, la scrittura passa, e l'effetto che il
    //    canale aveva applicato viene annullato.
    //
    // ⭐ **Serve perché `P4` da sola direbbe una cosa falsa.** Lì la scrittura
    //    si ferma per `base_assente`, che è una protezione provvisoria e non ha
    //    niente a che vedere con la separazione delle origini. Senza questa
    //    prova, chiudere la decisione sulle quantità iniziali per sede
    //    riaprirebbe il difetto in silenzio.
    const variante = await importaVariante('P4bis');
    const item = variante.shopifyInventoryItemId!;
    await giacenza(variante.id, 5);
    negozio.impostaQuantitaRemota(item, SEDE_REMOTA, 5);
    // Un invio precedente CONFERMATO a 3, e il canale è a 3 dopo l'ordine.
    negozio.vendiSulCanale(item, SEDE_REMOTA, 2);
    await segnaUltimoInvio(variante.id, 3);
    negozio.azzeraChiamate();

    const riconciliazione = creaRiconciliazione();
    const push = creaPush(riconciliazione);
    const esito = await creaSync(push, riconciliazione).applyInventoryLevelFromShopify(
      IDS.tenantA,
      item,
      SEDE_REMOTA,
      3,
      'collaudo',
    );

    expect(esito).toBe('updated');
    expect(await attendiChiamate('setInventoryQuantities', 1)).toBe(true);
    // ⛔ Il confronto è passato — base 3, remoto 3 — e il canale è tornato a 5.
    expect(negozio.quantitaRemota(item, SEDE_REMOTA)).toBe(5);
  });

  // ── P5 ───────────────────────────────────────────────────────────────────

  it('P5 · ✅ PROTETTO — scrittura riuscita e risposta persa: il ritentativo NON riscrive', async () => {
    // ⭐ **Il ritentativo RIPETE l'operazione, non ne apre una nuova**: stessa
    //    chiave di idempotenza, stessa destinazione, stessi parametri. Shopify
    //    riconosce la chiave, non riapplica, e la vendita avvenuta nel
    //    frattempo sopravvive.
    //
    // ⛔ **Qui questa prova era un LIMITE**, e diceva: «il ritentativo non è
    //    riconosciuto come ripetizione della stessa operazione: nessuna chiave
    //    di idempotenza viaggia col REST». Il trasporto è passato a
    //    `inventorySetQuantities`, che la chiave la porta.
    //
    // ⚠️ **La finestra dura 24 ore**, che è quanto Shopify conserva le chiavi:
    //    oltre quel termine la ripetizione non è più deduplicata, e l'esito è
    //    `tentativo_incerto` — non un reinvio alla cieca.
    const variante = await importaVariante('P5');
    const item = variante.shopifyInventoryItemId!;
    await giacenza(variante.id, 7);
    await segnaUltimoInvio(variante.id, 5);
    negozio.impostaQuantitaRemota(item, SEDE_REMOTA, 5);
    negozio.azzeraChiamate();
    negozio.perdiProssimaRisposta('setInventoryQuantities', 1);

    const push = creaPush();
    const primo = await push.pushLevel(IDS.tenantA, variante.id, IDS.locA1);

    // ⛔ VestiFlow crede che sia fallita…
    expect(primo).toEqual({ pushed: false, reason: 'shopify_error' });
    expect((await statoSync(variante.id))?.lastPushedAvailable).toBe(5);
    // …ma il negozio è GIÀ cambiato.
    expect(negozio.quantitaRemota(item, SEDE_REMOTA)).toBe(7);

    // Fra il tentativo perduto e il ritentativo, una vendita online: 7 → 6.
    negozio.vendiSulCanale(item, SEDE_REMOTA, 1);

    const secondo = await push.pushLevel(IDS.tenantA, variante.id, IDS.locA1);

    // ⭐ **La vendita è SOPRAVVISSUTA**: il negozio è ancora a 6. È il cuore
    //    della prova — la seconda chiamata è partita e non ha riapplicato
    //    niente, perché portava la chiave della prima.
    expect(negozio.quantitaRemota(item, SEDE_REMOTA)).toBe(6);
    expect(negozio.chiamate.get('setInventoryQuantities')).toBe(2);
    // ⭐ **Due chiamate con la STESSA chiave.** Non è un difetto: è il modo in
    //    cui un esito ignoto si risolve senza rischiare di applicarlo due volte.
    expect(new Set(negozio.chiaviViste).size).toBe(1);

    // ⭐ Il tentativo si chiude e il confermato avanza a 7, che è ciò che il
    //    canale HA applicato. ⚠️ Il canale è a 6 perché ha venduto dopo: quel
    //    pezzo è un ordine da acquisire, non un errore di questo invio.
    const stato = await statoSync(variante.id);
    expect(stato?.lastPushedAvailable).toBe(7);
    expect(stato?.pendingKey).toBeNull();
    // ⛔ E il secondo giro non dichiara un invio nuovo: ha risolto quello aperto.
    expect(secondo.pushed).toBe(false);
    expect(secondo.reason).toBe('unchanged');
  });

  // ── P6 · il percorso applicativo degli ORDINI ────────────────────────────

  it('P6 · acquisire un ORDINE non provoca reinvio e non marca come trasmesso — ma confonde le origini', async () => {
    // ⭐ **CONFORME su due punti su tre, e va detto**: il modulo degli ordini
    //    non ha nessun riferimento ai canali, quindi l'acquisizione non può
    //    far partire niente; e l'ultimo inviato lo scrive solo un invio
    //    riuscito, quindi niente viene marcato come trasmesso.
    //
    // ⛔ **Il terzo punto è il limite**: dopo l'acquisizione, la differenza fra
    //    Disponibile e ultimo inviato MESCOLA l'aggiornamento locale pendente
    //    con l'effetto appena acquisito. Il pendente non è cancellato: è
    //    diventato indistinguibile, che per chi deve trasmetterlo è lo stesso.
    const variante = await importaVariante('P6');
    await giacenza(variante.id, 10);
    await segnaUltimoInvio(variante.id, 10);

    // Un aggiornamento locale PENDENTE: una vendita al banco da 2, mai trasmessa.
    await prisma.inventoryLevel.update({
      where: { variantId_locationId: { variantId: variante.id, locationId: IDS.locA1 } },
      data: { onHand: 8, available: 8 },
    });
    const primaDellOrdine = await statoSync(variante.id);
    expect(primaDellOrdine?.lastPushedAvailable).toBe(10);
    negozio.azzeraChiamate();

    // Ora arriva un ordine online da 1, per il percorso VERO.
    const ordine = await prisma.salesOrder.create({
      data: {
        tenantId: IDS.tenantA,
        orderNumber: 'SH-P6',
        customerName: 'Cliente online',
        placedAt: new Date(),
        source: SalesOrderSource.shopify_online,
        locationId: IDS.locA1,
      },
    });
    const riga = await prisma.salesOrderLine.create({
      data: {
        orderId: ordine.id,
        lineNumber: 1,
        variantId: variante.id,
        sku: variante.sku ?? 'P6',
        title: 'Riga di canale',
        // ⚠️ La colonna ha DEFAULT '': senza il campo la scrittura riesce e la
        //    variante sparisce in silenzio. Lo prende `check:variant-label`.
        variantLabel: 'M',
        quantity: 1,
        unitPriceMinor: 1000,
        totalMinor: 1000,
      },
    });

    const reservations = new StockReservationService(prisma as never);
    const ciclo = new OnlineOrderLifecycleService(
      prisma as never,
      reservations,
      new OnlineSaleFulfillmentService(reservations),
    );
    const esito = await ciclo.handle({
      tenantId: IDS.tenantA,
      channel: SalesOrderSource.shopify_online,
      type: OnlineOrderEventType.online_order_created,
      salesOrderId: ordine.id,
      externalOrderId: 'EXT-P6',
      locationId: IDS.locA1,
      lines: [
        {
          salesOrderLineId: riga.id,
          variantId: variante.id,
          sku: variante.sku ?? 'P6',
          quantity: 1,
        },
      ],
    });

    expect(esito).toBe('applied');
    // ⭐ Nessuna scrittura verso il canale: l'acquisizione non reinvia niente.
    expect(negozio.totaleChiamate()).toBe(0);
    // ⭐ E niente è stato marcato come trasmesso.
    expect((await statoSync(variante.id))?.lastPushedAvailable).toBe(10);

    // ⛔ Ma il Disponibile è sceso ancora, per l'IMPEGNO appena acquisito.
    const livello = await prisma.inventoryLevel.findUniqueOrThrow({
      where: { variantId_locationId: { variantId: variante.id, locationId: IDS.locA1 } },
    });
    expect(livello.committed).toBe(1);
    expect(livello.available).toBe(7);
    // ⛔ **La differenza ora vale −3 e mescola due origini**: −2 locale da
    //    trasmettere, −1 di canale già applicato là. Nessun dato distingue le
    //    due parti, e trasmettere −3 annullerebbe l'ordine appena acquisito.
    expect(livello.available - (primaDellOrdine?.lastPushedAvailable ?? 0)).toBe(-3);
  });

  // ── P7 · la sequenza del candidato ───────────────────────────────────────

  it('P7 · risposta persa poi nuova modifica locale: con i dati di OGGI non si arriva a 12', async () => {
    // ⭐ **La sequenza chiesta dal proprietario**: 10 → locale −1 applicata da
    //    Shopify con risposta persa → nuova locale +3 → riavvio e ritentativo.
    //    Il risultato deve essere 12, senza duplicare −1 né perdere +3.
    const variante = await importaVariante('P7');
    const item = variante.shopifyInventoryItemId!;
    negozio.impostaQuantitaRemota(item, SEDE_REMOTA, 10);
    await giacenza(variante.id, 10);
    await segnaUltimoInvio(variante.id, 10);

    // 1 · modifica locale −1, inviata: Shopify la applica, la risposta si perde.
    await prisma.inventoryLevel.update({
      where: { variantId_locationId: { variantId: variante.id, locationId: IDS.locA1 } },
      data: { onHand: 9, available: 9 },
    });
    negozio.azzeraChiamate();
    negozio.perdiProssimaRisposta('setInventoryQuantities', 1);
    const primo = await creaPush().pushLevel(IDS.tenantA, variante.id, IDS.locA1);
    expect(primo).toEqual({ pushed: false, reason: 'shopify_error' });
    expect(negozio.quantitaRemota(item, SEDE_REMOTA)).toBe(9);

    // 2 · nuova modifica locale +3 (un carico): Disponibile 12.
    await prisma.inventoryLevel.update({
      where: { variantId_locationId: { variantId: variante.id, locationId: IDS.locA1 } },
      data: { onHand: 12, available: 12 },
    });

    // 3 · riavvio: si ripartirebbe DA QUI, con i soli dati persistiti.
    const stato = await statoSync(variante.id);
    expect(stato?.lastPushedAvailable).toBe(10);

    // ⛔ **Che cosa dicono i dati di oggi**: l'ultimo inviato è 10, il
    //    Disponibile è 12. Nessuna riga registra che un invio da 9 sia stato
    //    TENTATO, né con quale chiave. Le due riparazioni possibili sono
    //    entrambe sbagliate, e questa prova le calcola:
    const deltaDaiDatiDiOggi = 12 - (stato?.lastPushedAvailable ?? 0);
    expect(deltaDaiDatiDiOggi).toBe(2);
    // ⛔ un delta di +2 su un negozio che sta a 9 dà 11, non 12: il −1 già
    //    applicato verrebbe contato una seconda volta.
    expect((negozio.quantitaRemota(item, SEDE_REMOTA) ?? 0) + deltaDaiDatiDiOggi).toBe(11);
    // ⛔ e un assoluto darebbe il numero giusto sovrascrivendo: è la mossa che
    //    `P2` dimostra dannosa in presenza di vendite non acquisite.
  });

  it('P7-bis · la stessa sequenza CON il tentativo registrato e la chiave: arriva a 12', async () => {
    // ⭐ **Verifica del CANDIDATO, non del codice applicativo.** La contabilità
    //    del tentativo è modellata QUI, nella prova: serve a stabilire quali
    //    dati basterebbero, non a introdurre un comportamento.
    const variante = await importaVariante('P7bis');
    const item = variante.shopifyInventoryItemId!;
    negozio.impostaQuantitaRemota(item, SEDE_REMOTA, 10);

    // Il minimo che il candidato deve persistere, oltre a ciò che già esiste.
    const tentativo = { valore: 9, base: 10, chiave: 'P7bis:1' };

    // 1 · invio con confronto e chiave: applicato, ma la risposta si perde.
    negozio.scriviConConfronto({
      inventoryItemId: item,
      locationId: SEDE_REMOTA,
      quantita: tentativo.valore,
      atteso: tentativo.base,
      chiave: tentativo.chiave,
    });
    expect(negozio.quantitaRemota(item, SEDE_REMOTA)).toBe(9);
    // VestiFlow non sa se sia avvenuto: l'ultimo CONFERMATO resta 10.

    // 2 · nuova modifica locale +3: il valore da raggiungere diventa 12.

    // 3 · riavvio e ritentativo: PRIMA si risolve il tentativo in sospeso,
    //     ripetendo la STESSA operazione con la STESSA chiave.
    const ripetuto = negozio.scriviConConfronto({
      inventoryItemId: item,
      locationId: SEDE_REMOTA,
      quantita: tentativo.valore,
      atteso: tentativo.base,
      chiave: tentativo.chiave,
    });
    // ⭐ Riconosciuta come ripetizione: nessuna seconda applicazione.
    expect(ripetuto.ripetuta).toBe(true);
    expect(negozio.quantitaRemota(item, SEDE_REMOTA)).toBe(9);

    // 4 · risolto il dubbio, l'ultimo confermato è 9: la nuova operazione parte
    //     da lì e porta a 12.
    const nuovo = negozio.scriviConConfronto({
      inventoryItemId: item,
      locationId: SEDE_REMOTA,
      quantita: 12,
      atteso: 9,
      chiave: 'P7bis:2',
    });

    expect(nuovo.scritta).toBe(true);
    // ⭐ **12**: il −1 non è stato duplicato e il +3 non è andato perso.
    expect(negozio.quantitaRemota(item, SEDE_REMOTA)).toBe(12);
  });

  it('P7-ter · due esecutori concorrenti: la riga esistente basta a farne passare UNO SOLO', async () => {
    // ⭐ La coppia variante × sede è già UNICA, quindi un aggiornamento
    //    condizionato sul valore letto è una presa atomica: non serve un
    //    lucchetto nuovo, e non serve una coda.
    const variante = await importaVariante('P7ter');
    await giacenza(variante.id, 12);
    await segnaUltimoInvio(variante.id, 10);

    const prendi = () =>
      prisma.shopifyInventorySyncState.updateMany({
        where: {
          tenantId: IDS.tenantA,
          variantId: variante.id,
          locationId: IDS.locA1,
          lastPushedAvailable: 10,
        },
        data: { lastPushedAvailable: 12 },
      });

    const [primo, secondo] = await Promise.all([prendi(), prendi()]);

    // ⭐ Esattamente uno dei due ha preso la riga.
    expect(primo.count + secondo.count).toBe(1);
  });

  // ── P8 · il passaggio sotto zero ─────────────────────────────────────────

  it('P8 · ✅ CONFORME — sotto zero il pubblicato resta 0, e un delta sul grezzo sarebbe sbagliato', async () => {
    // ⛔ **La regola del pubblicabile NON si cambia per far tornare un delta**:
    //    resta il massimo fra zero e il Disponibile. Il delta, se un giorno
    //    arriverà, si calcola sui valori PUBBLICATI, non su quelli grezzi.
    const variante = await importaVariante('P8');
    const item = variante.shopifyInventoryItemId!;
    negozio.impostaQuantitaRemota(item, SEDE_REMOTA, 0);
    await giacenza(variante.id, 0);
    await prisma.inventoryLevel.update({
      where: { variantId_locationId: { variantId: variante.id, locationId: IDS.locA1 } },
      data: { onHand: -3, available: -3 },
    });
    await segnaUltimoInvio(variante.id, 0);

    // Un carico di 2: Disponibile passa da −3 a −1.
    await prisma.inventoryLevel.update({
      where: { variantId_locationId: { variantId: variante.id, locationId: IDS.locA1 } },
      data: { onHand: -1, available: -1 },
    });
    negozio.azzeraChiamate();

    const esito = await creaPush().pushLevel(IDS.tenantA, variante.id, IDS.locA1);

    // ⭐ Nessun invio: il pubblicabile è 0 prima e 0 dopo.
    expect(esito).toEqual({ pushed: false, reason: 'unchanged', publishableAvailable: 0 });
    expect(negozio.quantitaRemota(item, SEDE_REMOTA)).toBe(0);
    // ⛔ Un delta calcolato sul GREZZO avrebbe mandato +2, portando il negozio
    //    a 2: merce che non esiste. La prova fissa la differenza.
    const deltaSulGrezzo = -1 - -3;
    expect(deltaSulGrezzo).toBe(2);
    expect(negozio.quantitaRemota(item, SEDE_REMOTA)).not.toBe(2);
  });

  // ── P9 · le due LETTURE non sono coerenti fra loro ────────────────────────
  //
  // ⛔ **Il push legge il Disponibile e lo stato sync in due momenti diversi**,
  //    e fra i due non c'è niente: due `findUnique` separati, fuori da una
  //    transazione. Quindi prepara un invio combinando un valore di `t0` con
  //    uno di `t1` — una coppia che **non è mai esistita**.
  //
  // ⚠️ **Non si chiude mettendo le sole SCRITTURE nella stessa transazione**:
  //    le scritture sono già atomiche (`increment` in transazione). È la
  //    LETTURA a essere spezzata.

  /**
   * Un prisma che esegue `azione` **subito dopo** la lettura del Disponibile.
   *
   * ⭐ È il modo di rendere deterministica una finestra che nella realtà si
   *    apre per caso. Non simula niente: il servizio vero fa le sue due letture
   *    vere, e in mezzo succede una cosa vera.
   */
  /**
   * Come sopra, ma l'azione si ripete a OGNI lettura per `volte` volte.
   *
   * ⭐ Serve a esaurire i giri della presa in modo deterministico: ogni giro
   *    rilegge, e ogni rilettura trova la coppia mossa di nuovo.
   */
  function prismaConInterposizioneRipetuta(azione: () => Promise<void>, volte: number) {
    let fatte = 0;
    return new Proxy(prisma as object, {
      get(bersaglio, chiave, ricevitore) {
        if (chiave !== '$queryRaw') {
          return Reflect.get(bersaglio, chiave, ricevitore) as unknown;
        }
        const originale = Reflect.get(bersaglio, chiave, ricevitore) as (
          ...a: unknown[]
        ) => Promise<unknown>;
        return async (...argomenti: unknown[]) => {
          const letto: unknown = await originale.apply(bersaglio, argomenti);
          if (fatte < volte) {
            fatte += 1;
            await azione();
          }
          return letto;
        };
      },
    });
  }

  function prismaConInterposizione(azione: () => Promise<void>) {
    let fatta = false;
    return new Proxy(prisma as object, {
      get(bersaglio, chiave, ricevitore) {
        // ⭐ **Si intercetta la LETTURA COERENTE**, cioè `$queryRaw`: è lì che il
        //    push prende Disponibile e stato insieme. ⚠️ Prima si intercettava
        //    `inventoryLevel.findUnique`, e quando la lettura è diventata unica
        //    l'interposizione ha smesso di scattare **in silenzio** — la prova
        //    sarebbe rimasta verde misurando un mondo senza concorrenza.
        if (chiave !== '$queryRaw') {
          return Reflect.get(bersaglio, chiave, ricevitore) as unknown;
        }
        const originale = Reflect.get(bersaglio, chiave, ricevitore) as (
          ...a: unknown[]
        ) => Promise<unknown>;
        return async (...argomenti: unknown[]) => {
          const letto: unknown = await originale.apply(bersaglio, argomenti);
          if (!fatta) {
            fatta = true;
            await azione();
          }
          return letto;
        };
      },
    });
  }

  it('P9 · ✅ PROTETTO — nessuna vendita annullata da un valore vecchio', async () => {
    // ⛔ **Il difetto che questa prova ha riprodotto**, e che era di oggi:
    //    Disponibile 10 e confermato 8. Il push leggeva 10; nel frattempo una
    //    vendita locale portava il Disponibile a 9 e un secondo invio lo
    //    confermava. Il push rileggeva lo stato — ora 9 — e concludeva «mando
    //    10, la base è 9». Il canale ERA a 9, quindi il confronto **passava** e
    //    la vendita appena fatta veniva annullata.
    //
    // ⭐ **Adesso le due letture sono una sola**, quindi il push lavora su
    //    valori dello stesso istante; e la **presa condizionata** si accorge che
    //    nel frattempo si sono mossi, rilegge e rivaluta. Il canale resta a 9.
    const variante = await importaVariante('P9');
    const item = variante.shopifyInventoryItemId!;
    negozio.impostaQuantitaRemota(item, SEDE_REMOTA, 8);
    await giacenza(variante.id, 10);
    await segnaUltimoInvio(variante.id, 8);
    negozio.azzeraChiamate();

    const interposto = prismaConInterposizione(async () => {
      // Vendita locale di 1: il Disponibile scende a 9…
      await prisma.inventoryLevel.update({
        where: { variantId_locationId: { variantId: variante.id, locationId: IDS.locA1 } },
        data: { onHand: 9, available: 9 },
      });
      // …e un secondo invio la porta al canale e la conferma.
      await creaPush().pushLevel(IDS.tenantA, variante.id, IDS.locA1);
    });

    const push = new ShopifyInventoryPushService(
      interposto as never,
      negozio.oauth() as never,
      negozio.admin() as never,
      negozio.graphql() as never,
      { touchSync: vi.fn() } as never,
      creaRiconciliazione(),
      storico,
      registro,
    );
    const esito = await push.pushLevel(IDS.tenantA, variante.id, IDS.locA1);

    // ⭐ **La vendita NON è stata annullata**: il canale porta 9, non 10.
    expect(negozio.quantitaRemota(item, SEDE_REMOTA)).toBe(9);
    // ⭐ E il push non ha scritto il valore vecchio: rilegge, trova 9 = 9 e si
    //    ferma dicendo «invariata», che a quel punto è **vero**.
    expect(esito).toEqual({ pushed: false, reason: 'unchanged', publishableAvailable: 9 });

    // ⭐ Locale e canale coincidono: nessuna divergenza fabbricata dal push.
    const livello = await prisma.inventoryLevel.findUniqueOrThrow({
      where: { variantId_locationId: { variantId: variante.id, locationId: IDS.locA1 } },
    });
    expect(livello.available).toBe(9);
    expect((await statoSync(variante.id))?.lastPushedAvailable).toBe(9);
  });

  it('P10 · ✅ PROTETTO — esauriti i giri, il lavoro si conserva e il ritentativo lo trova', async () => {
    // ⛔ **La frase che questa prova ha smentito**: «quel valore partirà dal
    //    push dell'operazione sopravvenuta». Non era una garanzia — l'altro
    //    push può essersi già concluso, fermarsi su un tentativo in corso o
    //    interrompersi, e nessuno ripianificava questo valore.
    //
    // ⭐ **Adesso il lavoro si conserva su `localPushPending`**, e la coda del
    //    ritentativo lo ritrova. ⛔ Su una colonna sua: `mismatchDetected`
    //    afferma «il canale porta un numero diverso», e qui il canale non è
    //    stato guardato affatto.
    //
    // Qui si esauriscono i tre giri, poi **non succede più niente**: nessun
    // altro esecutore, nessuna modifica ulteriore.
    const variante = await importaVariante('P10');
    const item = variante.shopifyInventoryItemId!;
    negozio.impostaQuantitaRemota(item, SEDE_REMOTA, 8);
    await giacenza(variante.id, 10);
    await segnaUltimoInvio(variante.id, 8);
    negozio.azzeraChiamate();

    // Ogni lettura trova la coppia mossa di nuovo: i tre giri si esauriscono.
    let prossimo = 11;
    const interposto = prismaConInterposizioneRipetuta(async () => {
      await prisma.inventoryLevel.update({
        where: { variantId_locationId: { variantId: variante.id, locationId: IDS.locA1 } },
        data: { onHand: prossimo, available: prossimo },
      });
      prossimo += 1;
    }, 4);
    const push = new ShopifyInventoryPushService(
      interposto as never,
      negozio.oauth() as never,
      negozio.admin() as never,
      negozio.graphql() as never,
      { touchSync: vi.fn() } as never,
      creaRiconciliazione(),
      storico,
      registro,
    );

    const esito = await push.pushLevel(IDS.tenantA, variante.id, IDS.locA1);

    expect(esito.pushed).toBe(false);
    expect(esito.reason).toBe('stato_cambiato');
    // ⛔ Niente è stato scritto sul canale: giusto, ma il valore locale è
    //    diverso dal confermato e resta da trasmettere.
    expect(negozio.quantitaRemota(item, SEDE_REMOTA)).toBe(8);
    const livello = await prisma.inventoryLevel.findUniqueOrThrow({
      where: { variantId_locationId: { variantId: variante.id, locationId: IDS.locA1 } },
    });
    const stato = await statoSync(variante.id);
    expect(stato?.lastPushedAvailable).toBe(8);
    expect(livello.available).not.toBe(8);

    // ── il lavoro è conservato, e i due stati restano DISTINTI ───────────
    //
    // ⛔ **`mismatchDetected` resta SPENTO**: il canale non è stato guardato.
    expect(stato?.mismatchDetected).toBe(false);
    expect(stato?.mismatchNote).toBeNull();
    expect(stato?.pendingKey).toBeNull();
    // ⭐ **E il pendente è acceso, su una colonna sua.**
    expect(stato?.localPushPending).toBe(true);

    // ── un esecutore NUOVO trova il lavoro e trasmette il valore corrente ──
    //
    // ⭐ Nessuna vendita, nessuna modifica: solo il ritentativo che esiste già,
    //    con servizi costruiti da zero — cioè la situazione dopo un riavvio.
    const ripubblicazione = new ShopifyInventoryRepublishService(
      prisma as never,
      creaPush() as never,
    );
    const passata = await ripubblicazione.retryPending(IDS.tenantA);

    expect(passata.attempted).toBe(1);
    expect(passata.republished).toBe(1);
    // ⭐ **Il valore CORRENTE, non quello di quando il push fallì.**
    expect(negozio.quantitaRemota(item, SEDE_REMOTA)).toBe(livello.available);

    const dopo = await statoSync(variante.id);
    expect(dopo?.lastPushedAvailable).toBe(livello.available);
    // ⭐ Il pendente si spegne con la conferma: la coda non lo ripesca più.
    expect(dopo?.localPushPending).toBe(false);
    expect(passata.remaining).toBe(0);
  });

  it('P10-bis · ✅ il pendente si spegne anche quando NON c è più niente da mandare', async () => {
    // ⭐ Se fra il segnale e il ritentativo qualcuno ha già trasmesso quel
    //    valore, la coda deve smettere di ripescare la riga. ⛔ Altrimenti
    //    resterebbe accesa per sempre, e ogni passata la riprenderebbe per
    //    rispondere «invariata».
    const variante = await importaVariante('P10bis');
    const item = variante.shopifyInventoryItemId!;
    negozio.impostaQuantitaRemota(item, SEDE_REMOTA, 9);
    await giacenza(variante.id, 9);
    await segnaUltimoInvio(variante.id, 9);
    // Un pendente acceso su una riga che è però già allineata.
    await prisma.shopifyInventorySyncState.updateMany({
      where: { tenantId: IDS.tenantA, variantId: variante.id, locationId: IDS.locA1 },
      data: { localPushPending: true },
    });
    negozio.azzeraChiamate();

    const esito = await creaPush().pushLevel(IDS.tenantA, variante.id, IDS.locA1);

    expect(esito).toEqual({ pushed: false, reason: 'unchanged', publishableAvailable: 9 });
    expect(negozio.totaleChiamate()).toBe(0);
    // ⭐ Spento: non c'era niente da trasmettere.
    expect((await statoSync(variante.id))?.localPushPending).toBe(false);
  });

  it('P10-quater · ⛔ LIMITE — lo spegnimento guarda il CONFERMATO, non il Disponibile', async () => {
    // ⛔ **La finestra che `P10-ter` NON copre.** Lì il valore passato era
    //    diverso dal confermato, quindi la condizione non scattava. Qui invece
    //    combacia — e a muoversi è il **Disponibile**, che la condizione non
    //    guarda affatto.
    //
    //    lettura      available 9, confermato 9  → «invariata», spengo il pendente
    //    nel mezzo    available 8                 ← c'è di nuovo lavoro
    //    spegnimento  where lastPushedAvailable = 9 → combacia → SPEGNE
    //
    // ⚠️ E il lavoro nuovo (9 → 8) resta senza pendente e senza marcatore:
    //    esattamente lo stato che `P10` esiste per impedire.
    const variante = await importaVariante('P10quater');
    const item = variante.shopifyInventoryItemId!;
    negozio.impostaQuantitaRemota(item, SEDE_REMOTA, 9);
    await giacenza(variante.id, 9);
    await segnaUltimoInvio(variante.id, 9);
    await prisma.shopifyInventorySyncState.updateMany({
      where: { tenantId: IDS.tenantA, variantId: variante.id, locationId: IDS.locA1 },
      data: { localPushPending: true },
    });
    negozio.azzeraChiamate();

    // Una vendita locale cade DOPO la lettura coerente e PRIMA dello spegnimento.
    const interposto = prismaConInterposizione(async () => {
      await prisma.inventoryLevel.update({
        where: { variantId_locationId: { variantId: variante.id, locationId: IDS.locA1 } },
        data: { onHand: 8, available: 8 },
      });
    });
    const push = new ShopifyInventoryPushService(
      interposto as never,
      negozio.oauth() as never,
      negozio.admin() as never,
      negozio.graphql() as never,
      { touchSync: vi.fn() } as never,
      creaRiconciliazione(),
      storico,
      registro,
    );

    const esito = await push.pushLevel(IDS.tenantA, variante.id, IDS.locA1);
    expect(esito).toEqual({ pushed: false, reason: 'unchanged', publishableAvailable: 9 });

    const stato = await statoSync(variante.id);
    const livello = await prisma.inventoryLevel.findUniqueOrThrow({
      where: { variantId_locationId: { variantId: variante.id, locationId: IDS.locA1 } },
    });

    // ⛔ **Il difetto**: c'è lavoro (8 ≠ 9) e il pendente è stato spento.
    expect(livello.available).toBe(8);
    expect(stato?.lastPushedAvailable).toBe(9);
    expect(stato?.localPushPending).toBe(false);
    expect(stato?.mismatchDetected).toBe(false);

    // ⛔ E la coda non lo seleziona: il recupero non lo vede.
    const ripubblicazione = new ShopifyInventoryRepublishService(
      prisma as never,
      creaPush() as never,
    );
    const passata = await ripubblicazione.retryPending(IDS.tenantA);
    expect(passata.attempted).toBe(0);
    expect(negozio.quantitaRemota(item, SEDE_REMOTA)).toBe(9);
  });

  it('P10-ter · ⛔ una conferma TARDIVA non spegne il pendente di qualcun altro', async () => {
    // ⛔ **Lo spegnimento è condizionato al valore**, non alla sola coppia. Fra
    //    la constatazione «non c'è niente da mandare» e la scrittura può
    //    arrivare un'altra operazione locale: spegnere alla cieca cancellerebbe
    //    un lavoro appena tornato a esistere.
    const variante = await importaVariante('P10ter');
    await giacenza(variante.id, 9);
    await segnaUltimoInvio(variante.id, 9);
    await prisma.shopifyInventorySyncState.updateMany({
      where: { tenantId: IDS.tenantA, variantId: variante.id, locationId: IDS.locA1 },
      data: { localPushPending: true },
    });

    // Una conferma che riguarda un ALTRO valore: non è il caso constatato.
    const push = creaPush() as unknown as {
      spegniInvioLocalePendente: (t: string, v: string, l: string, p: number) => Promise<void>;
    };
    await push.spegniInvioLocalePendente(IDS.tenantA, variante.id, IDS.locA1, 7);

    // ⭐ Ancora acceso: il valore non corrispondeva, quindi non era il proprio caso.
    expect((await statoSync(variante.id))?.localPushPending).toBe(true);
  });

  it('P9-ter · ✅ PROTETTO — cambia SOLO il Disponibile, la base no: la presa se ne accorge', async () => {
    // ⛔ **Controllare la sola BASE non basta, ed è il caso che lo dimostra.**
    //    Un'operazione locale muove il Disponibile e **non** tocca l'ultimo
    //    confermato: con la sola condizione sulla base la presa passerebbe, e
    //    si manderebbe al canale un totale che il magazzino non ha più.
    //
    // ⭐ Qui nessun secondo invio conferma niente: la base resta 8 dall'inizio
    //    alla fine. A cambiare è **solo** il Disponibile, da 10 a 9.
    const variante = await importaVariante('P9ter');
    const item = variante.shopifyInventoryItemId!;
    negozio.impostaQuantitaRemota(item, SEDE_REMOTA, 8);
    await giacenza(variante.id, 10);
    await segnaUltimoInvio(variante.id, 8);
    negozio.azzeraChiamate();

    const interposto = prismaConInterposizione(async () => {
      await prisma.inventoryLevel.update({
        where: { variantId_locationId: { variantId: variante.id, locationId: IDS.locA1 } },
        data: { onHand: 9, available: 9 },
      });
    });
    const push = new ShopifyInventoryPushService(
      interposto as never,
      negozio.oauth() as never,
      negozio.admin() as never,
      negozio.graphql() as never,
      { touchSync: vi.fn() } as never,
      creaRiconciliazione(),
      storico,
      registro,
    );

    const esito = await push.pushLevel(IDS.tenantA, variante.id, IDS.locA1);

    // ⭐ **Parte 9, non 10.** La presa ha rifiutato il valore letto prima, il
    //    push ha riletto e ha mandato quello vero.
    expect(esito.pushed).toBe(true);
    expect(esito.publishableAvailable).toBe(9);
    expect(negozio.quantitaRemota(item, SEDE_REMOTA)).toBe(9);
    expect(negozio.quantitaMandate).toEqual([
      { inventoryItemId: item, locationId: SEDE_REMOTA, available: 9 },
    ]);
    expect((await statoSync(variante.id))?.lastPushedAvailable).toBe(9);
  });

  it('P9-bis · ✅ PROTETTO — la modifica arrivata durante il recupero viene trasmessa', async () => {
    // ⛔ **La finestra più larga di tutte**, e il difetto che questa prova ha
    //    riprodotto: quando c'è un tentativo aperto, fra la lettura del
    //    Disponibile e la rilettura passa una **chiamata di rete a Shopify** —
    //    decine o centinaia di millisecondi. La rilettura riguardava il solo
    //    STATO, quindi il `publishable` restava quello di prima e il push
    //    rispondeva «invariata» con una vendita da trasmettere.
    //
    // ⚠️ **Non era un ritardo: era una perdita.** Il push è post-commit
    //    sull'operazione locale, e quell'operazione il suo push l'ha già avuto.
    //
    // ⭐ Adesso si rilegge la **coppia** e si ricalcola il pubblicabile.
    const variante = await importaVariante('P9bis');
    const item = variante.shopifyInventoryItemId!;
    negozio.impostaQuantitaRemota(item, SEDE_REMOTA, 8);
    await giacenza(variante.id, 10);
    await segnaUltimoInvio(variante.id, 8);

    // Un tentativo aperto: la risposta si perde, l'effetto è applicato.
    negozio.perdiProssimaRisposta('setInventoryQuantities', 1);
    await creaPush().pushLevel(IDS.tenantA, variante.id, IDS.locA1);
    expect(negozio.quantitaRemota(item, SEDE_REMOTA)).toBe(10);

    negozio.azzeraChiamate();

    // La vendita locale cade DENTRO la finestra: subito dopo la lettura del
    // Disponibile, mentre la ripetizione sta parlando col canale.
    const interposto = prismaConInterposizione(async () => {
      await prisma.inventoryLevel.update({
        where: { variantId_locationId: { variantId: variante.id, locationId: IDS.locA1 } },
        data: { onHand: 9, available: 9 },
      });
    });
    const push = new ShopifyInventoryPushService(
      interposto as never,
      negozio.oauth() as never,
      negozio.admin() as never,
      negozio.graphql() as never,
      { touchSync: vi.fn() } as never,
      creaRiconciliazione(),
      storico,
      registro,
    );

    const esito = await push.pushLevel(IDS.tenantA, variante.id, IDS.locA1);

    // ⭐ **Il tentativo si risolve e conferma 10; poi la coppia RILETTA dice
    //    Disponibile 9, e il 9 PARTE.**
    expect(esito.pushed).toBe(true);
    expect(esito.publishableAvailable).toBe(9);
    expect(negozio.quantitaRemota(item, SEDE_REMOTA)).toBe(9);
    const livello = await prisma.inventoryLevel.findUniqueOrThrow({
      where: { variantId_locationId: { variantId: variante.id, locationId: IDS.locA1 } },
    });
    expect(livello.available).toBe(9);
    expect((await statoSync(variante.id))?.lastPushedAvailable).toBe(9);
    // ⭐ Il tentativo aperto è chiuso: non ne resta uno appeso.
    expect((await statoSync(variante.id))?.pendingKey).toBeNull();
  });
});
